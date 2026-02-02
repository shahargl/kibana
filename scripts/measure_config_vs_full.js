#!/usr/bin/env node

/**
 * Analyze plugin source code to estimate config-only vs full memory
 * 
 * This doesn't load the plugins, but analyzes:
 * 1. Size of config.ts vs index.ts
 * 2. Import count in each
 * 3. Estimates based on patterns
 * 
 * Usage:
 *   node scripts/measure_config_vs_full.js
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');

function analyzeFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  
  // Count imports
  const imports = lines.filter(l => l.trim().startsWith('import '));
  const kbnImports = imports.filter(l => l.includes('@kbn/'));
  const relativeImports = imports.filter(l => l.includes("from './") || l.includes('from "./'));
  const nodeModuleImports = imports.filter(l => !l.includes('@kbn/') && !l.includes("from './") && !l.includes('from "./'));
  
  // Count exports
  const exports = lines.filter(l => l.trim().startsWith('export '));
  const reExports = exports.filter(l => l.includes(' from '));
  
  // Estimate complexity
  const hasSchemaImport = content.includes('@kbn/config-schema');
  const hasPluginClass = content.includes('Plugin') && content.includes('setup(');
  
  return {
    lines: lines.length,
    bytes: content.length,
    imports: imports.length,
    kbnImports: kbnImports.length,
    relativeImports: relativeImports.length,
    nodeModuleImports: nodeModuleImports.length,
    exports: exports.length,
    reExports: reExports.length,
    hasSchemaImport,
    hasPluginClass,
  };
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

      if (!fs.existsSync(serverPath)) continue;

      const indexPath = path.join(serverPath, 'index.ts');
      const configPath = path.join(serverPath, 'config.ts');

      if (!fs.existsSync(indexPath)) continue;

      plugins.push({
        name,
        dir,
        indexPath,
        configPath: fs.existsSync(configPath) ? configPath : null,
        indexAnalysis: analyzeFile(indexPath),
        configAnalysis: fs.existsSync(configPath) ? analyzeFile(configPath) : null,
      });
    }
  }
  return plugins;
}

// Memory estimation based on import patterns
// These are rough estimates based on typical Kibana module sizes
const IMPORT_MEMORY_ESTIMATES = {
  '@kbn/config-schema': 2,      // MB - schema library
  '@kbn/core': 5,               // MB - core types (mostly types, small)
  '@kbn/logging': 0.5,          // MB
  '@kbn/i18n': 1,               // MB
  'relative_import': 0.5,       // MB average per relative import
  'node_module': 0.3,           // MB average per node module
  're_export': 5,               // MB average per re-export (pulls in full module!)
};

function estimateMemory(analysis, isConfigOnly = false) {
  if (!analysis) return 0;

  let estimate = 0;

  // Base file size (very rough: 1KB source ≈ 10KB runtime)
  estimate += (analysis.bytes / 1024) * 0.01;

  // Schema import
  if (analysis.hasSchemaImport) {
    estimate += IMPORT_MEMORY_ESTIMATES['@kbn/config-schema'];
  }

  // For config-only, we don't count re-exports or most imports
  if (!isConfigOnly) {
    // Re-exports are expensive!
    estimate += analysis.reExports * IMPORT_MEMORY_ESTIMATES['re_export'];

    // Relative imports
    estimate += analysis.relativeImports * IMPORT_MEMORY_ESTIMATES['relative_import'];

    // Node module imports
    estimate += analysis.nodeModuleImports * IMPORT_MEMORY_ESTIMATES['node_module'];
  }

  return estimate;
}

function main() {
  console.log('='.repeat(70));
  console.log('CONFIG VS FULL PLUGIN ANALYSIS');
  console.log('='.repeat(70));
  console.log('');

  const plugins = findPlugins();
  console.log(`Analyzing ${plugins.length} plugins...`);
  console.log('');

  const results = [];

  for (const plugin of plugins) {
    const configMem = plugin.configAnalysis 
      ? estimateMemory(plugin.configAnalysis, true)
      : estimateMemory(plugin.indexAnalysis, true); // If no config.ts, estimate from index

    const fullMem = estimateMemory(plugin.indexAnalysis, false);
    const lazyPotential = fullMem - configMem;

    results.push({
      name: plugin.name,
      hasConfigFile: !!plugin.configPath,
      configMemory: configMem,
      fullMemory: fullMem,
      lazyPotential,
      reExports: plugin.indexAnalysis?.reExports || 0,
      relativeImports: plugin.indexAnalysis?.relativeImports || 0,
    });
  }

  // Sort by lazy potential
  results.sort((a, b) => b.lazyPotential - a.lazyPotential);

  // Print top plugins
  console.log('TOP 30 PLUGINS BY LAZY LOADING POTENTIAL (estimated):');
  console.log('='.repeat(70));
  console.log(`${'Plugin'.padEnd(35)} ${'Full'.padStart(8)} ${'Config'.padStart(8)} ${'Lazy'.padStart(8)} ${'ReExp'.padStart(6)} ${'Cfg?'.padStart(5)}`);
  console.log('-'.repeat(70));

  for (const r of results.slice(0, 30)) {
    console.log(
      `${r.name.padEnd(35)} ${(r.fullMemory.toFixed(1) + 'MB').padStart(8)} ${(r.configMemory.toFixed(1) + 'MB').padStart(8)} ${(r.lazyPotential.toFixed(1) + 'MB').padStart(8)} ${r.reExports.toString().padStart(6)} ${(r.hasConfigFile ? 'Y' : 'N').padStart(5)}`
    );
  }

  // Totals
  const totalFull = results.reduce((s, r) => s + r.fullMemory, 0);
  const totalConfig = results.reduce((s, r) => s + r.configMemory, 0);
  const totalLazy = results.reduce((s, r) => s + r.lazyPotential, 0);

  console.log('-'.repeat(70));
  console.log(
    `${'TOTAL'.padEnd(35)} ${(totalFull.toFixed(1) + 'MB').padStart(8)} ${(totalConfig.toFixed(1) + 'MB').padStart(8)} ${(totalLazy.toFixed(1) + 'MB').padStart(8)}`
  );
  console.log('');

  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Estimated total plugin memory:       ${totalFull.toFixed(0)}MB`);
  console.log(`Estimated config-only memory:        ${totalConfig.toFixed(0)}MB`);
  console.log(`Estimated LAZY POTENTIAL:            ${totalLazy.toFixed(0)}MB (${(totalLazy/totalFull*100).toFixed(0)}%)`);
  console.log('');

  // Breakdown by re-exports
  const withReExports = results.filter(r => r.reExports > 0);
  const reExportMemory = withReExports.reduce((s, r) => s + r.reExports * IMPORT_MEMORY_ESTIMATES['re_export'], 0);

  console.log('KEY INSIGHT - RE-EXPORTS:');
  console.log(`  Plugins with re-exports: ${withReExports.length}`);
  console.log(`  Total re-exports: ${withReExports.reduce((s, r) => s + r.reExports, 0)}`);
  console.log(`  Estimated memory from re-exports: ${reExportMemory.toFixed(0)}MB`);
  console.log('');
  console.log('  Re-exports (export { x } from "./y") are the #1 cause of');
  console.log('  unnecessary memory usage because they load full modules');
  console.log('  even when only the config schema is needed.');
  console.log('');

  // Plugins with most re-exports
  const byReExports = [...results].sort((a, b) => b.reExports - a.reExports).slice(0, 10);
  console.log('TOP 10 PLUGINS BY RE-EXPORT COUNT:');
  for (const r of byReExports) {
    if (r.reExports > 0) {
      console.log(`  ${r.name.padEnd(35)} ${r.reExports} re-exports (~${(r.reExports * 5).toFixed(0)}MB)`);
    }
  }
  console.log('');

  // Save
  const outputPath = path.join(KIBANA_ROOT, 'tmp', 'config_vs_full_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { totalFull, totalConfig, totalLazy },
    plugins: results,
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main();
