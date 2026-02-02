/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Logger } from '@kbn/logging';

/**
 * LazyPluginLoader - A utility to defer plugin code loading until actually needed.
 *
 * The problem: Currently, getConfigDescriptor() calls require(plugin/server) which loads
 * ALL plugin code just to read a config schema. This causes ~300MB of unnecessary memory
 * usage at startup.
 *
 * The solution: This loader allows plugins to export their config schema separately,
 * and only loads the full plugin code when setup() is called.
 */

interface LazyLoadStats {
  pluginName: string;
  configOnlyMemory: number; // Memory used loading just config
  fullLoadMemory: number; // Memory used loading full plugin
  savedMemory: number; // Difference (savings if lazy)
  modulesForConfig: number;
  modulesForFull: number;
}

/**
 * Analyzes a plugin to determine potential memory savings from lazy loading.
 * This doesn't actually implement lazy loading - it measures what COULD be saved.
 */
export function analyzePluginLazyLoadPotential(
  pluginPath: string,
  pluginName: string,
  log: Logger
): LazyLoadStats | null {
  const stats: LazyLoadStats = {
    pluginName,
    configOnlyMemory: 0,
    fullLoadMemory: 0,
    savedMemory: 0,
    modulesForConfig: 0,
    modulesForFull: 0,
  };

  try {
    // Clear require cache for this plugin to get accurate measurements
    const cacheKeysBefore = new Set(Object.keys(require.cache));
    const pluginCacheKeys = [...cacheKeysBefore].filter((k) => k.includes(pluginPath));

    // Remove plugin from cache
    pluginCacheKeys.forEach((key) => delete require.cache[key]);

    // Measure: Load ONLY the config file (if it exists separately)
    const configPath = `${pluginPath}/server/config`;
    const memBeforeConfig = process.memoryUsage().heapUsed;
    const modulesBefore = Object.keys(require.cache).length;

    let hasSeperateConfig = false;
    try {
      require(configPath);
      hasSeperateConfig = true;
    } catch {
      // Config not separate, that's fine
    }

    const memAfterConfig = process.memoryUsage().heapUsed;
    const modulesAfterConfig = Object.keys(require.cache).length;

    stats.configOnlyMemory = (memAfterConfig - memBeforeConfig) / 1024 / 1024;
    stats.modulesForConfig = modulesAfterConfig - modulesBefore;

    // Now load the full plugin
    const memBeforeFull = process.memoryUsage().heapUsed;
    const modulesBeforeFull = Object.keys(require.cache).length;

    try {
      require(`${pluginPath}/server`);
    } catch {
      // Plugin might not have server code
      return null;
    }

    const memAfterFull = process.memoryUsage().heapUsed;
    const modulesAfterFull = Object.keys(require.cache).length;

    stats.fullLoadMemory = (memAfterFull - memBeforeFull) / 1024 / 1024;
    stats.modulesForFull = modulesAfterFull - modulesBeforeFull;

    // If config was separate, the savings is the full load minus config
    // If not separate, we'd need to refactor the plugin
    if (hasSeperateConfig) {
      stats.savedMemory = stats.fullLoadMemory;
    } else {
      // Estimate: most plugins could save ~80% by separating config
      stats.savedMemory = stats.fullLoadMemory * 0.8;
    }

    return stats;
  } catch (error) {
    log.debug(`Failed to analyze plugin ${pluginName}: ${error}`);
    return null;
  }
}

/**
 * Creates a lazy-loading proxy for a plugin definition.
 * The proxy only loads the actual plugin code when a method is called.
 */
export function createLazyPluginProxy(
  pluginPath: string,
  pluginName: string,
  configSchema: unknown,
  log: Logger
) {
  let loadedDefinition: any = null;
  let loadPromise: Promise<any> | null = null;

  const loadPlugin = async () => {
    if (loadedDefinition) return loadedDefinition;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
      const memBefore = process.memoryUsage().heapUsed;
      log.debug(`[LAZY] Loading plugin ${pluginName} on first use...`);

      const definition = require(`${pluginPath}/server`);

      const memAfter = process.memoryUsage().heapUsed;
      const delta = (memAfter - memBefore) / 1024 / 1024;
      log.info(`[LAZY] Loaded ${pluginName}: ${delta.toFixed(2)}MB`);

      loadedDefinition = definition;
      return definition;
    })();

    return loadPromise;
  };

  // Return a proxy that:
  // 1. Returns the config schema immediately (no load needed)
  // 2. Defers loading the plugin initializer until called
  return {
    get config() {
      return { schema: configSchema };
    },

    get plugin() {
      // Return a function that loads the real plugin on first call
      return async (ctx: any) => {
        const def = await loadPlugin();
        if (def.plugin) {
          return def.plugin(ctx);
        }
        throw new Error(`Plugin ${pluginName} does not export a plugin initializer`);
      };
    },

    get module() {
      // For DI module support
      return undefined; // Would need async loading
    },
  };
}

/**
 * Experiment: Measure potential savings across all plugins without actually
 * changing their behavior.
 */
export async function measureLazyLoadingPotential(
  plugins: Array<{ path: string; name: string }>,
  log: Logger
): Promise<{
  totalCurrentMemory: number;
  totalWithLazy: number;
  potentialSavings: number;
  perPlugin: LazyLoadStats[];
}> {
  const results: LazyLoadStats[] = [];
  let totalCurrent = 0;
  let totalLazy = 0;

  for (const plugin of plugins) {
    // This is expensive - only do in analysis mode
    const stats = analyzePluginLazyLoadPotential(plugin.path, plugin.name, log);
    if (stats) {
      results.push(stats);
      totalCurrent += stats.fullLoadMemory;
      totalLazy += stats.configOnlyMemory;
    }
  }

  return {
    totalCurrentMemory: totalCurrent,
    totalWithLazy: totalLazy,
    potentialSavings: totalCurrent - totalLazy,
    perPlugin: results.sort((a, b) => b.savedMemory - a.savedMemory),
  };
}
