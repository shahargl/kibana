/*
 * Script to analyze plugin memory usage vs task ownership.
 * Shows which plugins are loaded but have no tasks (wasted memory for TM role).
 * 
 * Usage:
 *   node scripts/analyze_plugin_memory_vs_tasks.js
 */

const fs = require('fs');

// Parse task registry
const tasksLog = fs.readFileSync('tasks.log', 'utf-8');
const taskOwners = new Set();
const taskCountByPlugin = {};

for (const line of tasksLog.split('\n')) {
  const match = line.match(/ownerPlugin="([^"]+)"/);
  if (match) {
    const plugin = match[1];
    if (plugin !== 'unknown') {
      taskOwners.add(plugin);
      taskCountByPlugin[plugin] = (taskCountByPlugin[plugin] || 0) + 1;
    }
  }
}

// Read terminal output for memory data
const terminalFile = process.argv[2] || '/Users/shaharglazner/.cursor/projects/Users-shaharglazner-git-kibana/terminals/2.txt';
const terminalContent = fs.readFileSync(terminalFile, 'utf-8');

// Parse plugin memory
const pluginMemory = {};
const memoryRegex = /\[MEMORY\] ([^:]+): init=(-?[\d.]+)MB, setup=(-?[\d.]+)MB, total=(-?[\d.]+)MB/g;

let match;
while ((match = memoryRegex.exec(terminalContent)) !== null) {
  const [, plugin, init, setup, total] = match;
  pluginMemory[plugin] = {
    init: parseFloat(init),
    setup: parseFloat(setup),
    total: parseFloat(total)
  };
}

// Categorize plugins
const pluginsWithTasks = [];
const pluginsWithoutTasks = [];

for (const [plugin, mem] of Object.entries(pluginMemory)) {
  const hasTasks = taskOwners.has(plugin) || 
                   taskOwners.has(plugin.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')) ||
                   plugin === 'taskManager' || plugin === 'task_manager';
  
  const entry = {
    plugin,
    ...mem,
    taskCount: taskCountByPlugin[plugin] || taskCountByPlugin[plugin.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')] || 0
  };
  
  if (hasTasks || entry.taskCount > 0) {
    pluginsWithTasks.push(entry);
  } else {
    pluginsWithoutTasks.push(entry);
  }
}

// Sort by init memory (code loading)
pluginsWithTasks.sort((a, b) => b.init - a.init);
pluginsWithoutTasks.sort((a, b) => b.init - a.init);

// Calculate totals
const withTasksInitTotal = pluginsWithTasks.reduce((sum, p) => sum + Math.max(0, p.init), 0);
const withTasksSetupTotal = pluginsWithTasks.reduce((sum, p) => sum + Math.max(0, p.setup), 0);
const withoutTasksInitTotal = pluginsWithoutTasks.reduce((sum, p) => sum + Math.max(0, p.init), 0);
const withoutTasksSetupTotal = pluginsWithoutTasks.reduce((sum, p) => sum + Math.max(0, p.setup), 0);

console.log('='.repeat(100));
console.log('PLUGINS WITH TASKS (needed for Task Manager role)');
console.log('='.repeat(100));
console.log(`${'Plugin'.padEnd(35)} ${'Init (code)'.padStart(12)} ${'Setup'.padStart(10)} ${'Total'.padStart(10)} ${'Tasks'.padStart(6)}`);
console.log('-'.repeat(100));

for (const p of pluginsWithTasks) {
  console.log(`${p.plugin.padEnd(35)} ${p.init.toFixed(2).padStart(10)}MB ${p.setup.toFixed(2).padStart(8)}MB ${p.total.toFixed(2).padStart(8)}MB ${String(p.taskCount).padStart(6)}`);
}

console.log('-'.repeat(100));
console.log(`${'SUBTOTAL (' + pluginsWithTasks.length + ' plugins)'.padEnd(35)} ${withTasksInitTotal.toFixed(2).padStart(10)}MB ${withTasksSetupTotal.toFixed(2).padStart(8)}MB`);
console.log();

console.log('='.repeat(100));
console.log('PLUGINS WITHOUT TASKS (could be skipped for Task Manager role)');
console.log('='.repeat(100));
console.log(`${'Plugin'.padEnd(35)} ${'Init (code)'.padStart(12)} ${'Setup'.padStart(10)} ${'Total'.padStart(10)}`);
console.log('-'.repeat(100));

for (const p of pluginsWithoutTasks.slice(0, 30)) {
  console.log(`${p.plugin.padEnd(35)} ${p.init.toFixed(2).padStart(10)}MB ${p.setup.toFixed(2).padStart(8)}MB ${p.total.toFixed(2).padStart(8)}MB`);
}

if (pluginsWithoutTasks.length > 30) {
  console.log(`... and ${pluginsWithoutTasks.length - 30} more plugins`);
}

console.log('-'.repeat(100));
console.log(`${'SUBTOTAL (' + pluginsWithoutTasks.length + ' plugins)'.padEnd(35)} ${withoutTasksInitTotal.toFixed(2).padStart(10)}MB ${withoutTasksSetupTotal.toFixed(2).padStart(8)}MB`);
console.log();

console.log('='.repeat(100));
console.log('SUMMARY');
console.log('='.repeat(100));
console.log(`Plugins WITH tasks:    ${pluginsWithTasks.length} plugins, ${withTasksInitTotal.toFixed(2)}MB init, ${withTasksSetupTotal.toFixed(2)}MB setup`);
console.log(`Plugins WITHOUT tasks: ${pluginsWithoutTasks.length} plugins, ${withoutTasksInitTotal.toFixed(2)}MB init, ${withoutTasksSetupTotal.toFixed(2)}MB setup`);
console.log();
console.log('POTENTIAL SAVINGS for Task Manager role:');
console.log(`  - Skip loading ${pluginsWithoutTasks.length} plugins: ~${withoutTasksInitTotal.toFixed(0)}MB init + ~${withoutTasksSetupTotal.toFixed(0)}MB setup = ~${(withoutTasksInitTotal + withoutTasksSetupTotal).toFixed(0)}MB`);
console.log(`  - Lazy load task-owning plugins: additional ~${(withTasksInitTotal * 0.7).toFixed(0)}MB potential (if tasks not executed)`);
console.log();
console.log('Task owners identified from tasks.log:');
console.log([...taskOwners].sort().join(', '));
