#!/usr/bin/env node

/**
 * LAZY REQUIRE HOOK
 * 
 * This script patches Node's require() to enable true lazy loading.
 * It's designed to be loaded BEFORE Kibana starts via:
 * 
 *   node -r ./scripts/lazy_require_hook.js scripts/kibana --dev
 * 
 * How it works:
 * 1. Intercepts require() calls for plugin server/index files
 * 2. Returns a Proxy instead of the actual module
 * 3. Only loads the real module when an export is accessed
 * 4. Tracks and reports memory savings
 */

const Module = require('module');
const path = require('path');

// Configuration
const LAZY_ENABLED = process.env.KIBANA_LAZY_LOAD !== 'false';
const LAZY_VERBOSE = process.env.KIBANA_LAZY_VERBOSE === 'true';
const KIBANA_ROOT = path.resolve(__dirname, '..');

// Tracking
const lazyModules = new Map(); // path -> { proxy, loaded, memoryOnLoad }
const originalRequire = Module.prototype.require;

// Patterns for modules that should be lazy loaded
const LAZY_PATTERNS = [
  // Plugin server index files
  /[\/\\](plugins|platform)[\/\\].+[\/\\]server[\/\\]?(?:index)?$/,
  // Heavy dependencies that are often re-exported
  /[\/\\]alerting[\/\\]server/,
  /[\/\\]ml[\/\\]server/,
  /[\/\\]security[\/\\]server/,
];

// Modules that must NOT be lazy (break if proxied)
const EAGER_PATTERNS = [
  /[\/\\]config\.(?:ts|js)$/,
  /@kbn\/config-schema/,
  /@kbn\/core/,
  /node_modules/,
];

function shouldBeLazy(modulePath) {
  // Never lazy-load eager patterns
  for (const pattern of EAGER_PATTERNS) {
    if (pattern.test(modulePath)) return false;
  }

  // Check if matches lazy patterns
  for (const pattern of LAZY_PATTERNS) {
    if (pattern.test(modulePath)) return true;
  }

  return false;
}

function getMemoryMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024;
}

function createLazyProxy(modulePath) {
  const state = {
    loaded: false,
    module: null,
    memoryOnLoad: 0,
    firstAccessProperty: null,
    firstAccessTime: null,
  };

  lazyModules.set(modulePath, state);

  const loadModule = (accessedProperty) => {
    if (state.loaded) return state.module;

    const memBefore = getMemoryMB();
    state.firstAccessProperty = accessedProperty;
    state.firstAccessTime = Date.now();

    // Actually load the module
    state.module = originalRequire.call(Module.prototype, modulePath);
    state.loaded = true;

    const memAfter = getMemoryMB();
    state.memoryOnLoad = memAfter - memBefore;

    if (LAZY_VERBOSE || state.memoryOnLoad > 5) {
      const pluginName = extractPluginName(modulePath);
      console.log(
        `[LAZY_LOAD] ${pluginName}: ${state.memoryOnLoad.toFixed(2)}MB ` +
        `(triggered by accessing "${accessedProperty}")`
      );
    }

    return state.module;
  };

  // Return a proxy that defers loading
  return new Proxy(function LazyModule() {}, {
    get(target, prop) {
      // Special properties that don't trigger load
      if (prop === '__esModule') return true;
      if (prop === 'default') {
        const mod = loadModule('default');
        return mod.default || mod;
      }
      if (prop === Symbol.toStringTag) return 'LazyModule';
      if (prop === '__lazyModulePath') return modulePath;
      if (prop === '__isLoaded') return state.loaded;

      return loadModule(String(prop))[prop];
    },

    set(target, prop, value) {
      const mod = loadModule(String(prop));
      mod[prop] = value;
      return true;
    },

    has(target, prop) {
      return prop in loadModule('has:' + String(prop));
    },

    ownKeys(target) {
      return Reflect.ownKeys(loadModule('ownKeys'));
    },

    getOwnPropertyDescriptor(target, prop) {
      return Object.getOwnPropertyDescriptor(loadModule('getOwnPropertyDescriptor'), prop);
    },

    apply(target, thisArg, args) {
      // If the module is a function (like a plugin initializer)
      const mod = loadModule('apply');
      if (typeof mod === 'function') {
        return mod.apply(thisArg, args);
      }
      throw new Error(`Module ${modulePath} is not callable`);
    },

    construct(target, args) {
      const mod = loadModule('construct');
      if (typeof mod === 'function') {
        return new mod(...args);
      }
      throw new Error(`Module ${modulePath} is not a constructor`);
    },
  });
}

function extractPluginName(modulePath) {
  const match = modulePath.match(/[\/\\](plugins|platform)[\/\\](?:shared|private)?[\/\\]?([^\/\\]+)/);
  return match ? match[2] : path.basename(path.dirname(modulePath));
}

// Patch require
Module.prototype.require = function lazyRequire(request) {
  // Resolve the path
  let resolvedPath;
  try {
    resolvedPath = Module._resolveFilename(request, this);
  } catch {
    // Module doesn't exist, let original require handle error
    return originalRequire.call(this, request);
  }

  // Check if this should be lazy loaded
  if (LAZY_ENABLED && shouldBeLazy(resolvedPath)) {
    // Check if we already have a proxy for this
    if (lazyModules.has(resolvedPath)) {
      const state = lazyModules.get(resolvedPath);
      if (state.loaded) {
        return state.module;
      }
      // Return existing proxy
      return createLazyProxy(resolvedPath);
    }

    if (LAZY_VERBOSE) {
      console.log(`[LAZY_DEFER] ${extractPluginName(resolvedPath)}`);
    }

    return createLazyProxy(resolvedPath);
  }

  // Normal require
  return originalRequire.call(this, request);
};

// Report stats on exit
process.on('exit', () => {
  if (!LAZY_ENABLED) return;

  const loaded = [...lazyModules.values()].filter(s => s.loaded);
  const deferred = [...lazyModules.values()].filter(s => !s.loaded);

  if (loaded.length === 0 && deferred.length === 0) return;

  console.log('\n' + '='.repeat(80));
  console.log('LAZY LOADING SUMMARY');
  console.log('='.repeat(80));
  console.log(`Modules loaded on demand:  ${loaded.length}`);
  console.log(`Modules still deferred:    ${deferred.length}`);

  const totalMemoryLoaded = loaded.reduce((sum, s) => sum + s.memoryOnLoad, 0);
  console.log(`Total memory for loaded:   ${totalMemoryLoaded.toFixed(2)}MB`);

  if (deferred.length > 0) {
    // Estimate savings: assume deferred modules would have used similar memory
    const avgMemory = loaded.length > 0 ? totalMemoryLoaded / loaded.length : 10;
    const estimatedSavings = deferred.length * avgMemory;
    console.log(`Estimated savings:         ~${estimatedSavings.toFixed(2)}MB (${deferred.length} modules not loaded)`);
  }

  if (loaded.length > 0) {
    console.log('\nModules loaded (by memory):');
    const sortedLoaded = loaded
      .map((s, i) => ({ ...s, path: [...lazyModules.keys()][i] }))
      .sort((a, b) => b.memoryOnLoad - a.memoryOnLoad);

    for (const mod of sortedLoaded.slice(0, 10)) {
      const name = extractPluginName(mod.path);
      console.log(`  ${name.padEnd(40)} ${mod.memoryOnLoad.toFixed(2).padStart(8)}MB via "${mod.firstAccessProperty}"`);
    }
  }

  if (deferred.length > 0) {
    console.log('\nModules never loaded (potential savings):');
    for (const [modPath] of [...lazyModules.entries()].filter(([, s]) => !s.loaded).slice(0, 10)) {
      console.log(`  ${extractPluginName(modPath)}`);
    }
  }

  console.log('='.repeat(80));
});

if (LAZY_ENABLED) {
  console.log('[LAZY_HOOK] Lazy require hook installed');
  console.log('[LAZY_HOOK] Set KIBANA_LAZY_LOAD=false to disable');
  console.log('[LAZY_HOOK] Set KIBANA_LAZY_VERBOSE=true for detailed logging');
}

module.exports = { lazyModules, getMemoryMB };
