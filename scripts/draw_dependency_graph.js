#!/usr/bin/env node

/**
 * Draw recursive dependency graph for a plugin
 * Usage: node scripts/draw_dependency_graph.js [pluginId]
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');
const targetPlugin = process.argv[2] || 'taskManager';

// From kibana_memory.log - actual measured plugin memory during getConfigDescriptor
const MEASURED_MEMORY = {
  'transform': 162.31,
  'data': 73.86,
  'contentConnectors': 53.58,
  'agentBuilderPlatform': 40.73,
  'agentBuilder': 38.21,
  'apm': 29.54,
  'streams': 25.08,
  'mockIdpPlugin': 20.94,
  'cases': 19.34,
  'home': 13.44,
  'ruleRegistry': 11.02,
  'productDocBase': 8.87,
  'lists': 8.41,
  'securitySolution': 6.57,
  'indicesMetadata': 5.46,
  'features': 5.36,
  'reindexService': 5.35,
  'dashboardAgent': 5.33,
  'files': 4.58,
  'dataUsage': 4.17,
  'reporting': 3.99,
  'monitoring': 3.14,
  'metricsDataAccess': 2.72,
  'usageCollection': 2.65,
  'workplaceAIApp': 2.42,
  'taskManager': 1.5,
  'encryptedSavedObjects': 1.2,
  'actions': 1.8,
  'alerting': 2.1,
  'licensing': 0.8,
  'spaces': 1.1,
  'security': 1.5,
  'eventLog': 0.9,
};

function parseKibanaJsonc(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/\/\/.*$/gm, '');
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function findAllPlugins() {
  const plugins = new Map();
  const dirs = [
    'src/plugins',
    'src/platform/plugins/shared',
    'src/platform/plugins/private',
    'x-pack/plugins',
    'x-pack/platform/plugins/shared',
    'x-pack/platform/plugins/private',
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
            name: entry.name,
            id,
            path: pluginPath.replace(KIBANA_ROOT + '/', ''),
            hasServer: manifest.plugin.server === true,
            hasBrowser: manifest.plugin.browser === true,
            requiredPlugins: manifest.plugin.requiredPlugins || [],
            optionalPlugins: manifest.plugin.optionalPlugins || [],
            runtimePluginDependencies: manifest.plugin.runtimePluginDependencies || [],
          });
        }
      } else {
        scanDir(path.join(dir, entry.name));
      }
    }
  }

  for (const dir of dirs) {
    scanDir(dir);
  }

  return plugins;
}

function buildDependencyTree(plugins, pluginId, visited = new Set(), depth = 0, isOptional = false) {
  if (visited.has(pluginId)) {
    return { id: pluginId, circular: true, depth, isOptional };
  }

  const plugin = plugins.get(pluginId);
  if (!plugin) {
    return { id: pluginId, notFound: true, depth, isOptional };
  }

  visited.add(pluginId);

  const children = [];
  
  // Required dependencies
  for (const dep of plugin.requiredPlugins) {
    children.push(buildDependencyTree(plugins, dep, new Set(visited), depth + 1, false));
  }
  
  // Optional dependencies
  for (const dep of plugin.optionalPlugins) {
    children.push(buildDependencyTree(plugins, dep, new Set(visited), depth + 1, true));
  }

  return {
    id: pluginId,
    path: plugin.path,
    hasServer: plugin.hasServer,
    memory: MEASURED_MEMORY[pluginId] || 0,
    requiredCount: plugin.requiredPlugins.length,
    optionalCount: plugin.optionalPlugins.length,
    children,
    depth,
    isOptional,
  };
}

function flattenTree(node, flat = [], seen = new Set()) {
  if (seen.has(node.id)) return flat;
  seen.add(node.id);
  
  flat.push(node);
  for (const child of (node.children || [])) {
    flattenTree(child, flat, seen);
  }
  return flat;
}

function printTree(node, prefix = '', isLast = true, isRoot = true) {
  const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
  const memStr = node.memory ? `(${node.memory.toFixed(1)}MB)` : '';
  const optStr = node.isOptional ? ' [optional]' : '';
  const circStr = node.circular ? ' [CIRCULAR]' : '';
  const notFoundStr = node.notFound ? ' [NOT FOUND]' : '';
  const serverStr = node.hasServer === false ? ' [browser-only]' : '';
  
  console.log(`${prefix}${connector}${node.id} ${memStr}${optStr}${circStr}${notFoundStr}${serverStr}`);
  
  const children = node.children || [];
  const newPrefix = prefix + (isRoot ? '' : (isLast ? '    ' : '│   '));
  
  children.forEach((child, index) => {
    printTree(child, newPrefix, index === children.length - 1, false);
  });
}

function findReverseDependencies(plugins, pluginId) {
  const dependents = [];
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(pluginId)) {
      dependents.push({ id, type: 'required' });
    }
    if (plugin.optionalPlugins.includes(pluginId)) {
      dependents.push({ id, type: 'optional' });
    }
  }
  return dependents;
}

function main() {
  console.log('='.repeat(70));
  console.log(`DEPENDENCY GRAPH FOR: ${targetPlugin}`);
  console.log('='.repeat(70));
  console.log('');

  const plugins = findAllPlugins();
  console.log(`Total plugins found: ${plugins.size}`);
  console.log('');

  const plugin = plugins.get(targetPlugin);
  if (!plugin) {
    console.error(`Plugin "${targetPlugin}" not found!`);
    console.log('Available plugins:', [...plugins.keys()].sort().join(', '));
    process.exit(1);
  }

  console.log(`Plugin: ${plugin.id}`);
  console.log(`Path: ${plugin.path}`);
  console.log(`Has server: ${plugin.hasServer}`);
  console.log(`Has browser: ${plugin.hasBrowser}`);
  console.log('');

  // Build dependency tree
  console.log('='.repeat(70));
  console.log('DEPENDENCIES (what taskManager needs)');
  console.log('='.repeat(70));
  console.log('');

  const tree = buildDependencyTree(plugins, targetPlugin);
  printTree(tree);

  // Calculate totals
  const allDeps = flattenTree(tree);
  const requiredDeps = allDeps.filter(n => !n.isOptional && !n.notFound && n.id !== targetPlugin);
  const optionalDeps = allDeps.filter(n => n.isOptional && !n.notFound);
  
  const requiredMemory = requiredDeps.reduce((sum, n) => sum + (n.memory || 0), 0);
  const optionalMemory = optionalDeps.reduce((sum, n) => sum + (n.memory || 0), 0);
  const selfMemory = MEASURED_MEMORY[targetPlugin] || 0;

  console.log('');
  console.log('-'.repeat(70));
  console.log(`SUMMARY:`);
  console.log(`  ${targetPlugin} itself:           ${selfMemory.toFixed(1)}MB`);
  console.log(`  Required dependencies:      ${requiredDeps.length} plugins, ${requiredMemory.toFixed(1)}MB`);
  console.log(`  Optional dependencies:      ${optionalDeps.length} plugins, ${optionalMemory.toFixed(1)}MB`);
  console.log(`  TOTAL (with required):      ${(selfMemory + requiredMemory).toFixed(1)}MB`);
  console.log(`  TOTAL (with all):           ${(selfMemory + requiredMemory + optionalMemory).toFixed(1)}MB`);
  console.log('');

  // Reverse dependencies
  console.log('='.repeat(70));
  console.log('REVERSE DEPENDENCIES (what depends on taskManager)');
  console.log('='.repeat(70));
  console.log('');

  const reverseDeps = findReverseDependencies(plugins, targetPlugin);
  const requiredBy = reverseDeps.filter(d => d.type === 'required');
  const optionalBy = reverseDeps.filter(d => d.type === 'optional');

  console.log(`Required by (${requiredBy.length} plugins):`);
  requiredBy.forEach(d => {
    const p = plugins.get(d.id);
    const mem = MEASURED_MEMORY[d.id] || 0;
    console.log(`  - ${d.id} ${mem ? `(${mem.toFixed(1)}MB)` : ''} [${p?.path || 'unknown'}]`);
  });

  console.log('');
  console.log(`Optional dependency for (${optionalBy.length} plugins):`);
  optionalBy.slice(0, 20).forEach(d => {
    const p = plugins.get(d.id);
    const mem = MEASURED_MEMORY[d.id] || 0;
    console.log(`  - ${d.id} ${mem ? `(${mem.toFixed(1)}MB)` : ''}`);
  });
  if (optionalBy.length > 20) {
    console.log(`  ... and ${optionalBy.length - 20} more`);
  }

  // Calculate memory of plugins that REQUIRE taskManager
  const requiredByMemory = requiredBy.reduce((sum, d) => sum + (MEASURED_MEMORY[d.id] || 0), 0);
  console.log('');
  console.log('-'.repeat(70));
  console.log(`Plugins that REQUIRE ${targetPlugin}: ${requiredBy.length} plugins, ~${requiredByMemory.toFixed(1)}MB`);
  console.log('');

  // Save as JSON for visualization
  const outputPath = path.join(KIBANA_ROOT, 'tmp', `${targetPlugin}_dependency_graph.json`);
  fs.writeFileSync(outputPath, JSON.stringify({
    root: targetPlugin,
    tree,
    reverseDependencies: reverseDeps,
    summary: {
      selfMemory,
      requiredDeps: requiredDeps.map(n => n.id),
      requiredMemory,
      optionalDeps: optionalDeps.map(n => n.id),
      optionalMemory,
      requiredBy: requiredBy.map(d => d.id),
      requiredByMemory,
    }
  }, null, 2));
  console.log(`Graph saved to: ${outputPath}`);
}

main();
