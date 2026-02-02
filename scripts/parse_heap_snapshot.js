#!/usr/bin/env node

/**
 * Parse a Chrome DevTools heap snapshot and extract module/plugin information
 * 
 * Usage:
 *   node scripts/parse_heap_snapshot.js <path-to-heapsnapshot>
 * 
 * Example:
 *   node scripts/parse_heap_snapshot.js heap.heapsnapshot
 */

const fs = require('fs');
const path = require('path');

const snapshotPath = process.argv[2];

if (!snapshotPath) {
  console.log('Usage: node scripts/parse_heap_snapshot.js <path-to-heapsnapshot>');
  console.log('');
  console.log('To get a heap snapshot:');
  console.log('  1. Start Kibana: node --inspect scripts/kibana --dev');
  console.log('  2. Open chrome://inspect in Chrome');
  console.log('  3. Click "Open dedicated DevTools for Node"');
  console.log('  4. Go to Memory tab → Take snapshot');
  console.log('  5. Right-click snapshot → Save as .heapsnapshot file');
  process.exit(1);
}

console.log(`Loading snapshot: ${snapshotPath}`);
const snapshotJson = fs.readFileSync(snapshotPath, 'utf-8');

console.log(`Parsing (${(snapshotJson.length / 1024 / 1024).toFixed(1)}MB)...`);
const snapshot = JSON.parse(snapshotJson);

// The snapshot structure has nested 'snapshot' object with 'meta'
const meta = snapshot.snapshot?.meta || snapshot.meta;
const nodes = snapshot.nodes;
const strings = snapshot.strings;

if (!meta || !nodes || !strings) {
  console.error('Invalid heap snapshot format');
  console.error('Keys found:', Object.keys(snapshot));
  process.exit(1);
}

const nodeFields = meta.node_fields;
const nodeTypes = meta.node_types[0];

// Field indices
const nodeTypeIdx = nodeFields.indexOf('type');
const nodeNameIdx = nodeFields.indexOf('name');
const nodeSizeIdx = nodeFields.indexOf('self_size');
const nodeFieldCount = nodeFields.length;

console.log(`Analyzing ${nodes.length / nodeFieldCount} nodes...`);
console.log('');

// Collect strings that look like file paths
const pathStrings = new Map(); // path -> { count, totalSize }
const pluginMemory = new Map(); // plugin -> { size, count, modules: Set }
const packageMemory = new Map(); // package -> { size, count }

// Also track by object type
const typeMemory = new Map();

for (let i = 0; i < nodes.length; i += nodeFieldCount) {
  const typeIndex = nodes[i + nodeTypeIdx];
  const nameIndex = nodes[i + nodeNameIdx];
  const selfSize = nodes[i + nodeSizeIdx];
  
  const typeName = nodeTypes[typeIndex];
  const name = strings[nameIndex] || '';
  
  // Aggregate by type
  const typeStats = typeMemory.get(typeName) || { size: 0, count: 0 };
  typeStats.size += selfSize;
  typeStats.count++;
  typeMemory.set(typeName, typeStats);
  
  // Look for file paths in strings
  if (typeName === 'string' || typeName === 'concatenated string') {
    // Check if it's a file path
    if (name.includes('/kibana/') || name.includes('\\kibana\\')) {
      
      // Extract plugin name
      let plugin = null;
      const pluginMatch = name.match(/[\/\\](?:plugins|platform)[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
      if (pluginMatch) {
        plugin = pluginMatch[1];
      }
      
      // Extract package name
      let pkg = null;
      const pkgMatch = name.match(/node_modules[\/\\](@[^\/\\]+[\/\\][^\/\\]+|[^\/\\]+)/);
      if (pkgMatch) {
        pkg = pkgMatch[1];
      }
      
      if (plugin) {
        const stats = pluginMemory.get(plugin) || { size: 0, count: 0, strings: [] };
        stats.size += selfSize;
        stats.count++;
        if (stats.strings.length < 5) stats.strings.push(name.substring(0, 100));
        pluginMemory.set(plugin, stats);
      }
      
      if (pkg) {
        const stats = packageMemory.get(pkg) || { size: 0, count: 0 };
        stats.size += selfSize;
        stats.count++;
        packageMemory.set(pkg, stats);
      }
    }
  }
  
  // Look for Module objects (require.cache entries)
  if (name === 'Module' || (typeName === 'object' && name.includes('Module'))) {
    // This is a cached module
  }
}

// Output results
console.log('='.repeat(70));
console.log('MEMORY BY OBJECT TYPE (shallow size)');
console.log('='.repeat(70));

const sortedTypes = [...typeMemory.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 20);

console.log(`${'Type'.padEnd(30)} ${'Size'.padStart(12)} ${'Count'.padStart(12)}`);
console.log('-'.repeat(54));

for (const [type, stats] of sortedTypes) {
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`${type.padEnd(30)} ${(sizeMB + 'MB').padStart(12)} ${stats.count.toString().padStart(12)}`);
}

// Plugin memory (from path strings)
console.log('');
console.log('='.repeat(70));
console.log('STRINGS CONTAINING PLUGIN PATHS (indicates plugin footprint)');
console.log('='.repeat(70));

const sortedPlugins = [...pluginMemory.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 30);

console.log(`${'Plugin'.padEnd(35)} ${'String Size'.padStart(12)} ${'Count'.padStart(10)}`);
console.log('-'.repeat(57));

let totalPluginStringSize = 0;
for (const [plugin, stats] of sortedPlugins) {
  const sizeMB = (stats.size / 1024).toFixed(1);
  console.log(`${plugin.padEnd(35)} ${(sizeMB + 'KB').padStart(12)} ${stats.count.toString().padStart(10)}`);
  totalPluginStringSize += stats.size;
}
console.log('-'.repeat(57));
console.log(`${'TOTAL'.padEnd(35)} ${((totalPluginStringSize / 1024).toFixed(1) + 'KB').padStart(12)}`);

// Package memory
console.log('');
console.log('='.repeat(70));
console.log('STRINGS CONTAINING NODE_MODULES PATHS');
console.log('='.repeat(70));

const sortedPackages = [...packageMemory.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 20);

console.log(`${'Package'.padEnd(40)} ${'String Size'.padStart(12)} ${'Count'.padStart(10)}`);
console.log('-'.repeat(62));

for (const [pkg, stats] of sortedPackages) {
  const sizeMB = (stats.size / 1024).toFixed(1);
  console.log(`${pkg.substring(0, 39).padEnd(40)} ${(sizeMB + 'KB').padStart(12)} ${stats.count.toString().padStart(10)}`);
}

// Now let's look for objects that reference plugin paths
console.log('');
console.log('='.repeat(70));
console.log('ANALYSIS NOTES');
console.log('='.repeat(70));
console.log('');
console.log('The "String Size" above only counts strings containing file paths.');
console.log('This is a LOWER BOUND for plugin memory because:');
console.log('  - It only counts path strings, not code/data');
console.log('  - Functions, objects, arrays created by plugins are not counted');
console.log('');
console.log('To estimate ACTUAL plugin memory, multiply string count by ~10-50x');
console.log('(each module path string typically corresponds to ~10-50KB of objects)');
console.log('');

// Rough estimate
console.log('ROUGH ESTIMATES (based on module count heuristic):');
console.log('-'.repeat(57));
for (const [plugin, stats] of sortedPlugins.slice(0, 15)) {
  // Assume ~20KB per module path string found
  const estimatedMB = (stats.count * 20 / 1024).toFixed(1);
  console.log(`${plugin.padEnd(35)} ~${estimatedMB}MB (${stats.count} path strings × 20KB)`);
}

// Save detailed report
const outputPath = snapshotPath.replace('.heapsnapshot', '_analysis.json');
const report = {
  timestamp: new Date().toISOString(),
  snapshotPath,
  totalNodes: nodes.length / nodeFieldCount,
  byType: Object.fromEntries(sortedTypes),
  byPlugin: Object.fromEntries(sortedPlugins.map(([k, v]) => [k, { ...v, strings: undefined }])),
  byPackage: Object.fromEntries(sortedPackages),
};

fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log('');
console.log(`Detailed report saved to: ${outputPath}`);
