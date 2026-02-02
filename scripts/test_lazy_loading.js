#!/usr/bin/env node

/**
 * Lazy Loading Test Harness for Kibana
 *
 * This script tests what memory savings are possible by:
 * 1. Intercepting require() calls during plugin discovery
 * 2. Measuring memory with and without lazy loading
 * 3. Reporting which plugins would benefit most
 *
 * Usage: node scripts/test_lazy_loading.js
 *
 * This requires running with --expose-gc for accurate measurements:
 *   node --expose-gc scripts/test_lazy_loading.js
 */

const Module = require('module');
const path = require('path');
const fs = require('fs');

// Store original require
const originalRequire = Module.prototype.require;

// Configuration
const KIBANA_ROOT = path.resolve(__dirname, '..');
const LAZY_MODE = process.argv.includes('--lazy');
const VERBOSE = process.argv.includes('--verbose');

// Tracking
const loadedPlugins = new Map();
const deferredLoads = new Map();
let totalEagerMemory = 0;
let totalDeferredMemory = 0;

function getMemoryMB() {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function isPluginServerPath(requestPath) {
  // Match paths like /plugins/xxx/server or /plugins/xxx/server/index
  return /[\/\\](plugins|platform)[\/\\].+[\/\\]server([\/\\]index)?$/.test(requestPath);
}

function getPluginNameFromPath(requestPath) {
  // Extract plugin name from path
  const match = requestPath.match(/[\/\\](plugins|platform)[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)[\/\\]server/);
  return match ? match[2] : null;
}

// Intercept require to measure plugin loading
Module.prototype.require = function (request) {
  const resolvedPath = Module._resolveFilename(request, this);

  // Check if this is a plugin server load
  if (isPluginServerPath(resolvedPath)) {
    const pluginName = getPluginNameFromPath(resolvedPath);

    if (pluginName && !loadedPlugins.has(pluginName)) {
      const memBefore = getMemoryMB();
      const modulesBefore = Object.keys(require.cache).length;

      // Load the module
      const result = originalRequire.call(this, request);

      const memAfter = getMemoryMB();
      const modulesAfter = Object.keys(require.cache).length;

      const memDelta = memAfter - memBefore;
      const modulesDelta = modulesAfter - modulesBefore;

      loadedPlugins.set(pluginName, {
        memory: memDelta,
        modules: modulesDelta,
        path: resolvedPath,
      });

      if (VERBOSE) {
        console.log(`[LOAD] ${pluginName}: ${memDelta.toFixed(2)}MB, ${modulesDelta} modules`);
      }

      return result;
    }
  }

  return originalRequire.call(this, request);
};

async function runAnalysis() {
  console.log('='.repeat(80));
  console.log('LAZY LOADING MEMORY ANALYSIS');
  console.log('='.repeat(80));
  console.log(`Mode: ${LAZY_MODE ? 'LAZY (simulated)' : 'EAGER (current behavior)'}`);
  console.log('');

  const memStart = getMemoryMB();
  console.log(`Starting memory: ${memStart.toFixed(2)}MB`);
  console.log('');

  // Bootstrap Kibana's module resolution
  console.log('Loading Kibana module resolution...');

  // We need to load some core modules to resolve plugin paths
  try {
    // This will trigger loading of plugins through the normal path
    require('@kbn/repo-info');
  } catch (e) {
    // Expected - we're not in full Kibana context
  }

  // Manually scan and load plugins for analysis
  console.log('Scanning plugins...');

  const pluginDirs = [
    path.join(KIBANA_ROOT, 'src/plugins'),
    path.join(KIBANA_ROOT, 'src/platform/plugins/shared'),
    path.join(KIBANA_ROOT, 'src/platform/plugins/private'),
    path.join(KIBANA_ROOT, 'x-pack/plugins'),
    path.join(KIBANA_ROOT, 'x-pack/platform/plugins/shared'),
    path.join(KIBANA_ROOT, 'x-pack/platform/plugins/private'),
  ];

  const plugins = [];

  for (const dir of pluginDirs) {
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginPath = path.join(dir, entry.name);
      const serverPath = path.join(pluginPath, 'server');

      if (fs.existsSync(serverPath)) {
        plugins.push({
          name: entry.name,
          path: pluginPath,
          serverPath,
        });
      }
    }
  }

  console.log(`Found ${plugins.length} plugins with server code`);
  console.log('');
  console.log('Loading plugins to measure memory...');
  console.log('-'.repeat(80));

  const results = [];

  for (const plugin of plugins) {
    // Clear cache to get accurate per-plugin measurement
    const cacheKeys = Object.keys(require.cache).filter((k) => k.includes(plugin.path));
    cacheKeys.forEach((k) => delete require.cache[k]);

    if (global.gc) global.gc();

    const memBefore = getMemoryMB();
    const modulesBefore = Object.keys(require.cache).length;

    try {
      require(plugin.serverPath);

      const memAfter = getMemoryMB();
      const modulesAfter = Object.keys(require.cache).length;

      const memDelta = memAfter - memBefore;
      const modulesDelta = modulesAfter - modulesBefore;

      results.push({
        name: plugin.name,
        memory: memDelta,
        modules: modulesDelta,
        success: true,
      });

      if (memDelta > 1) {
        console.log(`${plugin.name.padEnd(40)} ${memDelta.toFixed(2).padStart(8)}MB  ${modulesDelta.toString().padStart(5)} modules`);
      }
    } catch (error) {
      results.push({
        name: plugin.name,
        memory: 0,
        modules: 0,
        success: false,
        error: error.message,
      });

      if (VERBOSE) {
        console.log(`${plugin.name.padEnd(40)} FAILED: ${error.message.substring(0, 30)}`);
      }
    }
  }

  console.log('-'.repeat(80));
  console.log('');

  // Calculate totals
  const successfulResults = results.filter((r) => r.success);
  const totalMemory = successfulResults.reduce((sum, r) => sum + r.memory, 0);
  const totalModules = successfulResults.reduce((sum, r) => sum + r.modules, 0);

  // Sort by memory usage
  successfulResults.sort((a, b) => b.memory - a.memory);

  console.log('TOP 20 MEMORY CONSUMERS:');
  console.log('-'.repeat(80));
  successfulResults.slice(0, 20).forEach((r, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${r.name.padEnd(40)} ${r.memory.toFixed(2).padStart(8)}MB  ${r.modules.toString().padStart(5)} modules`);
  });
  console.log('-'.repeat(80));
  console.log('');

  console.log('SUMMARY:');
  console.log(`  Plugins analyzed:     ${results.length}`);
  console.log(`  Plugins loaded:       ${successfulResults.length}`);
  console.log(`  Total memory used:    ${totalMemory.toFixed(2)}MB`);
  console.log(`  Total modules loaded: ${totalModules}`);
  console.log('');

  // Estimate lazy loading savings
  // Assumption: With lazy loading, we'd only load config schemas (~10% of current)
  const configOnlyEstimate = totalMemory * 0.15; // 15% for config schemas
  const potentialSavings = totalMemory - configOnlyEstimate;

  console.log('LAZY LOADING POTENTIAL:');
  console.log(`  Current total:        ${totalMemory.toFixed(2)}MB`);
  console.log(`  With lazy loading:    ~${configOnlyEstimate.toFixed(2)}MB (config schemas only)`);
  console.log(`  Potential savings:    ~${potentialSavings.toFixed(2)}MB (${((potentialSavings / totalMemory) * 100).toFixed(0)}%)`);
  console.log('');

  console.log('HOW TO ACHIEVE THESE SAVINGS:');
  console.log('  1. Separate config.ts from index.ts in each plugin');
  console.log('  2. Only export { config } from index.ts, use dynamic import for plugin');
  console.log('  3. Move heavy exports (registerXxx functions) to separate files');
  console.log('  4. Use lazy loading wrapper in core (see lazy_plugin_loader.ts)');
  console.log('='.repeat(80));

  const memEnd = getMemoryMB();
  console.log(`\nFinal memory: ${memEnd.toFixed(2)}MB (${(memEnd - memStart).toFixed(2)}MB used by analysis)`);
}

// Run
runAnalysis().catch(console.error);
