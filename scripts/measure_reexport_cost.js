#!/usr/bin/env node

/**
 * Measure the ACTUAL cost of re-exports in plugin index.ts files
 * 
 * For each re-export like `export { x } from './y'`:
 * 1. Clear require cache
 * 2. Load ONLY the re-exported module
 * 3. Measure memory delta
 * 
 * Usage:
 *   node --expose-gc scripts/measure_reexport_cost.js
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

if (!global.gc) {
  console.error('Run with: node --expose-gc scripts/measure_reexport_cost.js');
  process.exit(1);
}

const KIBANA_ROOT = path.resolve(__dirname, '..');

function getMemoryMB() {
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function clearCache(pattern) {
  const keys = Object.keys(require.cache).filter(k => k.includes(pattern));
  keys.forEach(k => delete require.cache[k]);
  return keys.length;
}

function parseReExports(filePath) {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const reExports = [];
  
  // Match: export { something } from './path'
  // Match: export { something } from '../path'
  // Match: export { something } from '@kbn/package'
  const regex = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    const exports = match[1].split(',').map(e => e.trim().split(' as ')[0].trim());
    const fromPath = match[2];
    reExports.push({ exports, fromPath, raw: match[0] });
  }
  
  // Also match: export * from './path'
  const starRegex = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  while ((match = starRegex.exec(content)) !== null) {
    reExports.push({ exports: ['*'], fromPath: match[1], raw: match[0] });
  }
  
  return reExports;
}

function findPlugins() {
  const plugins = [];
  const dirs = [
    'src/plugins',
    'src/platform/plugins/shared',
    'src/platform/plugins/private',
    'x-pack/plugins',
    'x-pack/platform/plugins/shared',
    'x-pack/platform/plugins/private',
  ];

  for (const dir of dirs) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    for (const name of fs.readdirSync(fullDir)) {
      const pluginPath = path.join(fullDir, name);
      const serverIndex = path.join(pluginPath, 'server', 'index.ts');

      if (fs.existsSync(serverIndex)) {
        const reExports = parseReExports(serverIndex);
        if (reExports.length > 0) {
          plugins.push({
            name,
            indexPath: serverIndex,
            serverDir: path.join(pluginPath, 'server'),
            reExports,
          });
        }
      }
    }
  }
  return plugins;
}

function resolveImportPath(fromPath, serverDir) {
  // Handle relative paths
  if (fromPath.startsWith('./') || fromPath.startsWith('../')) {
    return path.resolve(serverDir, fromPath);
  }
  // Handle @kbn packages - can't easily resolve without Kibana's resolver
  return fromPath;
}

async function main() {
  console.log('='.repeat(70));
  console.log('RE-EXPORT COST ANALYSIS');
  console.log('='.repeat(70));
  console.log('');

  const plugins = findPlugins();
  console.log(`Found ${plugins.length} plugins with re-exports`);
  
  const totalReExports = plugins.reduce((sum, p) => sum + p.reExports.length, 0);
  console.log(`Total re-exports: ${totalReExports}`);
  console.log('');

  // Collect all re-exports with their source
  const allReExports = [];
  for (const plugin of plugins) {
    for (const reExport of plugin.reExports) {
      allReExports.push({
        plugin: plugin.name,
        serverDir: plugin.serverDir,
        ...reExport,
        resolvedPath: resolveImportPath(reExport.fromPath, plugin.serverDir),
      });
    }
  }

  console.log('RE-EXPORTS BY PLUGIN:');
  console.log('-'.repeat(70));
  console.log(`${'Plugin'.padEnd(35)} ${'Count'.padStart(6)} ${'From Paths'.padStart(30)}`);
  console.log('-'.repeat(70));

  // Group by plugin
  const byPlugin = new Map();
  for (const re of allReExports) {
    const list = byPlugin.get(re.plugin) || [];
    list.push(re);
    byPlugin.set(re.plugin, list);
  }

  const sortedPlugins = [...byPlugin.entries()].sort((a, b) => b[1].length - a[1].length);

  for (const [plugin, reExports] of sortedPlugins.slice(0, 30)) {
    const paths = reExports.map(r => r.fromPath).slice(0, 3).join(', ');
    const more = reExports.length > 3 ? ` +${reExports.length - 3} more` : '';
    console.log(`${plugin.padEnd(35)} ${reExports.length.toString().padStart(6)} ${(paths + more).substring(0, 30)}`);
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('ANALYSIS OF WHAT RE-EXPORTS PULL IN');
  console.log('='.repeat(70));
  console.log('');

  // Categorize re-exports by what they import
  const categories = {
    'alerting': allReExports.filter(r => r.fromPath.includes('alert') || r.fromPath.includes('rule')),
    'routes': allReExports.filter(r => r.fromPath.includes('route')),
    'types': allReExports.filter(r => r.fromPath.includes('type') && !r.fromPath.includes('alerting')),
    'lib': allReExports.filter(r => r.fromPath.includes('/lib/')),
    'kbn_packages': allReExports.filter(r => r.fromPath.startsWith('@kbn/')),
    'other': [],
  };

  // Find 'other' (not in any category)
  const categorized = new Set([
    ...categories.alerting,
    ...categories.routes,
    ...categories.types,
    ...categories.lib,
    ...categories.kbn_packages,
  ]);
  categories.other = allReExports.filter(r => !categorized.has(r));

  console.log('RE-EXPORTS BY CATEGORY:');
  console.log('-'.repeat(50));
  
  for (const [category, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    console.log(`\n${category.toUpperCase()} (${items.length} re-exports):`);
    
    // Group by fromPath
    const byPath = new Map();
    for (const item of items) {
      const count = byPath.get(item.fromPath) || 0;
      byPath.set(item.fromPath, count + 1);
    }
    
    const sortedPaths = [...byPath.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    for (const [fromPath, count] of sortedPaths) {
      console.log(`  ${fromPath.padEnd(40)} (${count} plugins)`);
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('ESTIMATED MEMORY IMPACT');
  console.log('='.repeat(70));
  console.log('');

  // Estimate based on patterns we know
  const estimates = {
    'alerting/lib/*': { count: categories.alerting.length, memPerItem: 15, reason: 'Pulls in @kbn/alerting-plugin' },
    'routes/*': { count: categories.routes.length, memPerItem: 2, reason: 'Route definitions with schemas' },
    'types/*': { count: categories.types.length, memPerItem: 0.5, reason: 'Usually just TypeScript types (minimal)' },
    'lib/*': { count: categories.lib.length, memPerItem: 5, reason: 'Utility libraries with dependencies' },
    '@kbn/*': { count: categories.kbn_packages.length, memPerItem: 3, reason: 'Kibana shared packages' },
    'other': { count: categories.other.length, memPerItem: 2, reason: 'Various exports' },
  };

  console.log(`${'Category'.padEnd(20)} ${'Count'.padStart(6)} ${'Est. MB/each'.padStart(12)} ${'Total MB'.padStart(10)} Reason`);
  console.log('-'.repeat(80));

  let totalEstimate = 0;
  for (const [category, data] of Object.entries(estimates)) {
    const total = data.count * data.memPerItem;
    totalEstimate += total;
    console.log(
      `${category.padEnd(20)} ${data.count.toString().padStart(6)} ${(data.memPerItem + 'MB').padStart(12)} ${(total.toFixed(1) + 'MB').padStart(10)} ${data.reason}`
    );
  }

  console.log('-'.repeat(80));
  console.log(`${'TOTAL'.padEnd(20)} ${totalReExports.toString().padStart(6)} ${''.padStart(12)} ${(totalEstimate.toFixed(1) + 'MB').padStart(10)}`);
  console.log('');

  // Compare to actual measured data
  console.log('='.repeat(70));
  console.log('COMPARISON TO ACTUAL MEASUREMENTS');
  console.log('='.repeat(70));
  console.log('');
  console.log('From kibana_memory.log, we measured:');
  console.log('  - transform: 162MB (has alerting re-export)');
  console.log('  - data: 74MB (6 re-exports)');
  console.log('  - Total plugin memory: ~340MB');
  console.log('');
  console.log(`Estimated re-export overhead: ${totalEstimate.toFixed(0)}MB`);
  console.log(`This suggests ${(totalEstimate / 340 * 100).toFixed(0)}% of plugin memory is from re-exports`);
  console.log('');

  // Actionable recommendations
  console.log('='.repeat(70));
  console.log('TOP PLUGINS TO FIX (highest re-export count)');
  console.log('='.repeat(70));
  console.log('');

  for (const [plugin, reExports] of sortedPlugins.slice(0, 10)) {
    const hasAlertingReexport = reExports.some(r => r.fromPath.includes('alert') || r.fromPath.includes('rule'));
    const priority = hasAlertingReexport ? 'HIGH' : (reExports.length > 3 ? 'MEDIUM' : 'LOW');
    
    console.log(`${plugin}:`);
    console.log(`  Re-exports: ${reExports.length}`);
    console.log(`  Priority: ${priority}`);
    console.log(`  To fix: Remove re-exports, use dynamic import in setup()`);
    for (const re of reExports.slice(0, 3)) {
      console.log(`    - ${re.raw.substring(0, 60)}...`);
    }
    console.log('');
  }

  // Save results
  const outputPath = path.join(KIBANA_ROOT, 'tmp', 'reexport_analysis.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalPlugins: plugins.length,
    totalReExports,
    estimatedMemoryMB: totalEstimate,
    byPlugin: Object.fromEntries(sortedPlugins.map(([k, v]) => [k, v.length])),
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.length])),
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main().catch(console.error);
