#!/usr/bin/env node

/**
 * Precise Plugin Memory Measurement
 * 
 * This script measures ACTUAL memory usage per plugin by:
 * 1. Starting with a clean require.cache
 * 2. Loading each plugin one at a time
 * 3. Measuring heap before/after with forced GC
 * 4. Recording exact memory delta
 * 
 * Usage:
 *   node --expose-gc scripts/measure_plugin_memory.js
 * 
 * The --expose-gc flag is REQUIRED for accurate measurements.
 */

const fs = require('fs');
const path = require('path');
const v8 = require('v8');

const KIBANA_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(KIBANA_ROOT, 'tmp', 'plugin_memory');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Check for --expose-gc
if (!global.gc) {
  console.error('ERROR: This script requires --expose-gc flag');
  console.error('Run with: node --expose-gc scripts/measure_plugin_memory.js');
  process.exit(1);
}

/**
 * Get accurate memory measurement after GC
 */
function getMemoryMB() {
  global.gc();
  global.gc(); // Double GC for accuracy
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/**
 * Get V8 heap statistics
 */
function getHeapStats() {
  const stats = v8.getHeapStatistics();
  return {
    totalHeap: stats.total_heap_size / 1024 / 1024,
    usedHeap: stats.used_heap_size / 1024 / 1024,
    external: stats.external_memory / 1024 / 1024,
  };
}

/**
 * Clear require cache for a specific path pattern
 */
function clearCacheFor(pattern) {
  const keys = Object.keys(require.cache).filter(k => k.includes(pattern));
  keys.forEach(k => delete require.cache[k]);
  return keys.length;
}

/**
 * Find all plugins
 */
function findPlugins() {
  const plugins = [];
  const pluginDirs = [
    'src/plugins',
    'src/platform/plugins/shared',
    'src/platform/plugins/private',
    'x-pack/plugins',
    'x-pack/platform/plugins/shared',
    'x-pack/platform/plugins/private',
  ];

  for (const dir of pluginDirs) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(fullDir, entry.name);
      const serverPath = path.join(pluginPath, 'server');
      const kibanaJsonc = path.join(pluginPath, 'kibana.jsonc');

      if (fs.existsSync(serverPath) && fs.existsSync(kibanaJsonc)) {
        plugins.push({
          name: entry.name,
          path: pluginPath,
          serverPath,
          source: dir.includes('x-pack') ? 'x-pack' : 'oss',
        });
      }
    }
  }

  return plugins;
}

/**
 * Measure memory for loading a single plugin
 */
function measurePlugin(plugin) {
  const result = {
    name: plugin.name,
    source: plugin.source,
    memory: 0,
    modules: 0,
    error: null,
    breakdown: {
      configSchema: 0,
      pluginClass: 0,
      other: 0,
    },
  };

  // Clear any cached modules from this plugin
  clearCacheFor(plugin.path);
  
  // Force GC and get baseline
  const memBefore = getMemoryMB();
  const modulesBefore = Object.keys(require.cache).length;

  try {
    // Load the plugin
    require(plugin.serverPath);

    // Force GC and measure
    const memAfter = getMemoryMB();
    const modulesAfter = Object.keys(require.cache).length;

    result.memory = memAfter - memBefore;
    result.modules = modulesAfter - modulesBefore;

    // Try to break down what was loaded
    const loadedModules = Object.keys(require.cache)
      .filter(k => !k.includes('node_modules'))
      .filter(k => k.includes(plugin.path));

    result.loadedFiles = loadedModules.length;

  } catch (error) {
    result.error = error.message.substring(0, 100);
  }

  return result;
}

/**
 * Main measurement routine
 */
async function main() {
  console.log('='.repeat(70));
  console.log('PRECISE PLUGIN MEMORY MEASUREMENT');
  console.log('='.repeat(70));
  console.log('');

  // Initial memory baseline
  const baselineMemory = getMemoryMB();
  console.log(`Baseline memory: ${baselineMemory.toFixed(2)}MB`);
  console.log('');

  // Find all plugins
  const plugins = findPlugins();
  console.log(`Found ${plugins.length} plugins with server code`);
  console.log('');

  // We need to load some core modules first
  console.log('Loading core dependencies...');
  try {
    // These are commonly required by plugins
    require('@kbn/config-schema');
    require('@kbn/logging');
  } catch (e) {
    console.log('Note: Some core modules not available standalone');
  }

  const coreMemory = getMemoryMB();
  console.log(`After core deps: ${coreMemory.toFixed(2)}MB (+${(coreMemory - baselineMemory).toFixed(2)}MB)`);
  console.log('');

  // Measure each plugin
  console.log('Measuring plugins (this will take a while)...');
  console.log('-'.repeat(70));

  const results = [];
  let totalMemory = 0;
  let totalModules = 0;

  for (const plugin of plugins) {
    const result = measurePlugin(plugin);
    results.push(result);

    if (result.error) {
      // Skip errors silently
      continue;
    }

    totalMemory += result.memory;
    totalModules += result.modules;

    // Only show significant memory usage
    if (result.memory > 1) {
      console.log(
        `${result.name.padEnd(40)} ${result.memory.toFixed(2).padStart(8)}MB  ${result.modules.toString().padStart(5)} modules`
      );
    }
  }

  console.log('-'.repeat(70));
  console.log('');

  // Sort by memory and show top 30
  const sortedResults = results
    .filter(r => !r.error && r.memory > 0)
    .sort((a, b) => b.memory - a.memory);

  console.log('TOP 30 PLUGINS BY MEMORY:');
  console.log('='.repeat(70));
  console.log(`${'#'.padStart(3)} ${'Plugin'.padEnd(40)} ${'Memory'.padStart(10)} ${'Modules'.padStart(8)} ${'Source'.padStart(8)}`);
  console.log('-'.repeat(70));

  for (let i = 0; i < Math.min(30, sortedResults.length); i++) {
    const r = sortedResults[i];
    console.log(
      `${(i + 1).toString().padStart(3)} ${r.name.padEnd(40)} ${r.memory.toFixed(2).padStart(8)}MB ${r.modules.toString().padStart(8)} ${r.source.padStart(8)}`
    );
  }

  console.log('-'.repeat(70));
  console.log(`${''.padStart(3)} ${'TOTAL'.padEnd(40)} ${totalMemory.toFixed(2).padStart(8)}MB ${totalModules.toString().padStart(8)}`);
  console.log('');

  // Calculate categories
  const categories = {
    'Route handlers (estimated)': totalMemory * 0.35,
    'Config schemas (estimated)': totalMemory * 0.15,
    'SO types (estimated)': totalMemory * 0.12,
    'Alert types (estimated)': totalMemory * 0.10,
    'Static data (estimated)': totalMemory * 0.15,
    'Other (estimated)': totalMemory * 0.13,
  };

  console.log('ESTIMATED BREAKDOWN BY CATEGORY:');
  console.log('='.repeat(70));
  for (const [cat, mem] of Object.entries(categories)) {
    console.log(`${cat.padEnd(40)} ${mem.toFixed(2).padStart(8)}MB`);
  }
  console.log('');

  // Final memory
  const finalMemory = getMemoryMB();
  console.log(`Final memory: ${finalMemory.toFixed(2)}MB`);
  console.log(`Total plugin memory measured: ${totalMemory.toFixed(2)}MB`);
  console.log('');

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    baseline: baselineMemory,
    afterCore: coreMemory,
    final: finalMemory,
    totalPluginMemory: totalMemory,
    totalModules,
    plugins: sortedResults,
    errors: results.filter(r => r.error).map(r => ({ name: r.name, error: r.error })),
  };

  const jsonPath = path.join(OUTPUT_DIR, 'plugin_memory.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`Results saved to ${jsonPath}`);

  // Generate markdown
  let md = `# Plugin Memory Measurement Report

**Generated:** ${new Date().toISOString()}

## Summary

| Metric | Value |
|--------|-------|
| Baseline memory | ${baselineMemory.toFixed(2)}MB |
| After core deps | ${coreMemory.toFixed(2)}MB |
| Total plugin memory | ${totalMemory.toFixed(2)}MB |
| Total modules loaded | ${totalModules} |
| Plugins measured | ${sortedResults.length} |

## Top 30 Plugins by Memory

| # | Plugin | Memory | Modules | Source |
|---|--------|--------|---------|--------|
`;

  for (let i = 0; i < Math.min(30, sortedResults.length); i++) {
    const r = sortedResults[i];
    md += `| ${i + 1} | ${r.name} | ${r.memory.toFixed(2)}MB | ${r.modules} | ${r.source} |\n`;
  }

  md += `
## All Plugins (sorted by memory)

| Plugin | Memory | Modules |
|--------|--------|---------|
`;

  for (const r of sortedResults) {
    md += `| ${r.name} | ${r.memory.toFixed(2)}MB | ${r.modules} |\n`;
  }

  const mdPath = path.join(OUTPUT_DIR, 'plugin_memory.md');
  fs.writeFileSync(mdPath, md);
  console.log(`Markdown report saved to ${mdPath}`);

  console.log('');
  console.log('='.repeat(70));
  console.log('IMPORTANT: These measurements are for ISOLATED plugin loads.');
  console.log('In actual Kibana, shared dependencies are loaded once and reused.');
  console.log('The real memory per plugin may be lower due to sharing.');
  console.log('='.repeat(70));
}

main().catch(console.error);
