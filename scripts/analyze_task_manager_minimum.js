#!/usr/bin/env node

/**
 * Analyze: What's the MINIMUM set of plugins needed for Task Manager role?
 * 
 * Key insight: taskManager only DECLARES that it depends on licensing.
 * But to EXECUTE tasks, other plugins must register task types.
 * 
 * So the question is: which task types do we need to run?
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');

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

function main() {
  const plugins = findAllPlugins();

  console.log('='.repeat(80));
  console.log('TASK MANAGER MINIMUM VIABLE SET ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  // Scenario 1: Just taskManager (theoretical minimum)
  console.log('SCENARIO 1: taskManager plugin only (theoretical)');
  console.log('-'.repeat(80));
  const tmDeps = getAllDependencies(plugins, 'taskManager');
  let scenario1Mem = 0;
  for (const id of tmDeps) {
    const mem = MEASURED_MEMORY[id] || 0;
    scenario1Mem += mem;
    console.log(`  ${id.padEnd(30)} ${mem.toFixed(1).padStart(6)}MB`);
  }
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${scenario1Mem.toFixed(1).padStart(6)}MB`);
  console.log('');
  console.log('  ⚠️  This would ONLY allow taskManager to exist, but NO tasks could run!');
  console.log('      No actions, no alerting, no connectors.');
  console.log('');

  // Scenario 2: taskManager + actions (to execute action tasks)
  console.log('SCENARIO 2: taskManager + actions (execute action tasks)');
  console.log('-'.repeat(80));
  const actionsDeps = getAllDependencies(plugins, 'actions');
  let scenario2Mem = 0;
  for (const id of actionsDeps) {
    const mem = MEASURED_MEMORY[id] || 0;
    scenario2Mem += mem;
    console.log(`  ${id.padEnd(30)} ${mem.toFixed(1).padStart(6)}MB`);
  }
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${scenario2Mem.toFixed(1).padStart(6)}MB`);
  console.log('');
  console.log('  ✓ Can execute actions (email, webhook, etc.)');
  console.log('  ✗ Cannot run alerting rules');
  console.log('');

  // Scenario 3: taskManager + actions + alerting
  console.log('SCENARIO 3: taskManager + actions + alerting (run alert rules)');
  console.log('-'.repeat(80));
  const alertingDeps = getAllDependencies(plugins, 'alerting');
  const scenario3Set = new Set([...actionsDeps, ...alertingDeps]);
  let scenario3Mem = 0;
  const scenario3Sorted = [...scenario3Set].sort((a, b) => 
    (MEASURED_MEMORY[b] || 0) - (MEASURED_MEMORY[a] || 0)
  );
  for (const id of scenario3Sorted) {
    const mem = MEASURED_MEMORY[id] || 0;
    scenario3Mem += mem;
    console.log(`  ${id.padEnd(30)} ${mem.toFixed(1).padStart(6)}MB`);
  }
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${scenario3Mem.toFixed(1).padStart(6)}MB`);
  console.log('');
  console.log('  ✓ Can execute actions');
  console.log('  ✓ Can run alerting rules');
  console.log('  ✗ No specific connectors (stackConnectors adds them)');
  console.log('');

  // Scenario 4: + stackConnectors
  console.log('SCENARIO 4: + stackConnectors (have actual connectors)');
  console.log('-'.repeat(80));
  const connectorsDeps = getAllDependencies(plugins, 'stackConnectors');
  const scenario4Set = new Set([...scenario3Set, ...connectorsDeps]);
  let scenario4Mem = 0;
  const scenario4Sorted = [...scenario4Set].sort((a, b) => 
    (MEASURED_MEMORY[b] || 0) - (MEASURED_MEMORY[a] || 0)
  );
  for (const id of scenario4Sorted) {
    const mem = MEASURED_MEMORY[id] || 0;
    scenario4Mem += mem;
    console.log(`  ${id.padEnd(30)} ${mem.toFixed(1).padStart(6)}MB`);
  }
  console.log(`  ${'─'.repeat(38)}`);
  console.log(`  ${'TOTAL'.padEnd(30)} ${scenario4Mem.toFixed(1).padStart(6)}MB`);
  console.log('');
  console.log('  ✓ Can execute actions with real connectors');
  console.log('  ✓ Can run alerting rules');
  console.log('  This is likely the MINIMUM VIABLE for Task Manager role');
  console.log('');

  // What about security-related tasks?
  console.log('SCENARIO 5: What security/ml add');
  console.log('-'.repeat(80));
  const securityDeps = getAllDependencies(plugins, 'security');
  const additionalFromSecurity = [...securityDeps].filter(id => !scenario4Set.has(id));
  let securityAddMem = 0;
  for (const id of additionalFromSecurity) {
    const mem = MEASURED_MEMORY[id] || 0;
    securityAddMem += mem;
    console.log(`  ${id.padEnd(30)} ${mem.toFixed(1).padStart(6)}MB`);
  }
  console.log(`  Security adds: ${additionalFromSecurity.length} plugins, ${securityAddMem.toFixed(1)}MB`);
  console.log('');

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`  Scenario 1 (taskManager only):          ${scenario1Mem.toFixed(1).padStart(6)}MB  - CANNOT run any tasks`);
  console.log(`  Scenario 2 (+ actions):                 ${scenario2Mem.toFixed(1).padStart(6)}MB  - Can execute actions`);
  console.log(`  Scenario 3 (+ alerting):                ${scenario3Mem.toFixed(1).padStart(6)}MB  - Can run alert rules`);
  console.log(`  Scenario 4 (+ stackConnectors):         ${scenario4Mem.toFixed(1).padStart(6)}MB  - MINIMUM VIABLE`);
  console.log('');
  console.log('  Current (all 26 TM dependents loaded):  ~245MB');
  console.log('');
  console.log(`  POTENTIAL SAVINGS: ~${(245 - scenario4Mem).toFixed(0)}MB`);
  console.log('');
}

main();
