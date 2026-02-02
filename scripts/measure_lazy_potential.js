#!/usr/bin/env node

/**
 * Measure ACTUAL lazy loading potential by:
 * 1. Loading only config schemas (what MUST be eager)
 * 2. Loading full plugin code (current behavior)
 * 3. The difference = what COULD be lazy
 * 
 * Usage:
 *   node --expose-gc scripts/measure_lazy_potential.js
 */

const fs = require('fs');
const path = require('path');
const Module = require('module');

if (!global.gc) {
  console.error('ERROR: Run with --expose-gc flag:');
  console.error('  node --expose-gc scripts/measure_lazy_potential.js');
  process.exit(1);
}

const KIBANA_ROOT = path.resolve(__dirname, '..');

function getMemoryMB() {
  global.gc();
  global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function clearAllPluginCache() {
  const keys = Object.keys(require.cache).filter(k => 
    k.includes('/plugins/') || 
    k.includes('/platform/') ||
    k.includes('@kbn/')
  );
  keys.forEach(k => delete require.cache[k]);
  return keys.length;
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
      const serverPath = path.join(pluginPath, 'server');
      const configPath = path.join(serverPath, 'config.ts');
      const indexPath = path.join(serverPath, 'index.ts');

      if (fs.existsSync(serverPath) && fs.existsSync(indexPath)) {
        plugins.push({
          name,
          serverPath,
          hasConfigFile: fs.existsSync(configPath),
          configPath: fs.existsSync(configPath) ? configPath : null,
        });
      }
    }
  }
  return plugins;
}

async function measurePlugin(plugin) {
  const result = {
    name: plugin.name,
    hasConfigFile: plugin.hasConfigFile,
    configOnlyMemory: 0,
    configOnlyModules: 0,
    fullMemory: 0,
    fullModules: 0,
    lazyPotential: 0,
    error: null,
  };

  // Clear cache
  clearAllPluginCache();
  global.gc();
  global.gc();

  // Step 1: Try to load ONLY the config file (if separate)
  if (plugin.hasConfigFile) {
    const memBefore = getMemoryMB();
    const modulesBefore = Object.keys(require.cache).length;

    try {
      // Load just the config
      require(plugin.configPath.replace('.ts', ''));
      
      result.configOnlyMemory = getMemoryMB() - memBefore;
      result.configOnlyModules = Object.keys(require.cache).length - modulesBefore;
    } catch (e) {
      // Config file might have dependencies on index.ts
      result.configOnlyMemory = 0;
    }
  }

  // Clear cache again
  clearAllPluginCache();
  global.gc();
  global.gc();

  // Step 2: Load full plugin (current behavior)
  const memBefore = getMemoryMB();
  const modulesBefore = Object.keys(require.cache).length;

  try {
    require(plugin.serverPath);

    result.fullMemory = getMemoryMB() - memBefore;
    result.fullModules = Object.keys(require.cache).length - modulesBefore;
    
    // Lazy potential = full - config only
    result.lazyPotential = result.fullMemory - result.configOnlyMemory;
  } catch (e) {
    result.error = e.message.substring(0, 50);
  }

  return result;
}

async function main() {
  console.log('='.repeat(70));
  console.log('LAZY LOADING POTENTIAL MEASUREMENT');
  console.log('='.repeat(70));
  console.log('');
  console.log('This measures ACTUAL memory that could be saved with lazy loading.');
  console.log('');

  const baselineMemory = getMemoryMB();
  console.log(`Baseline memory: ${baselineMemory.toFixed(1)}MB`);
  console.log('');

  // First, measure @kbn/config-schema alone
  console.log('Measuring @kbn/config-schema (required for any config)...');
  clearAllPluginCache();
  const memBeforeSchema = getMemoryMB();
  try {
    require('@kbn/config-schema');
  } catch (e) {
    console.log('  Could not load @kbn/config-schema standalone');
  }
  const schemaMemory = getMemoryMB() - memBeforeSchema;
  console.log(`  @kbn/config-schema: ${schemaMemory.toFixed(2)}MB`);
  console.log('');

  // Find and measure plugins
  const plugins = findPlugins();
  console.log(`Found ${plugins.length} plugins`);
  console.log(`Plugins with separate config.ts: ${plugins.filter(p => p.hasConfigFile).length}`);
  console.log('');

  console.log('Measuring plugins (this takes a while)...');
  console.log('-'.repeat(70));

  const results = [];
  let measured = 0;

  for (const plugin of plugins) {
    const result = await measurePlugin(plugin);
    results.push(result);
    measured++;

    if (result.error) continue;
    if (result.fullMemory < 1) continue; // Skip tiny plugins

    process.stdout.write(`\r${measured}/${plugins.length} - ${plugin.name.padEnd(40)} full=${result.fullMemory.toFixed(1)}MB, lazy=${result.lazyPotential.toFixed(1)}MB`);
  }

  console.log('\n');
  console.log('-'.repeat(70));
  console.log('');

  // Sort by lazy potential
  const sorted = results
    .filter(r => !r.error && r.fullMemory > 0.5)
    .sort((a, b) => b.lazyPotential - a.lazyPotential);

  // Calculate totals
  const totalFull = sorted.reduce((sum, r) => sum + r.fullMemory, 0);
  const totalConfig = sorted.reduce((sum, r) => sum + r.configOnlyMemory, 0);
  const totalLazy = sorted.reduce((sum, r) => sum + r.lazyPotential, 0);

  console.log('='.repeat(70));
  console.log('TOP 25 PLUGINS BY LAZY LOADING POTENTIAL');
  console.log('='.repeat(70));
  console.log('');
  console.log(`${'Plugin'.padEnd(35)} ${'Full'.padStart(10)} ${'Config'.padStart(10)} ${'Lazy'.padStart(10)} ${'HasCfg'.padStart(8)}`);
  console.log('-'.repeat(73));

  for (const r of sorted.slice(0, 25)) {
    console.log(
      `${r.name.padEnd(35)} ${(r.fullMemory.toFixed(1) + 'MB').padStart(10)} ${(r.configOnlyMemory.toFixed(1) + 'MB').padStart(10)} ${(r.lazyPotential.toFixed(1) + 'MB').padStart(10)} ${(r.hasConfigFile ? 'YES' : 'NO').padStart(8)}`
    );
  }

  console.log('-'.repeat(73));
  console.log(
    `${'TOTAL'.padEnd(35)} ${(totalFull.toFixed(1) + 'MB').padStart(10)} ${(totalConfig.toFixed(1) + 'MB').padStart(10)} ${(totalLazy.toFixed(1) + 'MB').padStart(10)}`
  );

  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Total plugin memory (full load):     ${totalFull.toFixed(1)}MB`);
  console.log(`Config-only memory (must be eager):  ${totalConfig.toFixed(1)}MB`);
  console.log(`LAZY LOADING POTENTIAL:              ${totalLazy.toFixed(1)}MB (${(totalLazy/totalFull*100).toFixed(0)}%)`);
  console.log('');
  console.log('NOTE: These are ISOLATED measurements. In real Kibana:');
  console.log('  - Shared dependencies are loaded once (less total memory)');
  console.log('  - But the RATIO of lazy potential should be similar');
  console.log('');

  // Breakdown by category
  const withConfig = sorted.filter(r => r.hasConfigFile);
  const withoutConfig = sorted.filter(r => !r.hasConfigFile);

  console.log('BREAKDOWN:');
  console.log(`  Plugins WITH separate config.ts:  ${withConfig.length}`);
  console.log(`    Their lazy potential:           ${withConfig.reduce((s, r) => s + r.lazyPotential, 0).toFixed(1)}MB`);
  console.log(`  Plugins WITHOUT separate config:  ${withoutConfig.length}`);
  console.log(`    Their full memory:              ${withoutConfig.reduce((s, r) => s + r.fullMemory, 0).toFixed(1)}MB`);
  console.log(`    (Would need refactoring to enable lazy loading)`);
  console.log('');

  // Save results
  const outputPath = path.join(KIBANA_ROOT, 'tmp', 'lazy_potential.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    schemaMemory,
    totalFull,
    totalConfig,
    totalLazy,
    lazyPercent: (totalLazy / totalFull * 100).toFixed(1),
    plugins: sorted,
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main().catch(console.error);
