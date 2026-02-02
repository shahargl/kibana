#!/usr/bin/env node

/**
 * Analyze memory footprint for Task Manager role
 * 
 * When Kibana runs with node.roles.backgroundTasks = true (Task Manager role):
 * - It only needs to run background tasks
 * - It doesn't need UI, routes for user requests, etc.
 * 
 * This script analyzes what plugins are loaded and what could be skipped.
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');

// From kibana_memory.log - actual measured plugin memory
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
};

// Plugins that are ESSENTIAL for Task Manager
const ESSENTIAL_FOR_TASK_MANAGER = [
  'taskManager',        // Obviously
  'encryptedSavedObjects', // For encrypted task data
  'actions',            // For executing actions
  'alerting',           // For alert rules
  'licensing',          // License checks
  'features',           // Feature registry
  'spaces',             // Multi-tenancy
  'security',           // Auth
  'eventLog',           // Task logging
];

// Plugins that likely DON'T need to run in Task Manager role
const NOT_NEEDED_FOR_TASK_MANAGER = [
  'home',               // UI only
  'discover',           // UI only
  'dashboard',          // UI only
  'visualizations',     // UI only
  'lens',               // UI only
  'maps',               // UI only
  'canvas',             // UI only
  'graph',              // UI only
  'ml',                 // Has own background jobs
  'apm',                // Observability UI
  'uptime',             // Observability UI
  'synthetics',         // Observability UI
  'infra',              // Observability UI
  'observability',      // Observability UI
  'slo',                // Observability UI
  'profiling',          // Observability UI
  'securitySolution',   // Security UI
  'fleet',              // Fleet UI (agents have own process)
  'console',            // Dev tools UI
  'devTools',           // Dev tools UI
  'management',         // Stack management UI
  'indexManagement',    // UI
  'transform',          // Transform UI (transforms run in ES)
  'rollup',             // Rollup UI
  'reporting',          // Reporting generates in background but needs UI for download
  'agentBuilder',       // AI UI
  'agentBuilderPlatform', // AI UI
  'contentConnectors',  // Content UI
  'streams',            // Streams UI
  'workplaceAIApp',     // AI UI
  'dashboardAgent',     // AI UI
];

function parseKibanaJsonc(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    // Remove comments for JSON parsing
    content = content.replace(/\/\/.*$/gm, '');
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove trailing commas
    content = content.replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function findAllPlugins() {
  const plugins = [];
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
          plugins.push({
            name: entry.name,
            id: manifest.plugin.id || entry.name,
            path: pluginPath,
            manifest: manifest.plugin,
            hasServer: manifest.plugin.server === true,
            hasBrowser: manifest.plugin.browser === true,
            requiredPlugins: manifest.plugin.requiredPlugins || [],
            optionalPlugins: manifest.plugin.optionalPlugins || [],
          });
        }
      } else {
        // Check subdirectories (for solutions structure)
        scanDir(path.join(dir, entry.name));
      }
    }
  }

  for (const dir of dirs) {
    scanDir(dir);
  }

  return plugins;
}

function main() {
  console.log('='.repeat(70));
  console.log('TASK MANAGER ROLE MEMORY ANALYSIS');
  console.log('='.repeat(70));
  console.log('');
  console.log('Goal: Identify memory that could be saved when running Kibana');
  console.log('in Task Manager role (node.roles.backgroundTasks = true)');
  console.log('');

  const plugins = findAllPlugins();
  console.log(`Total plugins found: ${plugins.length}`);
  console.log(`Plugins with server code: ${plugins.filter(p => p.hasServer).length}`);
  console.log('');

  // Categorize plugins
  const essential = [];
  const notNeeded = [];
  const unknown = [];

  for (const plugin of plugins) {
    if (!plugin.hasServer) continue; // Skip browser-only plugins

    const id = plugin.id;
    const memory = MEASURED_MEMORY[id] || 0;

    if (ESSENTIAL_FOR_TASK_MANAGER.includes(id)) {
      essential.push({ ...plugin, memory });
    } else if (NOT_NEEDED_FOR_TASK_MANAGER.includes(id)) {
      notNeeded.push({ ...plugin, memory });
    } else {
      unknown.push({ ...plugin, memory });
    }
  }

  // Calculate totals
  const essentialMemory = essential.reduce((sum, p) => sum + p.memory, 0);
  const notNeededMemory = notNeeded.reduce((sum, p) => sum + p.memory, 0);
  const unknownMemory = unknown.reduce((sum, p) => sum + p.memory, 0);

  console.log('='.repeat(70));
  console.log('PLUGINS ESSENTIAL FOR TASK MANAGER');
  console.log('='.repeat(70));
  console.log('');
  console.log(`${'Plugin'.padEnd(35)} ${'Memory'.padStart(10)} ${'Note'.padStart(20)}`);
  console.log('-'.repeat(65));

  for (const p of essential.sort((a, b) => b.memory - a.memory)) {
    console.log(`${p.id.padEnd(35)} ${(p.memory ? p.memory.toFixed(1) + 'MB' : 'N/A').padStart(10)} ${'Required'.padStart(20)}`);
  }
  console.log('-'.repeat(65));
  console.log(`${'SUBTOTAL'.padEnd(35)} ${(essentialMemory.toFixed(1) + 'MB').padStart(10)}`);

  console.log('');
  console.log('='.repeat(70));
  console.log('PLUGINS NOT NEEDED FOR TASK MANAGER (potential savings)');
  console.log('='.repeat(70));
  console.log('');
  console.log(`${'Plugin'.padEnd(35)} ${'Memory'.padStart(10)} ${'Reason'.padStart(20)}`);
  console.log('-'.repeat(65));

  for (const p of notNeeded.filter(p => p.memory > 0).sort((a, b) => b.memory - a.memory)) {
    console.log(`${p.id.padEnd(35)} ${(p.memory.toFixed(1) + 'MB').padStart(10)} ${'UI/Not needed'.padStart(20)}`);
  }
  console.log('-'.repeat(65));
  console.log(`${'SUBTOTAL (potential savings)'.padEnd(35)} ${(notNeededMemory.toFixed(1) + 'MB').padStart(10)}`);

  console.log('');
  console.log('='.repeat(70));
  console.log('PLUGINS WITH UNKNOWN NECESSITY');
  console.log('='.repeat(70));
  console.log('');

  for (const p of unknown.filter(p => p.memory > 1).sort((a, b) => b.memory - a.memory).slice(0, 20)) {
    console.log(`${p.id.padEnd(35)} ${(p.memory.toFixed(1) + 'MB').padStart(10)}`);
  }
  console.log(`... and ${unknown.length - 20} more with <1MB each`);

  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Current total measured plugin memory:    ~340MB`);
  console.log(`Essential for Task Manager:              ~${essentialMemory.toFixed(0)}MB`);
  console.log(`NOT needed for Task Manager:             ~${notNeededMemory.toFixed(0)}MB`);
  console.log(`Unknown/needs analysis:                  ~${unknownMemory.toFixed(0)}MB`);
  console.log('');
  console.log(`POTENTIAL SAVINGS: ~${notNeededMemory.toFixed(0)}MB (${(notNeededMemory/340*100).toFixed(0)}%)`);
  console.log('');

  console.log('='.repeat(70));
  console.log('HOW TO ACHIEVE THESE SAVINGS');
  console.log('='.repeat(70));
  console.log('');
  console.log('Option 1: Disable non-essential plugins for Task Manager role');
  console.log('  - Add `enabledOnBackgroundTasks: false` to plugin manifests');
  console.log('  - Core checks this flag and skips loading the plugin');
  console.log('');
  console.log('Option 2: Lazy load plugin code');
  console.log('  - Only load plugin server code when its APIs are called');
  console.log('  - Requires architecture changes to plugin system');
  console.log('');
  console.log('Option 3: Separate Task Manager into its own process');
  console.log('  - Run task-manager-only Kibana with minimal plugins');
  console.log('  - Configure via kibana.yml: node.roles: [background_tasks]');
  console.log('');

  // Save results
  const outputPath = path.join(KIBANA_ROOT, 'tmp', 'task_manager_role_analysis.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    essential: essential.map(p => ({ id: p.id, memory: p.memory })),
    notNeeded: notNeeded.map(p => ({ id: p.id, memory: p.memory })),
    unknown: unknown.map(p => ({ id: p.id, memory: p.memory })),
    summary: {
      essentialMemory,
      notNeededMemory,
      unknownMemory,
      potentialSavings: notNeededMemory,
    },
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main();
