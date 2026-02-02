const fs = require('fs');
const path = require('path');

// Read the dependency JSON
const data = JSON.parse(fs.readFileSync('./tmp/task_manager_deps.json', 'utf8'));

// Analyze modules
const stats = {
  totalModules: data.modules.length,
  orphanModules: [],
  modulesByType: {},
  dependencyCount: {}
};

data.modules.forEach(mod => {
  // Track orphans
  if (mod.orphan) {
    stats.orphanModules.push(mod.source);
  }
  
  // Count dependencies per module
  stats.dependencyCount[mod.source] = mod.dependencies.length;
  
  // Group by directory
  const dir = path.dirname(mod.source).split('/').slice(0, 7).join('/');
  if (!stats.modulesByType[dir]) {
    stats.modulesByType[dir] = 0;
  }
  stats.modulesByType[dir]++;
});

// Find most connected modules
const sorted = Object.entries(stats.dependencyCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);

console.log('=== Task Manager Dependency Analysis ===\n');
console.log(`Total modules: ${stats.totalModules}`);
console.log(`Orphan modules: ${stats.orphanModules.length}`);
console.log('\n--- Modules by Directory ---');
Object.entries(stats.modulesByType).forEach(([dir, count]) => {
  console.log(`  ${dir}: ${count} files`);
});

console.log('\n--- Top 20 Most Connected Modules (by dependencies) ---');
sorted.forEach(([mod, count]) => {
  console.log(`  ${count} deps: ${mod.replace('x-pack/platform/plugins/shared/task_manager/', '')}`);
});

// Summary
const summary = data.summary || {};
console.log('\n--- Summary ---');
console.log(JSON.stringify(summary, null, 2));
