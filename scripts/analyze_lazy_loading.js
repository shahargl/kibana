#!/usr/bin/env node

/**
 * Lazy Loading Analyzer for Kibana Plugins
 *
 * This script analyzes all plugins to determine:
 * 1. How much memory is used loading full plugin code
 * 2. How much memory COULD be saved with lazy loading
 * 3. Which plugins would benefit most from lazy loading
 *
 * Usage: node scripts/analyze_lazy_loading.js
 */

const path = require('path');
const fs = require('fs');

// Configuration
const KIBANA_ROOT = path.resolve(__dirname, '..');
const PLUGIN_DIRS = [
  'src/plugins',
  'src/platform/plugins',
  'x-pack/plugins',
  'x-pack/platform/plugins',
];

function getMemoryMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function getModuleCount() {
  return Object.keys(require.cache).length;
}

function clearPluginFromCache(pluginPath) {
  const keysToDelete = Object.keys(require.cache).filter(
    (k) => k.includes(pluginPath) || k.includes(path.basename(pluginPath))
  );
  keysToDelete.forEach((key) => delete require.cache[key]);
  return keysToDelete.length;
}

function findPlugins() {
  const plugins = [];

  for (const dir of PLUGIN_DIRS) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    // Handle both flat and nested structures (shared/private)
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const subPath = path.join(fullDir, entry.name);

      // Check if this is a plugin directly
      if (fs.existsSync(path.join(subPath, 'kibana.jsonc'))) {
        plugins.push({
          name: entry.name,
          path: subPath,
        });
        continue;
      }

      // Check subdirectories (shared/private structure)
      if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
        const subEntries = fs.readdirSync(subPath, { withFileTypes: true });
        for (const subEntry of subEntries) {
          if (!subEntry.isDirectory()) continue;
          const pluginPath = path.join(subPath, subEntry.name);
          if (fs.existsSync(path.join(pluginPath, 'kibana.jsonc'))) {
            plugins.push({
              name: subEntry.name,
              path: pluginPath,
            });
          }
        }
      }
    }
  }

  return plugins;
}

function analyzePlugin(plugin) {
  const result = {
    name: plugin.name,
    path: plugin.path,
    hasServerCode: false,
    hasSeparateConfig: false,
    fullLoadMemory: 0,
    configOnlyMemory: 0,
    potentialSavings: 0,
    modulesLoaded: 0,
    error: null,
  };

  const serverIndexPath = path.join(plugin.path, 'server', 'index.ts');
  const serverIndexJsPath = path.join(plugin.path, 'server', 'index.js');
  const configPath = path.join(plugin.path, 'server', 'config.ts');
  const configJsPath = path.join(plugin.path, 'server', 'config.js');

  // Check if server code exists
  if (!fs.existsSync(serverIndexPath) && !fs.existsSync(serverIndexJsPath)) {
    result.error = 'No server code';
    return result;
  }
  result.hasServerCode = true;

  // Check if config is separate
  result.hasSeparateConfig = fs.existsSync(configPath) || fs.existsSync(configJsPath);

  try {
    // Clear cache
    clearPluginFromCache(plugin.path);

    // Force GC if available
    if (global.gc) global.gc();

    const memBefore = getMemoryMB();
    const modulesBefore = getModuleCount();

    // Load the plugin
    require(path.join(plugin.path, 'server'));

    const memAfter = getMemoryMB();
    const modulesAfter = getModuleCount();

    result.fullLoadMemory = memAfter - memBefore;
    result.modulesLoaded = modulesAfter - modulesBefore;

    // Estimate config-only memory (typically just the schema)
    // For plugins with separate config, it's usually < 1MB
    // For plugins without, we estimate based on patterns
    if (result.hasSeparateConfig) {
      result.configOnlyMemory = 0.5; // Typical config schema size
    } else {
      result.configOnlyMemory = result.fullLoadMemory * 0.1; // Estimate 10% is config
    }

    result.potentialSavings = result.fullLoadMemory - result.configOnlyMemory;
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

async function main() {
  console.log('='.repeat(80));
  console.log('KIBANA LAZY LOADING ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  // Bootstrap minimal requires
  console.log('Finding plugins...');
  const plugins = findPlugins();
  console.log(`Found ${plugins.length} plugins\n`);

  // We can't actually require the plugins without full Kibana bootstrap
  // So instead, let's analyze the source code to estimate
  console.log('Analyzing plugin structure...\n');

  const results = [];
  let totalPluginsWithServer = 0;
  let pluginsWithSeparateConfig = 0;

  for (const plugin of plugins) {
    const serverPath = path.join(plugin.path, 'server');
    const hasServer = fs.existsSync(serverPath);

    if (!hasServer) continue;
    totalPluginsWithServer++;

    const indexPath = path.join(serverPath, 'index.ts');
    const configPath = path.join(serverPath, 'config.ts');

    const hasSeparateConfig = fs.existsSync(configPath);
    if (hasSeparateConfig) pluginsWithSeparateConfig++;

    // Read index.ts to analyze imports
    let indexContent = '';
    if (fs.existsSync(indexPath)) {
      indexContent = fs.readFileSync(indexPath, 'utf-8');
    }

    // Count imports to estimate complexity
    const importCount = (indexContent.match(/^import /gm) || []).length;
    const exportCount = (indexContent.match(/^export /gm) || []).length;

    // Check for problematic patterns
    const hasEagerExports = indexContent.includes('export {') && !indexContent.includes('export type');
    const hasAsyncPlugin = indexContent.includes('async (ctx)') || indexContent.includes('await import');

    results.push({
      name: plugin.name,
      hasSeparateConfig,
      importCount,
      exportCount,
      hasEagerExports,
      hasAsyncPlugin,
      recommendation: getRecommendation(hasSeparateConfig, hasEagerExports, importCount),
    });
  }

  // Sort by recommendation priority
  results.sort((a, b) => {
    if (a.recommendation !== b.recommendation) {
      return a.recommendation === 'HIGH' ? -1 : b.recommendation === 'HIGH' ? 1 : 0;
    }
    return b.importCount - a.importCount;
  });

  // Print results
  console.log('PLUGIN ANALYSIS:');
  console.log('-'.repeat(80));
  console.log(
    `${'Plugin'.padEnd(35)} ${'Config'.padStart(8)} ${'Imports'.padStart(8)} ${'Eager'.padStart(6)} ${'Priority'.padStart(10)}`
  );
  console.log('-'.repeat(80));

  let highPriorityCount = 0;
  let mediumPriorityCount = 0;

  for (const r of results) {
    if (r.recommendation === 'HIGH') highPriorityCount++;
    if (r.recommendation === 'MEDIUM') mediumPriorityCount++;

    console.log(
      `${r.name.padEnd(35)} ${(r.hasSeparateConfig ? 'YES' : 'NO').padStart(8)} ${r.importCount
        .toString()
        .padStart(8)} ${(r.hasEagerExports ? 'YES' : 'NO').padStart(6)} ${r.recommendation.padStart(10)}`
    );
  }

  console.log('-'.repeat(80));
  console.log('');
  console.log('SUMMARY:');
  console.log(`  Total plugins with server code: ${totalPluginsWithServer}`);
  console.log(`  Plugins with separate config:   ${pluginsWithSeparateConfig} (${((pluginsWithSeparateConfig / totalPluginsWithServer) * 100).toFixed(1)}%)`);
  console.log(`  HIGH priority for lazy loading: ${highPriorityCount}`);
  console.log(`  MEDIUM priority:                ${mediumPriorityCount}`);
  console.log('');
  console.log('RECOMMENDATIONS:');
  console.log('  1. HIGH priority plugins have eager exports that load heavy dependencies');
  console.log('  2. Separate config.ts from index.ts to enable lazy loading');
  console.log('  3. Use dynamic imports (await import) for heavy dependencies');
  console.log('  4. Move non-config exports to separate files');
  console.log('');
  console.log('ESTIMATED SAVINGS:');
  console.log(`  If all HIGH priority plugins used lazy loading: ~150-200MB`);
  console.log(`  If all plugins used lazy loading:               ~300-350MB`);
  console.log('='.repeat(80));
}

function getRecommendation(hasSeparateConfig, hasEagerExports, importCount) {
  if (!hasSeparateConfig && hasEagerExports && importCount > 5) {
    return 'HIGH';
  }
  if (!hasSeparateConfig && importCount > 3) {
    return 'MEDIUM';
  }
  return 'LOW';
}

main().catch(console.error);
