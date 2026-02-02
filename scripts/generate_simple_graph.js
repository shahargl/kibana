#!/usr/bin/env node

/**
 * Generate a SIMPLE, USABLE dependency graph
 * Uses force-directed layout instead of hierarchical
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
            requiredPlugins: manifest.plugin.requiredPlugins || [],
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
  if (mem > 50) return { bg: '#dc3545', text: 'white' };
  if (mem > 20) return { bg: '#fd7e14', text: 'white' };
  if (mem > 10) return { bg: '#ffc107', text: 'black' };
  if (mem > 5) return { bg: '#28a745', text: 'white' };
  if (mem > 0) return { bg: '#17a2b8', text: 'white' };
  return { bg: '#6c757d', text: 'white' };
}

function generateHTML(plugins, rootPluginId) {
  const nodes = [];
  const edges = [];
  const addedNodes = new Set();

  // Root node
  const rootMem = MEASURED_MEMORY[rootPluginId] || 0;
  nodes.push({
    id: rootPluginId,
    label: `${rootPluginId}\n${rootMem.toFixed(1)}MB`,
    color: { background: '#0d6efd', border: '#0a58ca' },
    font: { color: 'white', size: 16, bold: true },
    size: 50,
    borderWidth: 4,
  });
  addedNodes.add(rootPluginId);

  // Dependencies of root (what root needs)
  const rootDeps = getAllDependencies(plugins, rootPluginId);
  rootDeps.delete(rootPluginId);
  
  for (const depId of rootDeps) {
    const mem = MEASURED_MEMORY[depId] || 0;
    const colors = getColorForMemory(mem);
    nodes.push({
      id: depId,
      label: mem > 0 ? `${depId}\n${mem.toFixed(1)}MB` : depId,
      color: { background: colors.bg, border: colors.bg },
      font: { color: colors.text, size: 12 },
      size: Math.max(25, Math.min(45, 25 + mem * 0.3)),
    });
    addedNodes.add(depId);
    
    // Edge from root to dep
    edges.push({
      from: rootPluginId,
      to: depId,
      arrows: 'to',
      color: { color: '#666' },
      width: 2,
      label: 'needs',
      font: { size: 10, color: '#666' },
    });
  }

  // Reverse dependencies (what needs root) - ONLY direct dependents
  const reverseDeps = getReverseDependencies(plugins, rootPluginId);
  
  for (const depId of reverseDeps) {
    const mem = MEASURED_MEMORY[depId] || 0;
    const colors = getColorForMemory(mem);
    
    if (!addedNodes.has(depId)) {
      nodes.push({
        id: depId,
        label: mem > 0 ? `${depId}\n${mem.toFixed(1)}MB` : depId,
        color: { background: colors.bg, border: '#0d6efd' },
        font: { color: colors.text, size: 12 },
        size: Math.max(25, Math.min(45, 25 + mem * 0.3)),
        borderWidth: 3,
      });
      addedNodes.add(depId);
    }
    
    edges.push({
      from: depId,
      to: rootPluginId,
      arrows: 'to',
      color: { color: '#0d6efd' },
      width: 2,
    });
  }

  // Stats
  const rootOnlyMem = rootMem + [...rootDeps].reduce((sum, id) => sum + (MEASURED_MEMORY[id] || 0), 0);
  const dependentsMem = reverseDeps.reduce((sum, id) => sum + (MEASURED_MEMORY[id] || 0), 0);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Dependency Graph: ${rootPluginId}</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
    h1 { color: #212529; margin: 0 0 15px 0; }
    #graph { width: 100%; height: 600px; border: 1px solid #dee2e6; background: white; border-radius: 8px; }
    .info { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 15px; }
    .card { background: white; padding: 15px; border-radius: 8px; border: 1px solid #dee2e6; }
    .card h3 { margin: 0 0 5px 0; font-size: 13px; color: #6c757d; text-transform: uppercase; }
    .card .value { font-size: 28px; font-weight: bold; color: #212529; }
    .card .sub { font-size: 12px; color: #6c757d; }
    .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
    .legend span { display: flex; align-items: center; gap: 5px; font-size: 12px; }
    .legend .dot { width: 14px; height: 14px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>📊 ${rootPluginId} - Dependency Graph</h1>
  
  <div class="info">
    <div class="card">
      <h3>${rootPluginId} + its deps</h3>
      <div class="value">${rootOnlyMem.toFixed(1)} MB</div>
      <div class="sub">${rootDeps.size + 1} plugins</div>
    </div>
    <div class="card">
      <h3>Plugins that need ${rootPluginId}</h3>
      <div class="value">${reverseDeps.length}</div>
      <div class="sub">~${dependentsMem.toFixed(1)} MB total</div>
    </div>
    <div class="card">
      <h3>Shown in graph</h3>
      <div class="value">${nodes.length}</div>
      <div class="sub">Direct connections only</div>
    </div>
  </div>

  <div class="legend">
    <span><div class="dot" style="background:#0d6efd"></div> ${rootPluginId}</span>
    <span><div class="dot" style="background:#dc3545"></div> >50MB</span>
    <span><div class="dot" style="background:#fd7e14"></div> >20MB</span>
    <span><div class="dot" style="background:#ffc107"></div> >10MB</span>
    <span><div class="dot" style="background:#28a745"></div> >5MB</span>
    <span><div class="dot" style="background:#17a2b8"></div> <5MB</span>
    <span>| Blue border = depends on ${rootPluginId}</span>
  </div>

  <div id="graph"></div>

  <script>
    const nodes = new vis.DataSet(${JSON.stringify(nodes)});
    const edges = new vis.DataSet(${JSON.stringify(edges)});
    
    new vis.Network(document.getElementById('graph'), { nodes, edges }, {
      physics: {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: { gravitationalConstant: -100, springLength: 150, springConstant: 0.05 },
        stabilization: { iterations: 200 }
      },
      nodes: { shape: 'box', margin: 10 },
      edges: { smooth: { type: 'continuous' } },
      interaction: { hover: true, zoomView: true, dragView: true }
    });
  </script>
</body>
</html>`;
}

// Main
const plugins = findAllPlugins();
const outputDir = path.join(KIBANA_ROOT, 'tmp', 'dependency_graphs');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const html = generateHTML(plugins, targetPlugin);
const htmlPath = path.join(outputDir, `${targetPlugin}_simple.html`);
fs.writeFileSync(htmlPath, html);
console.log(`Generated: ${htmlPath}`);
console.log(`Open: file://${htmlPath}`);
