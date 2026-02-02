#!/usr/bin/env node

/**
 * Generate FULL dependency graph showing:
 * 1. What the plugin depends on (recursive, unlimited depth)
 * 2. What depends on the plugin (reverse deps)
 * 3. What those reverse deps pull in transitively
 * 
 * Usage: node scripts/generate_full_dependency_graph.js [pluginId]
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
  'alerting': 2.1, 'licensing': 0.8, 'spaces': 1.1, 'security': 1.5, 
  'eventLog': 0.9, 'stackConnectors': 1.0,
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
            hasBrowser: manifest.plugin.browser === true,
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

// Get ALL transitive dependencies (unlimited depth)
function getAllDependencies(plugins, pluginId, visited = new Set()) {
  if (visited.has(pluginId)) return visited;
  visited.add(pluginId);
  
  const plugin = plugins.get(pluginId);
  if (!plugin) return visited;
  
  for (const dep of plugin.requiredPlugins) {
    getAllDependencies(plugins, dep, visited);
  }
  return visited;
}

// Get all plugins that depend on this one
function getReverseDependencies(plugins, pluginId) {
  const dependents = [];
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(pluginId)) {
      dependents.push(id);
    }
  }
  return dependents;
}

function getColorForMemory(mem) {
  if (mem > 50) return '#ff4444';
  if (mem > 20) return '#ff8844';
  if (mem > 10) return '#ffcc44';
  if (mem > 5) return '#88cc44';
  if (mem > 0) return '#44aa88';
  return '#cccccc';
}

function generateHTML(plugins, rootPluginId) {
  const nodes = new Map();
  const edges = [];
  
  // 1. Add root plugin
  const rootMem = MEASURED_MEMORY[rootPluginId] || 0;
  nodes.set(rootPluginId, {
    id: rootPluginId,
    label: `${rootPluginId}\n${rootMem.toFixed(1)}MB`,
    color: '#4488ff',
    font: { color: 'white', size: 14, bold: true },
    borderWidth: 4,
    size: 40,
    group: 'root',
  });

  // 2. Add ALL dependencies of root (what root needs) - FULL DEPTH
  const rootDeps = getAllDependencies(plugins, rootPluginId);
  rootDeps.delete(rootPluginId);
  
  for (const depId of rootDeps) {
    const mem = MEASURED_MEMORY[depId] || 0;
    nodes.set(depId, {
      id: depId,
      label: mem > 0 ? `${depId}\n${mem.toFixed(1)}MB` : depId,
      color: getColorForMemory(mem),
      font: { color: mem > 50 ? 'white' : 'black' },
      size: Math.max(20, Math.min(50, 20 + mem * 0.5)),
      group: 'dependency',
    });
  }

  // Add edges for root's dependencies
  function addDependencyEdges(pluginId, visited = new Set()) {
    if (visited.has(pluginId)) return;
    visited.add(pluginId);
    
    const plugin = plugins.get(pluginId);
    if (!plugin) return;
    
    for (const dep of plugin.requiredPlugins) {
      if (nodes.has(dep) || rootDeps.has(dep)) {
        edges.push({ 
          from: pluginId, 
          to: dep, 
          arrows: 'to', 
          color: { color: '#666' },
          width: 1,
        });
        addDependencyEdges(dep, visited);
      }
    }
  }
  addDependencyEdges(rootPluginId);

  // 3. Add reverse dependencies (what depends on root)
  const reverseDeps = getReverseDependencies(plugins, rootPluginId);
  
  for (const depId of reverseDeps) {
    const mem = MEASURED_MEMORY[depId] || 0;
    if (!nodes.has(depId)) {
      nodes.set(depId, {
        id: depId,
        label: mem > 0 ? `${depId}\n${mem.toFixed(1)}MB` : depId,
        color: getColorForMemory(mem),
        font: { color: mem > 50 ? 'white' : 'black' },
        size: Math.max(20, Math.min(50, 20 + mem * 0.5)),
        group: 'dependent',
        borderWidth: 2,
        shapeProperties: { borderDashes: false },
      });
    }
    edges.push({ 
      from: depId, 
      to: rootPluginId, 
      arrows: 'to', 
      color: { color: '#4488ff' },
      width: 2,
    });
  }

  // 4. Add what the reverse deps pull in (transitive)
  const transitiveFromDependents = new Set();
  for (const depId of reverseDeps) {
    const transDeps = getAllDependencies(plugins, depId);
    transDeps.delete(depId);
    transDeps.delete(rootPluginId);
    
    for (const transId of transDeps) {
      if (!rootDeps.has(transId)) {
        transitiveFromDependents.add(transId);
      }
    }
  }

  // Add transitive nodes (from dependents)
  for (const transId of transitiveFromDependents) {
    if (!nodes.has(transId)) {
      const mem = MEASURED_MEMORY[transId] || 0;
      nodes.set(transId, {
        id: transId,
        label: mem > 0 ? `${transId}\n${mem.toFixed(1)}MB` : transId,
        color: getColorForMemory(mem),
        font: { color: mem > 50 ? 'white' : 'black', size: 10 },
        size: Math.max(15, Math.min(40, 15 + mem * 0.4)),
        group: 'transitive',
        opacity: 0.7,
      });
    }
  }

  // Add edges for reverse deps' dependencies
  for (const depId of reverseDeps) {
    const plugin = plugins.get(depId);
    if (!plugin) continue;
    
    for (const reqId of plugin.requiredPlugins) {
      if (nodes.has(reqId) && reqId !== rootPluginId) {
        edges.push({ 
          from: depId, 
          to: reqId, 
          arrows: 'to', 
          color: { color: '#aaa' },
          width: 1,
          dashes: true,
        });
      }
    }
  }

  // Calculate stats
  const rootOnlyMem = rootMem + [...rootDeps].reduce((sum, id) => sum + (MEASURED_MEMORY[id] || 0), 0);
  const dependentsMem = reverseDeps.reduce((sum, id) => sum + (MEASURED_MEMORY[id] || 0), 0);
  const transitiveMem = [...transitiveFromDependents].reduce((sum, id) => sum + (MEASURED_MEMORY[id] || 0), 0);
  const totalMem = rootOnlyMem + dependentsMem + transitiveMem;

  return `<!DOCTYPE html>
<html>
<head>
  <title>Full Dependency Graph: ${rootPluginId}</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; margin-bottom: 10px; }
    #graph { width: 100%; height: 800px; border: 1px solid #ddd; background: white; }
    .stats { margin: 10px 0; padding: 15px; background: white; border-radius: 5px; display: flex; gap: 30px; flex-wrap: wrap; }
    .stat-box { padding: 10px; background: #f8f8f8; border-radius: 5px; }
    .stat-box h3 { margin: 0 0 5px 0; font-size: 14px; color: #666; }
    .stat-box .value { font-size: 24px; font-weight: bold; color: #333; }
    .stat-box .detail { font-size: 12px; color: #888; }
    .legend { display: flex; gap: 15px; margin: 10px 0; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 5px; font-size: 12px; }
    .legend-color { width: 16px; height: 16px; border-radius: 3px; }
    .explanation { background: #fffbe6; padding: 15px; border-radius: 5px; margin: 10px 0; border-left: 4px solid #ffcc00; }
  </style>
</head>
<body>
  <h1>Full Dependency Graph: ${rootPluginId}</h1>
  
  <div class="explanation">
    <strong>Understanding this graph:</strong><br>
    <ul style="margin: 5px 0; padding-left: 20px;">
      <li><strong>${rootPluginId} itself</strong> only needs ${rootDeps.size} plugins (${rootOnlyMem.toFixed(1)}MB)</li>
      <li><strong>BUT</strong> ${reverseDeps.length} plugins depend on ${rootPluginId}</li>
      <li>Those plugins pull in ${transitiveFromDependents.size} additional transitive dependencies</li>
      <li><strong>Total when all loaded:</strong> ${nodes.size} plugins (~${totalMem.toFixed(1)}MB)</li>
    </ul>
  </div>
  
  <div class="stats">
    <div class="stat-box">
      <h3>${rootPluginId} + its deps</h3>
      <div class="value">${rootOnlyMem.toFixed(1)}MB</div>
      <div class="detail">${rootDeps.size + 1} plugins</div>
    </div>
    <div class="stat-box">
      <h3>Plugins requiring ${rootPluginId}</h3>
      <div class="value">${dependentsMem.toFixed(1)}MB</div>
      <div class="detail">${reverseDeps.length} plugins</div>
    </div>
    <div class="stat-box">
      <h3>Transitive from dependents</h3>
      <div class="value">${transitiveMem.toFixed(1)}MB</div>
      <div class="detail">${transitiveFromDependents.size} plugins</div>
    </div>
    <div class="stat-box" style="background: #e6f3ff;">
      <h3>TOTAL (all loaded)</h3>
      <div class="value">${totalMem.toFixed(1)}MB</div>
      <div class="detail">${nodes.size} plugins</div>
    </div>
  </div>
  
  <div class="legend">
    <div class="legend-item"><div class="legend-color" style="background:#4488ff"></div> ${rootPluginId} (root)</div>
    <div class="legend-item"><div class="legend-color" style="background:#ff4444"></div> >50MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#ff8844"></div> >20MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#ffcc44"></div> >10MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#88cc44"></div> >5MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#44aa88"></div> <5MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#cccccc"></div> Unknown</div>
  </div>
  
  <div class="legend">
    <div class="legend-item">─── Required dependency</div>
    <div class="legend-item" style="color:#4488ff">━━ Depends on ${rootPluginId}</div>
    <div class="legend-item">- - - Transitive dependency</div>
  </div>
  
  <div id="graph"></div>
  
  <script>
    const nodes = new vis.DataSet(${JSON.stringify([...nodes.values()])});
    const edges = new vis.DataSet(${JSON.stringify(edges)});
    
    const container = document.getElementById('graph');
    const data = { nodes, edges };
    const options = {
      layout: {
        improvedLayout: true,
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'hubsize',
          levelSeparation: 120,
          nodeSpacing: 180,
          treeSpacing: 200,
          blockShifting: true,
          edgeMinimization: true,
          parentCentralization: true,
        }
      },
      physics: {
        enabled: false,
      },
      nodes: {
        shape: 'box',
        margin: 10,
        font: { size: 11 },
      },
      edges: {
        smooth: { 
          type: 'cubicBezier',
          forceDirection: 'vertical',
        },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
        navigationButtons: true,
        keyboard: true,
      },
    };
    
    const network = new vis.Network(container, data, options);
    
    // Fit to screen after render
    network.once('stabilized', function() {
      network.fit({ animation: true });
    });
  </script>
</body>
</html>`;
}

function main() {
  const plugins = findAllPlugins();
  console.log(`Found ${plugins.size} plugins`);

  if (!plugins.has(targetPlugin)) {
    console.error(`Plugin "${targetPlugin}" not found!`);
    process.exit(1);
  }

  const outputDir = path.join(KIBANA_ROOT, 'tmp', 'dependency_graphs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Generating FULL graph for: ${targetPlugin}`);

  const html = generateHTML(plugins, targetPlugin);
  const htmlPath = path.join(outputDir, `${targetPlugin}_full_graph.html`);
  fs.writeFileSync(htmlPath, html);
  console.log(`HTML: ${htmlPath}`);

  // Also print summary
  const rootDeps = getAllDependencies(plugins, targetPlugin);
  const reverseDeps = getReverseDependencies(plugins, targetPlugin);
  
  console.log(`\nSUMMARY:`);
  console.log(`  ${targetPlugin}'s dependencies: ${rootDeps.size - 1} plugins`);
  console.log(`  Plugins that require ${targetPlugin}: ${reverseDeps.length} plugins`);
  
  console.log(`\nOpen in browser: file://${htmlPath}`);
}

main();
