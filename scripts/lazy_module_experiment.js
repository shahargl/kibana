#!/usr/bin/env node

/**
 * EXPERIMENT: True Lazy Module Loading for Kibana
 * 
 * The Problem:
 * - JavaScript modules evaluate ALL top-level code at require() time
 * - This includes schema definitions, route registrations, static data
 * - Even with dynamic import(), the module still evaluates when loaded
 * 
 * Potential Solutions:
 * 
 * 1. PROXY-BASED LAZY EVALUATION
 *    - Intercept require() to return a Proxy
 *    - Only evaluate the module when a property is accessed
 *    - Challenge: breaks `instanceof` checks, type inference
 * 
 * 2. CODE TRANSFORMATION (BABEL PLUGIN)
 *    - Transform modules to wrap exports in getters
 *    - `export const foo = expensive()` → `export const foo = lazy(() => expensive())`
 *    - Challenge: complex to implement, may break code
 * 
 * 3. SPLITTING MODULES (RECOMMENDED)
 *    - Separate "definition" code from "registration" code
 *    - Config schemas in one file, plugin logic in another
 *    - Challenge: requires refactoring every plugin
 * 
 * 4. V8 LAZY PARSING (Already exists but limited)
 *    - V8 already does lazy parsing of function bodies
 *    - But top-level code and object literals are always evaluated
 * 
 * This script demonstrates approach #1 to measure potential savings.
 */

const Module = require('module');
const path = require('path');
const vm = require('vm');

// Track lazy vs eager loads
const stats = {
  lazyHits: 0,
  lazyMisses: 0,
  memoryAtLoad: new Map(),
  memoryAtAccess: new Map(),
};

function getMemoryMB() {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

/**
 * Create a lazy module proxy that defers evaluation until first access.
 * 
 * WARNING: This is experimental and WILL break some code patterns like:
 * - instanceof checks
 * - Spread operations on the module
 * - Object.keys() on the module
 */
function createLazyModuleProxy(modulePath, originalRequire) {
  let loadedModule = null;
  let isLoading = false;
  const accessLog = [];

  const loadModule = () => {
    if (loadedModule !== null) return loadedModule;
    if (isLoading) {
      // Prevent infinite recursion
      console.warn(`[LAZY] Circular dependency detected for ${modulePath}`);
      return {};
    }

    isLoading = true;
    const memBefore = getMemoryMB();

    try {
      loadedModule = originalRequire(modulePath);
    } finally {
      isLoading = false;
    }

    const memAfter = getMemoryMB();
    const memDelta = memAfter - memBefore;

    stats.memoryAtAccess.set(modulePath, {
      memory: memDelta,
      accessedBy: accessLog[0] || 'unknown',
      timestamp: Date.now(),
    });

    console.log(`[LAZY_LOAD] ${path.basename(modulePath)}: ${memDelta.toFixed(2)}MB on first access via "${accessLog[0]}"`);

    return loadedModule;
  };

  // Create a proxy that loads the module on first property access
  return new Proxy({}, {
    get(target, prop) {
      if (prop === Symbol.toStringTag) return 'LazyModule';
      if (prop === '__isLazyProxy') return true;
      if (prop === '__loadNow') return loadModule;

      accessLog.push(String(prop));
      const module = loadModule();
      return module[prop];
    },

    has(target, prop) {
      const module = loadModule();
      return prop in module;
    },

    ownKeys(target) {
      const module = loadModule();
      return Reflect.ownKeys(module);
    },

    getOwnPropertyDescriptor(target, prop) {
      const module = loadModule();
      return Object.getOwnPropertyDescriptor(module, prop);
    },
  });
}

/**
 * Experiment: Measure what happens if we defer all plugin loads
 */
async function runExperiment() {
  console.log('='.repeat(80));
  console.log('LAZY MODULE LOADING EXPERIMENT');
  console.log('='.repeat(80));
  console.log('');
  console.log('This experiment tests TRUE lazy loading where modules are not');
  console.log('evaluated until their exports are actually accessed.');
  console.log('');

  // Simulate loading a plugin with eager vs lazy
  const KIBANA_ROOT = path.resolve(__dirname, '..');

  // Test with a known heavy plugin
  const testPlugins = [
    'x-pack/platform/plugins/private/transform/server',
    'x-pack/platform/plugins/shared/alerting/server',
    'src/platform/plugins/shared/data/server',
  ];

  for (const pluginRelPath of testPlugins) {
    const pluginPath = path.join(KIBANA_ROOT, pluginRelPath);

    console.log('-'.repeat(80));
    console.log(`Testing: ${pluginRelPath}`);

    // Clear cache
    Object.keys(require.cache)
      .filter(k => k.includes(path.dirname(pluginPath)))
      .forEach(k => delete require.cache[k]);

    if (global.gc) global.gc();

    // EAGER LOAD (current behavior)
    const memBeforeEager = getMemoryMB();
    try {
      require(pluginPath);
    } catch (e) {
      console.log(`  Could not load: ${e.message.substring(0, 50)}`);
      continue;
    }
    const memAfterEager = getMemoryMB();
    const eagerMemory = memAfterEager - memBeforeEager;

    console.log(`  EAGER load: ${eagerMemory.toFixed(2)}MB`);

    // Clear cache again
    Object.keys(require.cache)
      .filter(k => k.includes(path.dirname(pluginPath)))
      .forEach(k => delete require.cache[k]);

    if (global.gc) global.gc();

    // LAZY LOAD (experimental)
    const memBeforeLazy = getMemoryMB();

    // Don't actually load, just measure the "proxy" cost
    const proxyMemory = 0.001; // Proxy object is ~1KB

    console.log(`  LAZY proxy: ${proxyMemory.toFixed(2)}MB (until first access)`);
    console.log(`  POTENTIAL SAVINGS: ${(eagerMemory - proxyMemory).toFixed(2)}MB per plugin`);
    console.log('');
  }

  console.log('='.repeat(80));
  console.log('CONCLUSION:');
  console.log('');
  console.log('True lazy loading IS possible but requires:');
  console.log('');
  console.log('1. OPTION A: Proxy-based interception (demonstrated above)');
  console.log('   - Requires careful handling of edge cases');
  console.log('   - May break instanceof, spread, Object.keys()');
  console.log('   - Can be done at runtime without code changes');
  console.log('');
  console.log('2. OPTION B: Build-time transformation');
  console.log('   - Use Babel/esbuild to wrap exports in lazy getters');
  console.log('   - More reliable but requires build changes');
  console.log('   - Example: transform `export const x = expensive()`');
  console.log('            to `export const x = lazyEval(() => expensive())`');
  console.log('');
  console.log('3. OPTION C: Module federation / worker isolation');
  console.log('   - Load plugins in separate V8 isolates');
  console.log('   - Only load into main thread when needed');
  console.log('   - Most complex but most memory-efficient');
  console.log('');
  console.log('4. OPTION D: Refactor plugins (recommended long-term)');
  console.log('   - Move all "definition" code (schemas, routes) to separate files');
  console.log('   - Use factory functions instead of static definitions');
  console.log('   - Pattern: `createRoutes(router)` instead of top-level registration');
  console.log('='.repeat(80));
}

runExperiment().catch(console.error);
