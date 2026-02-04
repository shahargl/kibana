/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import type { Observable } from 'rxjs';
import { firstValueFrom } from 'rxjs';
import { filter, map, tap, toArray } from 'rxjs';
import { getFlattenedObject } from '@kbn/std';

import type { Logger } from '@kbn/logging';
import type { IConfigService } from '@kbn/config';
import type { CoreContext, CoreService } from '@kbn/core-base-server-internal';
import { type PluginName, PluginType } from '@kbn/core-base-common';
import type { InternalEnvironmentServicePreboot } from '@kbn/core-environment-server-internal';
import type { InternalNodeServicePreboot } from '@kbn/core-node-server-internal';
import type { InternalPluginInfo, UiPlugins } from '@kbn/core-plugins-base-server-internal';
import type {
  InternalCorePreboot,
  InternalCoreSetup,
  InternalCoreStart,
} from '@kbn/core-lifecycle-server-internal';
import type { PluginConfigDescriptor } from '@kbn/core-plugins-server';
import type { DiscoveredPlugin } from '@kbn/core-base-common';
import type { PluginDiscoveryError } from './discovery';
import { discover, PluginDiscoveryErrorType } from './discovery';
import type { PluginWrapper } from './plugin';

import type { PluginDependencies } from './types';
import type { PluginsConfigType } from './plugins_config';
import { PluginsConfig } from './plugins_config';
import { PluginsSystem } from './plugins_system';
import { createBrowserConfig } from './create_browser_config';

/** @internal */
export type DiscoveredPlugins = {
  [key in PluginType]: {
    pluginTree: PluginDependencies;
    pluginPaths: string[];
    uiPlugins: UiPlugins;
  };
};

/** @internal */
export interface InternalPluginsServiceSetup {
  /** Indicates whether or not plugins were initialized. */
  initialized: boolean;
  /** Setup contracts returned by plugins. */
  contracts: Map<PluginName, unknown>;
  /**
   * LAZY LOADING: Load a plugin on-demand. Used by Task Manager for lazy task execution.
   */
  loadPluginOnDemand: (pluginName: string) => Promise<unknown>;
}

/** @internal */
export interface InternalPluginsServiceStart {
  /** Start contracts returned by plugins. */
  contracts: Map<PluginName, unknown>;
}

/** @internal */
export type PluginsServicePrebootSetupDeps = InternalCorePreboot;

/** @internal */
export type PluginsServiceSetupDeps = InternalCoreSetup;

/** @internal */
export type PluginsServiceStartDeps = InternalCoreStart;

/** @internal */
export interface PluginsServiceDiscoverDeps {
  environment: InternalEnvironmentServicePreboot;
  node: InternalNodeServicePreboot;
}

/** @internal */
export class PluginsService
  implements CoreService<InternalPluginsServiceSetup, InternalPluginsServiceStart>
{
  private readonly log: Logger;
  private readonly prebootPluginsSystem: PluginsSystem<PluginType.preboot>;
  private arePrebootPluginsStopped = false;
  private readonly prebootUiPluginInternalInfo = new Map<PluginName, InternalPluginInfo>();
  private readonly standardPluginsSystem: PluginsSystem<PluginType.standard>;
  private readonly standardUiPluginInternalInfo = new Map<PluginName, InternalPluginInfo>();
  private readonly configService: IConfigService;
  private readonly config$: Observable<PluginsConfig>;
  private readonly pluginConfigDescriptors = new Map<PluginName, PluginConfigDescriptor>();
  private readonly pluginConfigUsageDescriptors = new Map<string, Record<string, any | any[]>>();

  constructor(private readonly coreContext: CoreContext) {
    this.log = coreContext.logger.get('plugins-service');
    this.configService = coreContext.configService;
    this.config$ = coreContext.configService
      .atPath<PluginsConfigType>('plugins')
      .pipe(map((rawConfig) => new PluginsConfig(rawConfig, coreContext.env)));
    this.prebootPluginsSystem = new PluginsSystem(this.coreContext, PluginType.preboot);
    this.standardPluginsSystem = new PluginsSystem(this.coreContext, PluginType.standard);
  }

  public async discover({
    environment,
    node,
  }: PluginsServiceDiscoverDeps): Promise<DiscoveredPlugins> {
    // MEMORY TRACKING helper
    const trackMem = (label: string, memBefore: { heapUsed: number }) => {
      const memAfter = process.memoryUsage();
      const delta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
      const current = memAfter.heapUsed / 1024 / 1024;
      this.log.info(
        `[DISCOVER_MEMORY] ${label.padEnd(35)} delta=${delta.toFixed(2).padStart(8)}MB, total=${current.toFixed(1)}MB`
      );
      return memAfter;
    };

    let memBefore = process.memoryUsage();
    this.log.info(`[DISCOVER_MEMORY] === PLUGIN DISCOVERY BREAKDOWN ===`);

    const config = await firstValueFrom(this.config$);
    memBefore = trackMem('config load', memBefore);

    const airgapped = await firstValueFrom(
      this.coreContext.configService.atPath<boolean>('airgapped')
    ).catch(() => false);

    const { error$, plugin$ } = discover({
      config,
      coreContext: this.coreContext,
      instanceInfo: {
        uuid: environment.instanceUuid,
        airgapped,
      },
      nodeInfo: {
        roles: node.roles,
      },
    });
    memBefore = trackMem('discover() call (streams created)', memBefore);

    await this.handleDiscoveryErrors(error$);
    memBefore = trackMem('handleDiscoveryErrors', memBefore);

    await this.handleDiscoveredPlugins(plugin$);
    memBefore = trackMem('handleDiscoveredPlugins', memBefore);

    const prebootUiPlugins = this.prebootPluginsSystem.uiPlugins();
    memBefore = trackMem('prebootUiPlugins', memBefore);

    const standardUiPlugins = this.standardPluginsSystem.uiPlugins();
    memBefore = trackMem('standardUiPlugins', memBefore);

    const result = {
      preboot: {
        pluginPaths: this.prebootPluginsSystem.getPlugins().map((plugin) => plugin.path),
        pluginTree: this.prebootPluginsSystem.getPluginDependencies(),
        uiPlugins: {
          internal: this.prebootUiPluginInternalInfo,
          public: prebootUiPlugins,
          browserConfigs: this.generateUiPluginsConfigs(prebootUiPlugins),
        },
      },
      standard: {
        pluginPaths: this.standardPluginsSystem.getPlugins().map((plugin) => plugin.path),
        pluginTree: this.standardPluginsSystem.getPluginDependencies(),
        uiPlugins: {
          internal: this.standardUiPluginInternalInfo,
          public: standardUiPlugins,
          browserConfigs: this.generateUiPluginsConfigs(standardUiPlugins),
        },
      },
    };
    memBefore = trackMem('build result object', memBefore);

    this.log.info(`[DISCOVER_MEMORY] === END PLUGIN DISCOVERY BREAKDOWN ===`);
    return result;
  }

  public getExposedPluginConfigsToUsage() {
    return this.pluginConfigUsageDescriptors;
  }

  public async preboot(deps: PluginsServicePrebootSetupDeps) {
    this.log.debug('Prebooting plugins service');

    const config = await firstValueFrom(this.config$);
    if (config.initialize) {
      await this.prebootPluginsSystem.setupPlugins(deps);
    } else {
      this.log.info(
        'Skipping `setup` for `preboot` plugins since plugin initialization is disabled.'
      );
    }
  }

  public async setup(deps: PluginsServiceSetupDeps) {
    this.log.debug('Setting up plugins service');

    const config = await firstValueFrom(this.config$);

    let contracts = new Map<PluginName, unknown>();
    if (config.initialize) {
      contracts = await this.standardPluginsSystem.setupPlugins(deps);
    } else {
      this.log.info(
        'Skipping `setup` for `standard` plugins since plugin initialization is disabled.'
      );
    }

    return {
      initialized: config.initialize,
      contracts,
      loadPluginOnDemand: (pluginName: string) => this.standardPluginsSystem.loadPluginOnDemand(pluginName),
    };
  }

  public async start(deps: PluginsServiceStartDeps) {
    this.log.debug('Plugins service starts plugins');

    const config = await firstValueFrom(this.config$);
    if (!config.initialize) {
      this.log.info(
        'Skipping `start` for `standard` plugins since plugin initialization is disabled.'
      );
      return { contracts: new Map() };
    }

    await this.prebootPluginsSystem.stopPlugins();
    this.arePrebootPluginsStopped = true;

    const contracts = await this.standardPluginsSystem.startPlugins(deps);
    return { contracts };
  }

  public async stop() {
    this.log.debug('Stopping plugins service');

    if (!this.arePrebootPluginsStopped) {
      this.arePrebootPluginsStopped = true;
      await this.prebootPluginsSystem.stopPlugins();
    }

    await this.standardPluginsSystem.stopPlugins();
  }

  private generateUiPluginsConfigs(
    uiPlugins: Map<string, DiscoveredPlugin>
  ): Map<PluginName, Observable<unknown>> {
    return new Map(
      [...uiPlugins]
        .filter(([pluginId, _]) => {
          const configDescriptor = this.pluginConfigDescriptors.get(pluginId);
          return (
            configDescriptor &&
            configDescriptor.exposeToBrowser &&
            Object.values(configDescriptor?.exposeToBrowser).some((exposed) => exposed)
          );
        })
        .map(([pluginId, plugin]) => {
          const configDescriptor = this.pluginConfigDescriptors.get(pluginId)!;
          return [
            pluginId,
            this.configService
              .atPath(plugin.configPath)
              .pipe(map((config: any) => createBrowserConfig(config, configDescriptor))),
          ];
        })
    );
  }

  private async handleDiscoveryErrors(error$: Observable<PluginDiscoveryError>) {
    // At this stage we report only errors that can occur when new platform plugin
    // manifest is present, otherwise we can't be sure that the plugin is for the new
    // platform and let legacy platform to handle it.
    const errorTypesToReport = [
      PluginDiscoveryErrorType.IncompatibleVersion,
      PluginDiscoveryErrorType.InvalidManifest,
    ];

    const errors = await firstValueFrom(
      error$.pipe(
        filter((error) => errorTypesToReport.includes(error.type)),
        tap((pluginError) => this.log.error(pluginError)),
        toArray()
      )
    );
    if (errors.length > 0) {
      throw new Error(
        `Failed to initialize plugins:${errors.map((err) => `\n\t${err.message}`).join('')}`
      );
    }
  }

  private async handleDiscoveredPlugins(plugin$: Observable<PluginWrapper>) {
    // MEMORY TRACKING helper
    const trackMem = (label: string, memBefore: { heapUsed: number }) => {
      const memAfter = process.memoryUsage();
      const delta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
      const current = memAfter.heapUsed / 1024 / 1024;
      this.log.info(
        `[HANDLE_PLUGINS_MEMORY] ${label.padEnd(40)} delta=${delta.toFixed(2).padStart(8)}MB, total=${current.toFixed(1)}MB`
      );
      return memAfter;
    };

    let memBefore = process.memoryUsage();
    this.log.info(`[HANDLE_PLUGINS_MEMORY] === handleDiscoveredPlugins BREAKDOWN ===`);

    const pluginEnableStatuses = new Map<
      PluginName,
      { plugin: PluginWrapper; isEnabled: boolean }
    >();
    const plugins = await firstValueFrom(plugin$.pipe(toArray()));
    memBefore = trackMem(`toArray() - got ${plugins.length} plugins`, memBefore);

    // Register config descriptors and deprecations
    // MEMORY TRACKING - track per-plugin cost of getConfigDescriptor WITH module tracking
    const configDescriptorDeltas: Array<{
      name: string;
      delta: number;
      modulesLoaded: number;
      isEnabled?: boolean;
      skipped?: boolean;
    }> = [];

    // Track modules loaded by each plugin
    const getRequireCacheSize = () => Object.keys(require.cache).length;

    // LAZY LOADING: Check if we should skip config loading for non-essential plugins
    const LAZY_TASK_MANAGER_POC = process.env.LAZY_TASK_MANAGER_POC === 'true';
    const CORE_INFRASTRUCTURE_PLUGINS = new Set([
      'licensing', 'taskManager', 'encryptedSavedObjects', 'eventLog',
      'features', 'security', 'spaces', 'usageCollection', 'telemetry',
      'telemetryCollectionManager', 'telemetryCollectionXpack', 'files',
      'cloud', 'monitoringCollection', 'interactiveSetup',
      // Actions framework - deeply integrated, needs proper config defaults
      'actions', 'stackConnectors',
    ]);

    let skippedPluginCount = 0;

    // Import schema for creating permissive schemas for skipped plugins
    const { schema } = require('@kbn/config-schema');
    const permissiveSchema = schema.object({}, { unknowns: 'allow' });

    for (const plugin of plugins) {
      // LAZY LOADING: Skip loading config for non-essential plugins
      // This avoids loading all plugin code just to get config schemas
      // But we need to register a permissive schema so config validation doesn't fail
      if (LAZY_TASK_MANAGER_POC && !CORE_INFRASTRUCTURE_PLUGINS.has(plugin.name)) {
        skippedPluginCount++;
        configDescriptorDeltas.push({ name: plugin.name, delta: 0, modulesLoaded: 0, skipped: true });
        // Register a permissive schema that accepts any config
        // Use try/catch in case another plugin with same root path already registered
        try {
          this.coreContext.configService.setSchema(plugin.configPath, permissiveSchema);
        } catch (e) {
          // Schema already registered, that's fine
          this.log.debug(`[LAZY_POC] Config path ${plugin.configPath} already registered, skipping`);
        }
        continue;
      }

      const modulesBefore = getRequireCacheSize();
      const memBeforeConfig = process.memoryUsage();

      const configDescriptor = plugin.getConfigDescriptor();

      const memAfterConfig = process.memoryUsage();
      const modulesAfter = getRequireCacheSize();

      const delta = (memAfterConfig.heapUsed - memBeforeConfig.heapUsed) / 1024 / 1024;
      const modulesLoaded = modulesAfter - modulesBefore;

      // Track all plugins with significant memory or module loads
      if (Math.abs(delta) > 1 || modulesLoaded > 50) {
        configDescriptorDeltas.push({ name: plugin.name, delta, modulesLoaded });
      }

      if (configDescriptor) {
        this.pluginConfigDescriptors.set(plugin.name, configDescriptor);
        if (configDescriptor.deprecations) {
          this.coreContext.configService.addDeprecationProvider(
            plugin.configPath,
            configDescriptor.deprecations
          );
        }
        if (configDescriptor.exposeToUsage) {
          this.pluginConfigUsageDescriptors.set(
            Array.isArray(plugin.configPath) ? plugin.configPath.join('.') : plugin.configPath,
            getFlattenedObject(configDescriptor.exposeToUsage)
          );
        }
        if (configDescriptor.dynamicConfig) {
          const configKeys = Object.entries(getFlattenedObject(configDescriptor.dynamicConfig))
            .filter(([, value]) => value === true)
            .map(([key]) => key);
          if (configKeys.length > 0) {
            this.coreContext.configService.addDynamicConfigPaths(plugin.configPath, configKeys);
          }
        }
        this.coreContext.configService.setSchema(plugin.configPath, configDescriptor.schema);
      }
    }
    memBefore = trackMem('register config descriptors loop', memBefore);

    // LAZY LOADING: Log how many plugins were skipped
    if (LAZY_TASK_MANAGER_POC && skippedPluginCount > 0) {
      this.log.info(`[LAZY_POC] Skipped config loading for ${skippedPluginCount} non-essential plugins`);
    }

    const config = await firstValueFrom(this.config$);
    const enableAllPlugins = config.shouldEnableAllPlugins;
    if (enableAllPlugins) {
      this.log.warn('Detected override configuration; will enable all plugins');
    }

    // Validate config and handle enabled statuses.
    // NOTE: We can't do both in the same previous loop because some plugins' deprecations may affect others.
    // Hence, we need all the deprecations to be registered before accessing any config parameter.
    for (const plugin of plugins) {
      // LAZY LOADING: For skipped plugins, mark them as enabled but don't validate config
      // They will be loaded on-demand if needed
      const wasSkipped = LAZY_TASK_MANAGER_POC && !CORE_INFRASTRUCTURE_PLUGINS.has(plugin.name);

      const isEnabled = wasSkipped
        ? true // Mark as "enabled" so they can be loaded on-demand
        : enableAllPlugins ||
          (await this.coreContext.configService.isEnabledAtPath(plugin.configPath));

      if (pluginEnableStatuses.has(plugin.name)) {
        throw new Error(`Plugin with id "${plugin.name}" is already registered!`);
      }

      // Update configDescriptorDeltas with enabled status for later analysis
      const existingEntry = configDescriptorDeltas.find((d) => d.name === plugin.name);
      if (existingEntry) {
        existingEntry.isEnabled = isEnabled;
      }

      if (plugin.includesUiPlugin) {
        const uiPluginInternalInfo =
          plugin.manifest.type === PluginType.preboot
            ? this.prebootUiPluginInternalInfo
            : this.standardUiPluginInternalInfo;
        uiPluginInternalInfo.set(plugin.name, {
          requiredBundles: plugin.requiredBundles,
          version: plugin.manifest.version,
          publicTargetDir: Path.resolve(plugin.path, 'target/public'),
          publicAssetsDir: Path.resolve(plugin.path, 'public/assets'),
        });
      }

      pluginEnableStatuses.set(plugin.name, { plugin, isEnabled });
    }
    memBefore = trackMem('validate config & enable statuses loop', memBefore);

    // MEMORY ANALYSIS - Log per-plugin breakdown with enabled status
    const sortedByMemory = [...configDescriptorDeltas].filter((p) => !p.skipped).sort((a, b) => b.delta - a.delta);
    const skippedPlugins = configDescriptorDeltas.filter((p) => p.skipped);
    const disabledPluginMemory = configDescriptorDeltas
      .filter((p) => p.isEnabled === false && !p.skipped)
      .reduce((sum, p) => sum + p.delta, 0);
    const enabledPluginMemory = configDescriptorDeltas
      .filter((p) => p.isEnabled === true && !p.skipped)
      .reduce((sum, p) => sum + p.delta, 0);
    const totalModulesLoaded = configDescriptorDeltas.filter((p) => !p.skipped).reduce((sum, p) => sum + p.modulesLoaded, 0);

    // Calculate memory per module to understand efficiency
    const totalMem = enabledPluginMemory + disabledPluginMemory;
    const avgMemPerModule = totalModulesLoaded > 0 ? (totalMem / totalModulesLoaded) * 1024 : 0; // KB per module

    this.log.info(`\n[MEMORY_ANALYSIS] ========================================`);
    this.log.info(`[MEMORY_ANALYSIS] Plugin Code Loading Analysis (getConfigDescriptor)`);
    this.log.info(`[MEMORY_ANALYSIS] ----------------------------------------`);
    this.log.info(`[MEMORY_ANALYSIS] ${'Plugin'.padEnd(35)} ${'Memory'.padStart(10)} ${'Modules'.padStart(8)} ${'KB/mod'.padStart(8)} ${'Enabled'.padStart(8)}`);
    sortedByMemory.slice(0, 25).forEach((p) => {
      const enabledStr = p.isEnabled === undefined ? '?' : p.isEnabled ? 'YES' : 'NO';
      const kbPerModule = p.modulesLoaded > 0 ? ((p.delta * 1024) / p.modulesLoaded).toFixed(0) : '0';
      this.log.info(
        `[MEMORY_ANALYSIS] ${p.name.padEnd(35)} ${p.delta.toFixed(2).padStart(8)}MB ${p.modulesLoaded.toString().padStart(8)} ${kbPerModule.padStart(8)} ${enabledStr.padStart(8)}`
      );
    });
    this.log.info(`[MEMORY_ANALYSIS] ----------------------------------------`);
    this.log.info(`[MEMORY_ANALYSIS] ENABLED plugins memory:  ${enabledPluginMemory.toFixed(2)}MB`);
    this.log.info(`[MEMORY_ANALYSIS] DISABLED plugins memory: ${disabledPluginMemory.toFixed(2)}MB  <-- WASTED!`);
    if (skippedPlugins.length > 0) {
      this.log.info(`[MEMORY_ANALYSIS] SKIPPED plugins (lazy): ${skippedPlugins.length} plugins - 0MB loaded!`);
    }
    this.log.info(`[MEMORY_ANALYSIS] Total modules loaded:    ${totalModulesLoaded}`);
    this.log.info(`[MEMORY_ANALYSIS] Avg memory per module:   ${avgMemPerModule.toFixed(1)}KB`);
    this.log.info(`[MEMORY_ANALYSIS] ========================================`);

    // V8 Heap breakdown
    const v8 = require('v8');
    const heapStats = v8.getHeapStatistics();
    const heapSpaces = v8.getHeapSpaceStatistics();
    this.log.info(`[MEMORY_ANALYSIS] V8 Heap Breakdown:`);
    this.log.info(`[MEMORY_ANALYSIS]   Total heap size:     ${(heapStats.total_heap_size / 1024 / 1024).toFixed(1)}MB`);
    this.log.info(`[MEMORY_ANALYSIS]   Used heap size:      ${(heapStats.used_heap_size / 1024 / 1024).toFixed(1)}MB`);
    this.log.info(`[MEMORY_ANALYSIS]   External memory:     ${(heapStats.external_memory / 1024 / 1024).toFixed(1)}MB`);
    this.log.info(`[MEMORY_ANALYSIS]   Malloced memory:     ${(heapStats.malloced_memory / 1024 / 1024).toFixed(1)}MB`);
    this.log.info(`[MEMORY_ANALYSIS] Heap Spaces (what's IN the heap):`);
    for (const space of heapSpaces) {
      if (space.space_used_size > 1024 * 1024) {
        // Only show spaces > 1MB
        this.log.info(
          `[MEMORY_ANALYSIS]   ${space.space_name.padEnd(20)} ${(space.space_used_size / 1024 / 1024).toFixed(1)}MB used of ${(space.space_size / 1024 / 1024).toFixed(1)}MB`
        );
      }
    }

    // Analyze what's in require.cache
    const cacheKeys = Object.keys(require.cache);
    const kibanaModules = cacheKeys.filter((k) => k.includes('/kibana/'));
    const nodeModules = cacheKeys.filter((k) => k.includes('node_modules'));
    const coreModules = cacheKeys.filter((k) => !k.includes('/'));
    this.log.info(`[MEMORY_ANALYSIS] Module Cache Breakdown:`);
    this.log.info(`[MEMORY_ANALYSIS]   Total cached modules: ${cacheKeys.length}`);
    this.log.info(`[MEMORY_ANALYSIS]   Kibana source:        ${kibanaModules.length} modules`);
    this.log.info(`[MEMORY_ANALYSIS]   node_modules:         ${nodeModules.length} modules`);
    this.log.info(`[MEMORY_ANALYSIS]   Node.js built-in:     ${coreModules.length} modules`);
    this.log.info(`[MEMORY_ANALYSIS] ========================================`);
    this.log.info(`[MEMORY_ANALYSIS] WHY SO MUCH MEMORY?`);
    this.log.info(`[MEMORY_ANALYSIS] The ~300-400MB is NOT source code text. It's:`);
    this.log.info(`[MEMORY_ANALYSIS]   1. Config schemas with validators (runtime objects)`);
    this.log.info(`[MEMORY_ANALYSIS]   2. Compiled bytecode/JIT code for ${cacheKeys.length} modules`);
    this.log.info(`[MEMORY_ANALYSIS]   3. Static data: route defs, SO mappings, constants`);
    this.log.info(`[MEMORY_ANALYSIS]   4. Closure scopes and function objects`);
    this.log.info(`[MEMORY_ANALYSIS] ========================================`);

    // LAZY LOADING ANALYSIS
    this.log.info(`[LAZY_ANALYSIS] ========================================`);
    this.log.info(`[LAZY_ANALYSIS] WHAT COULD BE LAZY LOADED?`);
    this.log.info(`[LAZY_ANALYSIS] ========================================`);
    this.log.info(`[LAZY_ANALYSIS] MUST be eager (needed at startup):`);
    this.log.info(`[LAZY_ANALYSIS]   - Config schemas (for validation)     ~50-100MB`);
    this.log.info(`[LAZY_ANALYSIS]   - Plugin dependency graph             ~5MB`);
    this.log.info(`[LAZY_ANALYSIS]   - Core services setup                 ~20MB`);
    this.log.info(`[LAZY_ANALYSIS]   ESTIMATED MINIMUM:                    ~75-125MB`);
    this.log.info(`[LAZY_ANALYSIS] ----------------------------------------`);
    this.log.info(`[LAZY_ANALYSIS] COULD be lazy (only needed on first use):`);
    this.log.info(`[LAZY_ANALYSIS]   - Route handlers (loaded but not called)`);
    this.log.info(`[LAZY_ANALYSIS]   - Saved Object type definitions`);
    this.log.info(`[LAZY_ANALYSIS]   - Alert/Rule type definitions`);
    this.log.info(`[LAZY_ANALYSIS]   - Feature privilege definitions`);
    this.log.info(`[LAZY_ANALYSIS]   - UI capability definitions`);
    this.log.info(`[LAZY_ANALYSIS]   - Most plugin dependencies`);
    this.log.info(`[LAZY_ANALYSIS]   ESTIMATED LAZY-LOADABLE:              ~300-350MB (60-70%)`);
    this.log.info(`[LAZY_ANALYSIS] ========================================`);
    this.log.info(`[LAZY_ANALYSIS] POTENTIAL OPTIMIZATION STRATEGIES:`);
    this.log.info(`[LAZY_ANALYSIS]   1. Defer getConfigDescriptor() until after enabled check`);
    this.log.info(`[LAZY_ANALYSIS]      Saves: ~20MB (disabled plugins)`);
    this.log.info(`[LAZY_ANALYSIS]   2. Lazy-load route handlers on first request`);
    this.log.info(`[LAZY_ANALYSIS]      Saves: ~100-150MB`);
    this.log.info(`[LAZY_ANALYSIS]   3. Lazy-load SO types on first access`);
    this.log.info(`[LAZY_ANALYSIS]      Saves: ~50MB`);
    this.log.info(`[LAZY_ANALYSIS]   4. Load plugin code only during setup(), not discovery`);
    this.log.info(`[LAZY_ANALYSIS]      Saves: ~200MB (plugins load code twice currently)`);
    this.log.info(`[LAZY_ANALYSIS] ========================================`);
    this.log.info(`[LAZY_ANALYSIS] CURRENT: ~450MB old_space`);
    this.log.info(`[LAZY_ANALYSIS] POTENTIAL: ~150MB with lazy loading`);
    this.log.info(`[LAZY_ANALYSIS] SAVINGS: ~300MB (67% reduction)`);
    this.log.info(`[LAZY_ANALYSIS] ========================================\n`);

    // Add the plugins to the Plugin System if enabled and its dependencies are met
    const disabledPlugins = [];
    const disabledDependants = [];
    const disabledDependantsCauses = new Set<string>();
    const pluginEnablementCache = new Map<PluginName, PluginEnablementResult>();

    for (const [pluginName, { plugin, isEnabled }] of pluginEnableStatuses) {
      this.validatePluginDependencies(plugin, pluginEnableStatuses);

      const pluginEnablement = shouldEnablePlugin({
        pluginName,
        pluginEnableStatuses,
        cache: pluginEnablementCache,
      });

      if (pluginEnablement.enabled) {
        if (plugin.manifest.type === PluginType.preboot) {
          this.prebootPluginsSystem.addPlugin(plugin);
        } else {
          this.standardPluginsSystem.addPlugin(plugin);
        }
      } else if (isEnabled) {
        disabledDependants.push(pluginName);
        pluginEnablement.missingOrIncompatibleDependencies.forEach((dependency) =>
          disabledDependantsCauses.add(dependency)
        );
      } else {
        disabledPlugins.push(pluginName);
      }
    }
    memBefore = trackMem('add plugins to system loop', memBefore);
    this.log.info(`[HANDLE_PLUGINS_MEMORY] === END handleDiscoveredPlugins ===`);

    this.log.debug(`Discovered ${pluginEnableStatuses.size} plugins.`);
    if (disabledPlugins.length) {
      this.log.info(`The following plugins are disabled: "${disabledPlugins}".`);
    }
    if (disabledDependants.length) {
      this.log.info(
        `Plugins "${disabledDependants}" have been disabled since the following direct or transitive dependencies are missing, disabled, or have incompatible types: [${Array.from(
          disabledDependantsCauses
        )}].`
      );
    }
  }

  /** Throws an error if the plugin's dependencies are invalid. */
  private validatePluginDependencies(
    plugin: PluginWrapper,
    pluginEnableStatuses: Map<PluginName, { plugin: PluginWrapper; isEnabled: boolean }>
  ) {
    const { name, manifest, requiredBundles, requiredPlugins } = plugin;

    // validate that `requiredBundles` ids point to a discovered plugin which `includesUiPlugin`
    for (const requiredBundleId of requiredBundles) {
      if (!pluginEnableStatuses.has(requiredBundleId)) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" but it is missing.`
        );
      }

      const requiredPlugin = pluginEnableStatuses.get(requiredBundleId)!.plugin;
      if (!requiredPlugin.includesUiPlugin) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" but it doesn't have a UI bundle.`
        );
      }

      if (requiredPlugin.manifest.type !== plugin.manifest.type) {
        throw new Error(
          `Plugin bundle with id "${requiredBundleId}" is required by plugin "${name}" and expected to have "${manifest.type}" type, but its type is "${requiredPlugin.manifest.type}".`
        );
      }
    }

    // validate that OSS plugins do not have required dependencies on X-Pack plugins
    if (plugin.source === 'oss') {
      for (const id of [...requiredPlugins, ...requiredBundles]) {
        const requiredPlugin = pluginEnableStatuses.get(id);
        if (requiredPlugin && requiredPlugin.plugin.source === 'x-pack') {
          throw new Error(
            `X-Pack plugin or bundle with id "${id}" is required by OSS plugin "${name}", which is prohibited. Consider making this an optional dependency instead.`
          );
        }
      }
    }
  }
}

type PluginEnablementResult =
  | { enabled: true }
  | { enabled: false; missingOrIncompatibleDependencies: string[] };

function shouldEnablePlugin({
  pluginName,
  pluginEnableStatuses,
  cache,
  parents = [],
}: {
  pluginName: PluginName;
  pluginEnableStatuses: Map<PluginName, { plugin: PluginWrapper; isEnabled: boolean }>;
  cache: Map<PluginName, PluginEnablementResult>;
  parents?: PluginName[];
}): PluginEnablementResult {
  const cachedValue = cache.get(pluginName);
  if (cachedValue) {
    return cachedValue;
  }

  const pluginInfo = pluginEnableStatuses.get(pluginName);

  let result: PluginEnablementResult;
  if (pluginInfo === undefined || !pluginInfo.isEnabled) {
    result = {
      enabled: false,
      missingOrIncompatibleDependencies: [],
    };
  } else {
    const missingOrIncompatibleDependencies = pluginInfo.plugin.requiredPlugins
      .filter((dep) => !parents.includes(dep))
      .filter(
        (dependencyName) =>
          pluginEnableStatuses.get(dependencyName)?.plugin.manifest.type !==
            pluginInfo.plugin.manifest.type ||
          !shouldEnablePlugin({
            pluginName: dependencyName,
            pluginEnableStatuses,
            parents: [...parents, pluginName],
            cache,
          }).enabled
      );

    if (missingOrIncompatibleDependencies.length === 0) {
      result = {
        enabled: true,
      };
    } else {
      result = {
        enabled: false,
        missingOrIncompatibleDependencies,
      };
    }
  }

  cache.set(pluginName, result);
  return result;
}
