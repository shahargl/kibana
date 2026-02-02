#!/usr/bin/env node

/**
 * Heap Snapshot Analyzer - Group memory by plugin
 * 
 * This script connects to a running Kibana instance via Chrome DevTools Protocol
 * and takes a heap snapshot, then analyzes it to group memory by plugin.
 * 
 * Usage:
 *   1. Start Kibana with --inspect:
 *      node --inspect scripts/kibana --dev
 *   
 *   2. Run this script:
 *      node scripts/analyze_heap_by_plugin.js
 * 
 * Output: Memory breakdown grouped by plugin/package
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const INSPECTOR_HOST = process.env.INSPECTOR_HOST || '127.0.0.1';
const INSPECTOR_PORT = process.env.INSPECTOR_PORT || 9229;
const OUTPUT_DIR = path.join(__dirname, '..', 'tmp', 'heap_analysis');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

/**
 * Connect to Chrome DevTools Protocol
 */
async function getWebSocketUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${INSPECTOR_HOST}:${INSPECTOR_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const target = targets.find(t => t.type === 'node');
          if (target) {
            resolve(target.webSocketDebuggerUrl);
          } else {
            reject(new Error('No Node.js target found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Connection timeout'));
    });
  });
}

/**
 * Take heap snapshot via CDP
 */
async function takeHeapSnapshot(wsUrl) {
  const WebSocket = require('ws');
  
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    let snapshotChunks = [];
    
    ws.on('open', () => {
      console.log('Connected to inspector');
      
      // Take heap snapshot
      ws.send(JSON.stringify({
        id: msgId++,
        method: 'HeapProfiler.takeHeapSnapshot',
        params: { reportProgress: true }
      }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        snapshotChunks.push(msg.params.chunk);
      } else if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress') {
        const { done, total } = msg.params;
        process.stdout.write(`\rSnapshot progress: ${Math.round(done/total*100)}%`);
      } else if (msg.id && !msg.error) {
        console.log('\nSnapshot complete');
        ws.close();
        resolve(snapshotChunks.join(''));
      } else if (msg.error) {
        reject(new Error(msg.error.message));
      }
    });
    
    ws.on('error', reject);
  });
}

/**
 * Parse heap snapshot and group by plugin
 */
function analyzeSnapshot(snapshotJson) {
  console.log('Parsing snapshot...');
  const snapshot = JSON.parse(snapshotJson);
  
  const { nodes, edges, strings, snapshot: meta } = snapshot;
  const nodeFields = meta.node_fields;
  const edgeFields = meta.edge_fields;
  
  // Field indices
  const nodeTypeIdx = nodeFields.indexOf('type');
  const nodeNameIdx = nodeFields.indexOf('name');
  const nodeSizeIdx = nodeFields.indexOf('self_size');
  const nodeRetainedIdx = nodeFields.indexOf('retained_size');
  const nodeEdgeCountIdx = nodeFields.indexOf('edge_count');
  
  const nodeFieldCount = nodeFields.length;
  const edgeFieldCount = edgeFields.length;
  
  // Node types
  const nodeTypes = meta.node_types[0];
  
  console.log(`Analyzing ${nodes.length / nodeFieldCount} nodes...`);
  
  // Aggregate by path patterns
  const byPlugin = new Map();
  const byPackage = new Map();
  const byType = new Map();
  
  // Helper to extract plugin name from a string
  function extractPlugin(str) {
    if (!str) return null;
    
    // Match plugin paths
    const pluginMatch = str.match(/plugins[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
    if (pluginMatch) return pluginMatch[1];
    
    // Match x-pack plugin paths
    const xpackMatch = str.match(/x-pack[\/\\](?:plugins|platform)[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
    if (xpackMatch) return xpackMatch[1];
    
    // Match @kbn packages
    const kbnMatch = str.match(/@kbn[\/\\]([^\/\\]+)/);
    if (kbnMatch) return `@kbn/${kbnMatch[1]}`;
    
    return null;
  }
  
  function extractPackage(str) {
    if (!str) return null;
    
    // Match node_modules packages
    const match = str.match(/node_modules[\/\\](@[^\/\\]+[\/\\][^\/\\]+|[^\/\\]+)/);
    if (match) return match[1];
    
    return null;
  }
  
  // Process nodes
  for (let i = 0; i < nodes.length; i += nodeFieldCount) {
    const type = nodeTypes[nodes[i + nodeTypeIdx]];
    const nameIdx = nodes[i + nodeNameIdx];
    const selfSize = nodes[i + nodeSizeIdx];
    const retainedSize = nodes[i + nodeRetainedIdx] || selfSize;
    
    const name = strings[nameIdx] || '';
    
    // Skip tiny allocations
    if (selfSize < 100) continue;
    
    // Try to attribute to plugin
    const plugin = extractPlugin(name);
    if (plugin) {
      const current = byPlugin.get(plugin) || { selfSize: 0, retainedSize: 0, count: 0 };
      current.selfSize += selfSize;
      current.retainedSize += retainedSize;
      current.count++;
      byPlugin.set(plugin, current);
    }
    
    // Try to attribute to package
    const pkg = extractPackage(name);
    if (pkg) {
      const current = byPackage.get(pkg) || { selfSize: 0, retainedSize: 0, count: 0 };
      current.selfSize += selfSize;
      current.retainedSize += retainedSize;
      current.count++;
      byPackage.set(pkg, current);
    }
    
    // Aggregate by type
    const current = byType.get(type) || { selfSize: 0, retainedSize: 0, count: 0 };
    current.selfSize += selfSize;
    current.retainedSize += retainedSize;
    current.count++;
    byType.set(type, current);
  }
  
  return { byPlugin, byPackage, byType };
}

/**
 * Alternative: Analyze require.cache to estimate memory per plugin
 */
function analyzeRequireCache() {
  console.log('\n=== Analyzing require.cache (module-based estimate) ===\n');
  
  const modulesByPlugin = new Map();
  const modulesByPackage = new Map();
  
  for (const [modulePath, mod] of Object.entries(require.cache)) {
    // Try to attribute to plugin
    let plugin = null;
    const pluginMatch = modulePath.match(/plugins[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
    if (pluginMatch) plugin = pluginMatch[1];
    
    const xpackMatch = modulePath.match(/x-pack[\/\\](?:plugins|platform)[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
    if (xpackMatch) plugin = xpackMatch[1];
    
    if (plugin) {
      const current = modulesByPlugin.get(plugin) || { count: 0, paths: [] };
      current.count++;
      current.paths.push(modulePath);
      modulesByPlugin.set(plugin, current);
    }
    
    // Try to attribute to package
    const pkgMatch = modulePath.match(/node_modules[\/\\](@[^\/\\]+[\/\\][^\/\\]+|[^\/\\]+)/);
    if (pkgMatch) {
      const pkg = pkgMatch[1];
      const current = modulesByPackage.get(pkg) || { count: 0 };
      current.count++;
      modulesByPackage.set(pkg, current);
    }
  }
  
  return { modulesByPlugin, modulesByPackage };
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

/**
 * Main
 */
async function main() {
  console.log('='.repeat(70));
  console.log('HEAP ANALYSIS BY PLUGIN');
  console.log('='.repeat(70));
  console.log('');
  
  try {
    // Try to connect to inspector
    console.log(`Connecting to inspector at ${INSPECTOR_HOST}:${INSPECTOR_PORT}...`);
    const wsUrl = await getWebSocketUrl();
    console.log('Inspector URL:', wsUrl);
    
    // Check if ws module is available
    try {
      require.resolve('ws');
    } catch {
      console.log('\nNote: "ws" module not found. Installing...');
      require('child_process').execSync('yarn add -W ws', { 
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit' 
      });
    }
    
    // Take snapshot
    console.log('\nTaking heap snapshot (this may take a while)...');
    const snapshotJson = await takeHeapSnapshot(wsUrl);
    
    // Save raw snapshot
    const snapshotPath = path.join(OUTPUT_DIR, `heap_${Date.now()}.heapsnapshot`);
    console.log(`\nSaving snapshot to ${snapshotPath}...`);
    fs.writeFileSync(snapshotPath, snapshotJson);
    console.log(`Snapshot saved (${formatBytes(snapshotJson.length)})`);
    
    // Analyze
    const { byPlugin, byPackage, byType } = analyzeSnapshot(snapshotJson);
    
    // Print results
    console.log('\n' + '='.repeat(70));
    console.log('MEMORY BY PLUGIN (self_size)');
    console.log('='.repeat(70));
    
    const sortedPlugins = [...byPlugin.entries()]
      .sort((a, b) => b[1].selfSize - a[1].selfSize)
      .slice(0, 30);
    
    console.log(`${'Plugin'.padEnd(40)} ${'Self Size'.padStart(12)} ${'Retained'.padStart(12)} ${'Objects'.padStart(10)}`);
    console.log('-'.repeat(74));
    
    let totalPluginSize = 0;
    for (const [name, stats] of sortedPlugins) {
      console.log(
        `${name.padEnd(40)} ${formatBytes(stats.selfSize).padStart(12)} ${formatBytes(stats.retainedSize).padStart(12)} ${stats.count.toString().padStart(10)}`
      );
      totalPluginSize += stats.selfSize;
    }
    console.log('-'.repeat(74));
    console.log(`${'TOTAL (top 30)'.padEnd(40)} ${formatBytes(totalPluginSize).padStart(12)}`);
    
    // Packages
    console.log('\n' + '='.repeat(70));
    console.log('MEMORY BY NPM PACKAGE (self_size)');
    console.log('='.repeat(70));
    
    const sortedPackages = [...byPackage.entries()]
      .sort((a, b) => b[1].selfSize - a[1].selfSize)
      .slice(0, 20);
    
    console.log(`${'Package'.padEnd(40)} ${'Self Size'.padStart(12)} ${'Objects'.padStart(10)}`);
    console.log('-'.repeat(62));
    
    for (const [name, stats] of sortedPackages) {
      console.log(
        `${name.substring(0, 39).padEnd(40)} ${formatBytes(stats.selfSize).padStart(12)} ${stats.count.toString().padStart(10)}`
      );
    }
    
    // Types
    console.log('\n' + '='.repeat(70));
    console.log('MEMORY BY OBJECT TYPE');
    console.log('='.repeat(70));
    
    const sortedTypes = [...byType.entries()]
      .sort((a, b) => b[1].selfSize - a[1].selfSize);
    
    console.log(`${'Type'.padEnd(30)} ${'Self Size'.padStart(12)} ${'Objects'.padStart(12)}`);
    console.log('-'.repeat(54));
    
    for (const [type, stats] of sortedTypes) {
      console.log(
        `${type.padEnd(30)} ${formatBytes(stats.selfSize).padStart(12)} ${stats.count.toString().padStart(12)}`
      );
    }
    
    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      snapshotFile: snapshotPath,
      byPlugin: Object.fromEntries(sortedPlugins),
      byPackage: Object.fromEntries(sortedPackages),
      byType: Object.fromEntries(sortedTypes),
    };
    
    const reportPath = path.join(OUTPUT_DIR, 'heap_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nReport saved to ${reportPath}`);
    
    // Also save as markdown
    const mdReport = generateMarkdownReport(sortedPlugins, sortedPackages, sortedTypes);
    const mdPath = path.join(OUTPUT_DIR, 'heap_report.md');
    fs.writeFileSync(mdPath, mdReport);
    console.log(`Markdown report saved to ${mdPath}`);
    
  } catch (error) {
    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      console.log('\nCould not connect to inspector. Make sure Kibana is running with --inspect:');
      console.log('  node --inspect scripts/kibana --dev');
      console.log('\nAlternatively, you can open a heap snapshot file in Chrome DevTools:');
      console.log('  1. Open chrome://inspect');
      console.log('  2. Click "Open dedicated DevTools for Node"');
      console.log('  3. Go to Memory tab');
      console.log('  4. Take a heap snapshot');
      console.log('  5. Save and analyze with this script');
    } else {
      console.error('Error:', error.message);
    }
    process.exit(1);
  }
}

function generateMarkdownReport(byPlugin, byPackage, byType) {
  let md = `# Heap Analysis Report

**Generated:** ${new Date().toISOString()}

## Memory by Plugin

| Plugin | Self Size | Retained | Objects |
|--------|-----------|----------|---------|
`;

  for (const [name, stats] of byPlugin) {
    md += `| ${name} | ${formatBytes(stats.selfSize)} | ${formatBytes(stats.retainedSize)} | ${stats.count} |\n`;
  }

  md += `
## Memory by NPM Package

| Package | Self Size | Objects |
|---------|-----------|---------|
`;

  for (const [name, stats] of byPackage) {
    md += `| ${name} | ${formatBytes(stats.selfSize)} | ${stats.count} |\n`;
  }

  md += `
## Memory by Object Type

| Type | Self Size | Objects |
|------|-----------|---------|
`;

  for (const [type, stats] of byType) {
    md += `| ${type} | ${formatBytes(stats.selfSize)} | ${stats.count} |\n`;
  }

  return md;
}

main();
