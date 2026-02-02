#!/usr/bin/env node

/**
 * Draw FULL dependency chain - what plugins REQUIRE taskManager 
 * and what they transitively pull in
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');
const targetPlugin = process.argv[2] || 'taskManager';

const MEASURED_MEMORY = {
  'transform': 162.31, 'data': 73.86, 'contentConnectors': 53.58,
  'agentBuilderPlatform': 40.73, 'agentBuilder': 38.21, 'apm': 29.54,
  'streams': 25.08, 'mockIdpPlugin': 20.94, 'cases': 19.34, 'home': 13.44,
  'ruleRegistry': 11.02, 'productDocBase': 8.87, 'lists': 8.41,
  'securitySolution': 6.57, 'indicesMetadata': 5.46, 'features': 5.36,
  'reindexService': 5.35, 'dashboardAgent': 5.33, 'files': 4.58,
  'dataUsage': 4.17, 'reporting': 3.99, 'monitoring': 3.14,
  'metricsDataAccess': 2.72, 'usageCollection': 2.65, 'workplaceAIApp': 2.42,
  'taskManager': 1.5, 'encryptedSavedObjects': 1.2, 'actions': 1.8,
  'alerting': 2.1, 'licensing': 0.8, 'spaces': 1.1, 'security': 1.5, 'eventLog': 0.9,
};

function parseKibanaJsonc(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/\/\/.*$/gm, '');
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(content);
  } catch { return null; }
}

function findAllPlugins() {
  const plugins = new Map();
  const dirs = [
    'src/plugins', 'src/platform/plugins/shared', 'src/platform/plugins/private',
    'x-pack/plugins', 'x-pack/platform/plugins/shared', 'x-pack/platform/plugins/private',
    'x-pack/solutions',
  ];

  function scanDir(dir) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) return;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginPath = path.join(fullDir, entry.name);
      const kibanaJsonc = path.join(pluginPath, 'kibana.jsonc');
      if (fs.existsSync(kibanaJsonc)) {
        const manifest = parseKibanaJsonc(kibanaJsonc);
        if (manifest?.plugin) {
          const id = manifest.plugin.id || entry.name;
          plugins.set(id, {
            id, path: pluginPath.replace(KIBANA_ROOT + '/', ''),
            hasServer: manifest.plugin.server === true,
            requiredPlugins: manifest.plugin.requiredPlugins || [],
            optionalPlugins: manifest.plugin.optionalPlugins || [],
          });
        }
      } else {
        scanDir(path.join(dir, entry.name));
      }
    }
  }
  for (const dir of dirs) scanDir(dir);
  return plugins;
}

function getTransitiveDeps(plugins, pluginId, visited = new Set()) {
  if (visited.has(pluginId)) return visited;
  visited.add(pluginId);
  
  const plugin = plugins.get(pluginId);
  if (!plugin) return visited;
  
  for (const dep of plugin.requiredPlugins) {
    getTransitiveDeps(plugins, dep, visited);
  }
  return visited;
}

function findReverseDependencies(plugins, pluginId) {
  const dependents = [];
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(pluginId)) {
      dependents.push(id);
    }
  }
  return dependents;
}

function main() {
  const plugins = findAllPlugins();
  
  console.log('='.repeat(80));
  console.log(`FULL DEPENDENCY ANALYSIS: What does running ${targetPlugin} actually require?`);
  console.log('='.repeat(80));
  console.log('');

  // Who requires taskManager?
  const directDependents = findReverseDependencies(plugins, targetPlugin);
  
  console.log(`Plugins that REQUIRE ${targetPlugin}: ${directDependents.length}`);
  console.log('');

  // For each dependent, what do THEY require?
  const allRequiredPlugins = new Set([targetPlugin]);
  const pluginChains = new Map();

  // First, get taskManager's own deps
  const tmDeps = getTransitiveDeps(plugins, targetPlugin);
  tmDeps.forEach(d => allRequiredPlugins.add(d));

  // Then for each plugin that requires taskManager
  for (const depId of directDependents) {
    const chain = getTransitiveDeps(plugins, depId);
    pluginChains.set(depId, chain);
    chain.forEach(d => allRequiredPlugins.add(d));
  }

  // Now categorize
  const coreForTM = new Set([targetPlugin, ...tmDeps]);
  const additionalFromDependents = new Set();
  
  allRequiredPlugins.forEach(p => {
    if (!coreForTM.has(p)) {
      additionalFromDependents.add(p);
    }
  });

  console.log('='.repeat(80));
  console.log('MINIMUM PLUGINS for taskManager itself:');
  console.log('='.repeat(80));
  
  let minMemory = 0;
  [...coreForTM].sort().forEach(p => {
    const mem = MEASURED_MEMORY[p] || 0;
    minMemory += mem;
    console.log(`  ${p.padEnd(30)} ${mem ? mem.toFixed(1).padStart(6) + 'MB' : ''}`);
  });
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${minMemory.toFixed(1).padStart(6)}MB`);
  console.log('');

  console.log('='.repeat(80));
  console.log('ADDITIONAL PLUGINS pulled in by taskManager dependents:');
  console.log('='.repeat(80));
  console.log('');

  // Group by what pulls them in
  const pulledBy = new Map();
  for (const [depId, chain] of pluginChains) {
    for (const p of chain) {
      if (!coreForTM.has(p) && p !== depId) {
        if (!pulledBy.has(p)) pulledBy.set(p, []);
        pulledBy.get(p).push(depId);
      }
    }
  }

  // Sort by memory
  const sortedAdditional = [...additionalFromDependents]
    .map(p => ({ id: p, mem: MEASURED_MEMORY[p] || 0, pulledBy: pulledBy.get(p) || [] }))
    .sort((a, b) => b.mem - a.mem);

  let additionalMemory = 0;
  sortedAdditional.slice(0, 30).forEach(({ id, mem, pulledBy }) => {
    additionalMemory += mem;
    const pullers = pulledBy.slice(0, 3).join(', ');
    console.log(`  ${id.padEnd(30)} ${mem ? mem.toFixed(1).padStart(6) + 'MB' : '      '} ← ${pullers}`);
  });
  if (sortedAdditional.length > 30) {
    const rest = sortedAdditional.slice(30);
    const restMem = rest.reduce((s, p) => s + p.mem, 0);
    additionalMemory += restMem;
    console.log(`  ... and ${rest.length} more plugins (${restMem.toFixed(1)}MB)`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  ${targetPlugin} + its deps:              ${coreForTM.size} plugins, ${minMemory.toFixed(1)}MB`);
  console.log(`  Plugins that REQUIRE ${targetPlugin}:   ${directDependents.length} plugins`);
  console.log(`  Additional transitive deps:       ${additionalFromDependents.size} plugins, ${additionalMemory.toFixed(1)}MB`);
  console.log(`  ─────────────────────────────────────────────────`);
  console.log(`  TOTAL if ALL dependents loaded:   ${allRequiredPlugins.size} plugins, ${(minMemory + additionalMemory).toFixed(1)}MB`);
  console.log('');

  // What's the MINIMAL set for background tasks?
  console.log('='.repeat(80));
  console.log('MINIMAL SET for background_tasks role (Task Manager only):');
  console.log('='.repeat(80));
  console.log('');
  console.log(`If Kibana could load ONLY taskManager and its direct deps:`);
  console.log(`  Plugins: ${coreForTM.size}`);
  console.log(`  Memory:  ~${minMemory.toFixed(1)}MB`);
  console.log('');
  console.log(`Current (all ${targetPlugin} dependents loaded):`);
  console.log(`  Plugins: ${allRequiredPlugins.size}`);
  console.log(`  Memory:  ~${(minMemory + additionalMemory).toFixed(1)}MB`);
  console.log('');
  console.log(`POTENTIAL SAVINGS: ~${additionalMemory.toFixed(1)}MB`);
  console.log('');

  // Who are the heavy hitters?
  console.log('='.repeat(80));
  console.log('TOP MEMORY CONSUMERS that could be excluded:');
  console.log('='.repeat(80));
  console.log('');
  sortedAdditional.filter(p => p.mem > 5).forEach(({ id, mem, pulledBy }) => {
    console.log(`  ${id.padEnd(25)} ${mem.toFixed(1).padStart(6)}MB  (pulled by: ${pulledBy.slice(0,2).join(', ')})`);
  });
}

main();
