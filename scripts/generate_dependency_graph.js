#!/usr/bin/env node

/**
 * Generate visual dependency graphs in multiple formats:
 * - HTML (interactive with vis.js)
 * - DOT (for Graphviz)
 * - Mermaid (for GitHub/docs)
 * 
 * Usage: 
 *   node scripts/generate_dependency_graph.js [pluginId] [--format=html|dot|mermaid|all]
 *   node scripts/generate_dependency_graph.js taskManager --format=html
 *   node scripts/generate_dependency_graph.js --all --format=html  # Generate for ALL plugins
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

// Parse arguments
let targetPlugin = null;
let generateAll = false;
let format = 'html';

for (const arg of args) {
  if (arg === '--all') {
    generateAll = true;
  } else if (arg.startsWith('--format=')) {
    format = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    targetPlugin = arg;
  }
}

if (!targetPlugin && !generateAll) {
  targetPlugin = 'taskManager';
}

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

function getColorForMemory(mem) {
  if (mem > 50) return '#ff4444';  // Red for heavy
  if (mem > 20) return '#ff8844';  // Orange
  if (mem > 10) return '#ffcc44';  // Yellow
  if (mem > 5) return '#88cc44';   // Light green
  return '#44aa88';                 // Green for light
}

function generateMermaid(plugins, rootPluginId) {
  const lines = ['flowchart TD'];
  const visited = new Set();
  const edges = [];

  function addNode(pluginId, depth = 0) {
    if (visited.has(pluginId) || depth > 3) return;
    visited.add(pluginId);

    const plugin = plugins.get(pluginId);
    if (!plugin) return;

    const mem = MEASURED_MEMORY[pluginId] || 0;
    const label = mem > 0 ? `${pluginId}[${pluginId}<br/>${mem.toFixed(1)}MB]` : `${pluginId}[${pluginId}]`;
    
    // Add required dependencies
    for (const dep of plugin.requiredPlugins) {
      edges.push(`  ${pluginId} --> ${dep}`);
      addNode(dep, depth + 1);
    }
    
    // Add optional dependencies (dashed)
    for (const dep of plugin.optionalPlugins.slice(0, 5)) { // Limit optional
      edges.push(`  ${pluginId} -.-> ${dep}`);
    }
  }

  addNode(rootPluginId);

  // Add reverse dependencies
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(rootPluginId) && !visited.has(id)) {
      edges.push(`  ${id} --> ${rootPluginId}`);
      visited.add(id);
    }
  }

  return lines.concat([...new Set(edges)]).join('\n');
}

function generateDot(plugins, rootPluginId) {
  const lines = [
    'digraph G {',
    '  rankdir=TB;',
    '  node [shape=box, style="rounded,filled", fontname="Arial"];',
    '  edge [fontname="Arial", fontsize=10];',
    '',
  ];

  const visited = new Set();
  const edges = [];
  const nodes = new Map();

  function addNode(pluginId, depth = 0) {
    if (visited.has(pluginId) || depth > 4) return;
    visited.add(pluginId);

    const plugin = plugins.get(pluginId);
    const mem = MEASURED_MEMORY[pluginId] || 0;
    const color = getColorForMemory(mem);
    const label = mem > 0 ? `${pluginId}\\n${mem.toFixed(1)}MB` : pluginId;
    
    nodes.set(pluginId, `  "${pluginId}" [label="${label}", fillcolor="${color}"];`);

    if (!plugin) return;

    for (const dep of plugin.requiredPlugins) {
      edges.push(`  "${pluginId}" -> "${dep}";`);
      addNode(dep, depth + 1);
    }
    
    for (const dep of plugin.optionalPlugins.slice(0, 3)) {
      edges.push(`  "${pluginId}" -> "${dep}" [style=dashed, color=gray];`);
    }
  }

  addNode(rootPluginId);

  // Reverse dependencies
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(rootPluginId)) {
      const mem = MEASURED_MEMORY[id] || 0;
      const color = getColorForMemory(mem);
      const label = mem > 0 ? `${id}\\n${mem.toFixed(1)}MB` : id;
      nodes.set(id, `  "${id}" [label="${label}", fillcolor="${color}"];`);
      edges.push(`  "${id}" -> "${rootPluginId}" [color=blue];`);
    }
  }

  // Highlight root
  const rootMem = MEASURED_MEMORY[rootPluginId] || 0;
  nodes.set(rootPluginId, `  "${rootPluginId}" [label="${rootPluginId}\\n${rootMem.toFixed(1)}MB", fillcolor="#4488ff", fontcolor=white, penwidth=3];`);

  lines.push(...nodes.values());
  lines.push('');
  lines.push(...[...new Set(edges)]);
  lines.push('}');

  return lines.join('\n');
}

function generateHTML(plugins, rootPluginId) {
  const nodes = [];
  const edges = [];
  const visited = new Set();

  function addNode(pluginId, depth = 0) {
    if (visited.has(pluginId) || depth > 4) return;
    visited.add(pluginId);

    const plugin = plugins.get(pluginId);
    const mem = MEASURED_MEMORY[pluginId] || 0;
    const color = getColorForMemory(mem);
    const isRoot = pluginId === rootPluginId;
    
    nodes.push({
      id: pluginId,
      label: mem > 0 ? `${pluginId}\n${mem.toFixed(1)}MB` : pluginId,
      color: isRoot ? '#4488ff' : color,
      font: { color: isRoot || mem > 50 ? 'white' : 'black' },
      borderWidth: isRoot ? 3 : 1,
      size: Math.max(15, Math.min(50, 15 + mem)),
    });

    if (!plugin) return;

    for (const dep of plugin.requiredPlugins) {
      edges.push({ from: pluginId, to: dep, arrows: 'to', color: { color: '#666' } });
      addNode(dep, depth + 1);
    }
    
    for (const dep of plugin.optionalPlugins.slice(0, 3)) {
      if (plugins.has(dep)) {
        edges.push({ from: pluginId, to: dep, arrows: 'to', dashes: true, color: { color: '#aaa' } });
      }
    }
  }

  addNode(rootPluginId);

  // Reverse dependencies (what depends on root)
  for (const [id, plugin] of plugins) {
    if (plugin.requiredPlugins.includes(rootPluginId) && !visited.has(id)) {
      const mem = MEASURED_MEMORY[id] || 0;
      const color = getColorForMemory(mem);
      nodes.push({
        id,
        label: mem > 0 ? `${id}\n${mem.toFixed(1)}MB` : id,
        color,
        font: { color: mem > 50 ? 'white' : 'black' },
        size: Math.max(15, Math.min(50, 15 + mem)),
      });
      edges.push({ from: id, to: rootPluginId, arrows: 'to', color: { color: '#4488ff' }, width: 2 });
      visited.add(id);
    }
  }

  // Calculate stats
  const totalMem = nodes.reduce((sum, n) => {
    const match = n.label.match(/(\d+\.?\d*)MB/);
    return sum + (match ? parseFloat(match[1]) : 0);
  }, 0);

  return `<!DOCTYPE html>
<html>
<head>
  <title>Dependency Graph: ${rootPluginId}</title>
  <script src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { color: #333; }
    #graph { width: 100%; height: 700px; border: 1px solid #ddd; background: white; }
    .stats { margin: 10px 0; padding: 15px; background: white; border-radius: 5px; }
    .legend { display: flex; gap: 20px; margin: 10px 0; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-color { width: 20px; height: 20px; border-radius: 3px; }
  </style>
</head>
<body>
  <h1>Dependency Graph: ${rootPluginId}</h1>
  
  <div class="stats">
    <strong>Stats:</strong> ${nodes.length} plugins shown | Total memory: ~${totalMem.toFixed(1)}MB
  </div>
  
  <div class="legend">
    <div class="legend-item"><div class="legend-color" style="background:#4488ff"></div> Root plugin</div>
    <div class="legend-item"><div class="legend-color" style="background:#ff4444"></div> >50MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#ff8844"></div> >20MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#ffcc44"></div> >10MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#88cc44"></div> >5MB</div>
    <div class="legend-item"><div class="legend-color" style="background:#44aa88"></div> <5MB</div>
  </div>
  
  <div class="legend">
    <div class="legend-item">─── Required dependency</div>
    <div class="legend-item">- - - Optional dependency</div>
    <div class="legend-item" style="color:#4488ff">─── Depends on ${rootPluginId}</div>
  </div>
  
  <div id="graph"></div>
  
  <script>
    const nodes = new vis.DataSet(${JSON.stringify(nodes)});
    const edges = new vis.DataSet(${JSON.stringify(edges)});
    
    const container = document.getElementById('graph');
    const data = { nodes, edges };
    const options = {
      layout: {
        hierarchical: {
          direction: 'UD',
          sortMethod: 'directed',
          levelSeparation: 100,
          nodeSpacing: 150,
        }
      },
      physics: false,
      nodes: {
        shape: 'box',
        margin: 10,
        font: { size: 12 },
      },
      edges: {
        smooth: { type: 'cubicBezier' },
      },
      interaction: {
        hover: true,
        tooltipDelay: 100,
      },
    };
    
    const network = new vis.Network(container, data, options);
    
    // Add click handler
    network.on('click', function(params) {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0];
        console.log('Clicked:', nodeId);
      }
    });
  </script>
</body>
</html>`;
}

function main() {
  const plugins = findAllPlugins();
  console.log(`Found ${plugins.size} plugins`);

  const outputDir = path.join(KIBANA_ROOT, 'tmp', 'dependency_graphs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const pluginsToGenerate = generateAll 
    ? [...plugins.keys()].filter(id => plugins.get(id).hasServer)
    : [targetPlugin];

  for (const pluginId of pluginsToGenerate) {
    if (!plugins.has(pluginId)) {
      console.error(`Plugin "${pluginId}" not found!`);
      continue;
    }

    console.log(`Generating graph for: ${pluginId}`);

    if (format === 'html' || format === 'all') {
      const html = generateHTML(plugins, pluginId);
      const htmlPath = path.join(outputDir, `${pluginId}_graph.html`);
      fs.writeFileSync(htmlPath, html);
      console.log(`  HTML: ${htmlPath}`);
    }

    if (format === 'dot' || format === 'all') {
      const dot = generateDot(plugins, pluginId);
      const dotPath = path.join(outputDir, `${pluginId}_graph.dot`);
      fs.writeFileSync(dotPath, dot);
      console.log(`  DOT:  ${dotPath}`);
      console.log(`        (render with: dot -Tpng ${dotPath} -o ${pluginId}_graph.png)`);
    }

    if (format === 'mermaid' || format === 'all') {
      const mermaid = generateMermaid(plugins, pluginId);
      const mermaidPath = path.join(outputDir, `${pluginId}_graph.mmd`);
      fs.writeFileSync(mermaidPath, mermaid);
      console.log(`  Mermaid: ${mermaidPath}`);
    }
  }

  console.log(`\nGraphs saved to: ${outputDir}`);
  
  if (format === 'html' && !generateAll) {
    console.log(`\nOpen in browser: file://${path.join(outputDir, `${targetPlugin}_graph.html`)}`);
  }
}

main();
