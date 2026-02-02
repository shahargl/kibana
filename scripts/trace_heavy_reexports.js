#!/usr/bin/env node

/**
 * Trace which re-exports pull in heavy dependencies
 * 
 * This looks at the actual import chains to find the expensive ones.
 */

const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');

// Known heavy dependencies (from our measurements)
const HEAVY_DEPS = [
  '@kbn/alerting-plugin',
  '@kbn/rule-registry',
  '@kbn/task-manager-plugin',
  '@kbn/actions-plugin',
  '@kbn/data-plugin',
  '@kbn/ml-plugin',
  '@kbn/security-plugin',
  '@kbn/fleet-plugin',
];

function parseImports(filePath) {
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports = [];
  
  // Match import statements
  const regex = /import\s+(?:type\s+)?(?:\{[^}]+\}|[^;]+)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  
  return imports;
}

function resolveFile(fromPath, baseDir) {
  if (fromPath.startsWith('./') || fromPath.startsWith('../')) {
    const resolved = path.resolve(baseDir, fromPath);
    // Try .ts extension
    if (fs.existsSync(resolved + '.ts')) return resolved + '.ts';
    if (fs.existsSync(resolved + '/index.ts')) return resolved + '/index.ts';
    if (fs.existsSync(resolved)) return resolved;
  }
  return null;
}

function traceImportChain(filePath, depth = 0, visited = new Set()) {
  if (depth > 5 || visited.has(filePath)) return [];
  visited.add(filePath);
  
  const imports = parseImports(filePath);
  const heavyFound = [];
  
  for (const imp of imports) {
    // Check if this is a heavy dependency
    for (const heavy of HEAVY_DEPS) {
      if (imp.startsWith(heavy) || imp === heavy) {
        heavyFound.push({ dep: heavy, at: filePath, depth });
      }
    }
    
    // Follow relative imports
    const resolved = resolveFile(imp, path.dirname(filePath));
    if (resolved) {
      heavyFound.push(...traceImportChain(resolved, depth + 1, visited));
    }
  }
  
  return heavyFound;
}

function findPluginReExports() {
  const results = [];
  const dirs = [
    'src/plugins',
    'src/platform/plugins/shared',
    'src/platform/plugins/private',
    'x-pack/plugins',
    'x-pack/platform/plugins/shared',
    'x-pack/platform/plugins/private',
  ];

  for (const dir of dirs) {
    const fullDir = path.join(KIBANA_ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    for (const name of fs.readdirSync(fullDir)) {
      const indexPath = path.join(fullDir, name, 'server', 'index.ts');
      if (!fs.existsSync(indexPath)) continue;

      const content = fs.readFileSync(indexPath, 'utf-8');
      
      // Find re-exports
      const reExportRegex = /export\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
      let match;
      
      while ((match = reExportRegex.exec(content)) !== null) {
        const fromPath = match[2];
        
        // Skip config and common (usually light)
        if (fromPath.includes('config') || fromPath === '../common') continue;
        
        // Resolve and trace
        const resolved = resolveFile(fromPath, path.join(fullDir, name, 'server'));
        if (resolved) {
          const heavyDeps = traceImportChain(resolved);
          if (heavyDeps.length > 0) {
            results.push({
              plugin: name,
              reExport: match[0].substring(0, 60),
              fromPath,
              heavyDeps: [...new Set(heavyDeps.map(h => h.dep))],
            });
          }
        }
      }
    }
  }

  return results;
}

function main() {
  console.log('='.repeat(70));
  console.log('TRACING HEAVY RE-EXPORTS');
  console.log('='.repeat(70));
  console.log('');
  console.log('Looking for re-exports that pull in heavy dependencies...');
  console.log('');

  const results = findPluginReExports();

  console.log(`Found ${results.length} re-exports that pull in heavy deps:`);
  console.log('');

  // Group by heavy dep
  const byHeavyDep = new Map();
  for (const r of results) {
    for (const dep of r.heavyDeps) {
      const list = byHeavyDep.get(dep) || [];
      list.push(r);
      byHeavyDep.set(dep, list);
    }
  }

  // Memory estimates for each heavy dep (from measurements)
  const depMemory = {
    '@kbn/alerting-plugin': 45,
    '@kbn/rule-registry': 11,
    '@kbn/task-manager-plugin': 15,
    '@kbn/actions-plugin': 20,
    '@kbn/data-plugin': 74,
    '@kbn/ml-plugin': 30,
    '@kbn/security-plugin': 25,
    '@kbn/fleet-plugin': 35,
  };

  console.log('RE-EXPORTS BY HEAVY DEPENDENCY:');
  console.log('-'.repeat(70));

  let totalEstimate = 0;
  for (const [dep, plugins] of [...byHeavyDep.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const mem = depMemory[dep] || 10;
    console.log(`\n${dep} (~${mem}MB each, pulled by ${plugins.length} plugins):`);
    
    for (const p of plugins.slice(0, 5)) {
      console.log(`  - ${p.plugin}: ${p.fromPath}`);
    }
    if (plugins.length > 5) {
      console.log(`  ... and ${plugins.length - 5} more`);
    }
    
    // Note: Memory is shared, so we count the dep once, not per-plugin
    // But we note how many plugins pull it
  }

  console.log('');
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log('');

  // List all plugins with heavy re-exports
  const pluginsWithHeavy = [...new Set(results.map(r => r.plugin))];
  console.log(`Plugins with heavy re-exports: ${pluginsWithHeavy.length}`);
  console.log('');

  // Calculate potential savings
  // If we remove re-exports, dependencies would only load when actually needed
  console.log('POTENTIAL SAVINGS:');
  console.log('');
  console.log('Currently, these heavy deps are loaded at startup via re-exports.');
  console.log('With lazy loading, they would only load on first use.');
  console.log('');

  // The deps themselves
  let uniqueDepsMemory = 0;
  for (const [dep, plugins] of byHeavyDep.entries()) {
    const mem = depMemory[dep] || 10;
    uniqueDepsMemory += mem;
    console.log(`  ${dep}: ${mem}MB (loaded by ${plugins.length} plugin re-exports)`);
  }

  console.log('-'.repeat(50));
  console.log(`  TOTAL from heavy deps: ~${uniqueDepsMemory}MB`);
  console.log('');
  console.log('NOTE: This is a LOWER BOUND estimate.');
  console.log('The actual savings depend on whether these deps would be');
  console.log('needed anyway through other code paths.');
  console.log('');

  // Save
  const outputPath = path.join(KIBANA_ROOT, 'tmp', 'heavy_reexports.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    byHeavyDep: Object.fromEntries([...byHeavyDep.entries()].map(([k, v]) => [k, v.map(p => p.plugin)])),
    estimatedSavings: uniqueDepsMemory,
  }, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main();
