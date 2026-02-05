/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { withTimeout, isPromise } from '@kbn/std';
import type { DiscoveredPlugin, PluginName } from '@kbn/core-base-common';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type { Logger } from '@kbn/logging';
import { PluginType } from '@kbn/core-base-common';
import type { PluginWrapper } from './plugin';
import { type PluginDependencies } from './types';
import {
  createPluginPrebootSetupContext,
  createPluginSetupContext,
  createPluginStartContext,
} from './plugin_context';
import type {
  PluginsServicePrebootSetupDeps,
  PluginsServiceSetupDeps,
  PluginsServiceStartDeps,
} from './plugins_service';
import { RuntimePluginContractResolver } from './plugin_contract_resolver';

// Lazy loading configuration for Task Manager role PoC
// When LAZY_TASK_MANAGER_POC=true, only load core infrastructure plugins at startup
// All other plugins are deferred and loaded on-demand when needed
const LAZY_TASK_MANAGER_POC = process.env.LAZY_TASK_MANAGER_POC === 'true';

// Core infrastructure plugins that MUST be loaded at startup for Task Manager role
// These are the absolute minimum required for Kibana to function and Task Manager to poll
const CORE_INFRASTRUCTURE_PLUGINS = new Set([
  // Core licensing - required by taskManager
  'licensing',
  // Task Manager itself
  'taskManager',
  // Task Manager Dependencies - registers encryptedSavedObjects client with taskManager
  // CRITICAL: Without this, Task Manager cannot decrypt API keys stored in tasks
  'taskManagerDependencies',
  // Required for encrypted task state
  'encryptedSavedObjects',
  // Required for task events
  'eventLog',
  // Core feature registration
  'features',
  // Auth infrastructure
  'security',
  // Multi-tenancy
  'spaces',
  // Actions framework - deeply integrated with core services (HTTP, Features, EventLog,
  // Analytics, SavedObjects). Required by most task-owning plugins. Too many locked
  // registrations to make lazy-loadable without major architectural changes.
  'actions',
  // Stack connectors - actions dependency
  'stackConnectors',
  // Usage tracking (lightweight)
  'usageCollection',
  // Telemetry infrastructure
  'telemetry',
  'telemetryCollectionManager',
  'telemetryCollectionXpack',
  // Files service (may be needed by core)
  'files',
  // Cloud integration
  'cloud',
  // Monitoring collection (lightweight)
  'monitoringCollection',
]);

const Sec = 1000;

/** @internal */
export class PluginsSystem<T extends PluginType> {
  private readonly runtimeResolver = new RuntimePluginContractResolver();
  private readonly plugins = new Map<PluginName, PluginWrapper>();
  private readonly log: Logger;
  // `satup`, the past-tense version of the noun `setup`.
  private readonly satupPlugins: PluginName[] = [];
  private sortedPluginNames?: Set<string>;

  // LAZY LOADING: Store deferred plugins that haven't been loaded yet
  private readonly deferredPlugins = new Map<PluginName, PluginWrapper>();
  // LAZY LOADING: Store contracts for plugins (both eagerly and lazily loaded)
  private readonly pluginContracts = new Map<PluginName, unknown>();
  // LAZY LOADING: Store start contracts for plugins (both eagerly and lazily loaded)
  private readonly pluginStartContracts = new Map<PluginName, unknown>();
  // LAZY LOADING: Store the setup deps for lazy loading later
  private setupDeps?: PluginsServiceSetupDeps;
  // LAZY LOADING: Store the start deps for lazy loading later
  private startDeps?: PluginsServiceStartDeps;
  // LAZY LOADING: Track plugins currently being loaded (prevent circular loading)
  private readonly loadingPlugins = new Set<PluginName>();

  constructor(private readonly coreContext: CoreContext, public readonly type: T) {
    this.log = coreContext.logger.get('plugins-system', this.type);
  }

  public addPlugin(plugin: PluginWrapper) {
    if (plugin.manifest.type !== this.type) {
      throw new Error(
        `Cannot add plugin with type "${plugin.manifest.type}" to plugin system with type "${this.type}".`
      );
    }

    this.plugins.set(plugin.name, plugin);

    // clear sorted plugin name cache on addition
    this.sortedPluginNames = undefined;
  }

  public getPlugins() {
    return [...this.plugins.values()];
  }

  /**
   * @returns a Map of each plugin and an Array of its available dependencies
   * @internal
   */
  public getPluginDependencies(): PluginDependencies {
    const asNames = new Map<string, string[]>();
    const asOpaqueIds = new Map<symbol, symbol[]>();

    for (const pluginName of this.getTopologicallySortedPluginNames()) {
      const plugin = this.plugins.get(pluginName)!;
      const dependencies = [
        ...new Set([
          ...plugin.requiredPlugins,
          ...plugin.optionalPlugins.filter((optPlugin) => this.plugins.has(optPlugin)),
        ]),
      ];

      asNames.set(
        plugin.name,
        dependencies.map((depId) => this.plugins.get(depId)!.name)
      );
      asOpaqueIds.set(
        plugin.opaqueId,
        dependencies.map((depId) => this.plugins.get(depId)!.opaqueId)
      );
    }

    return { asNames, asOpaqueIds };
  }

  public async setupPlugins(
    deps: T extends PluginType.preboot ? PluginsServicePrebootSetupDeps : PluginsServiceSetupDeps
  ): Promise<Map<string, unknown>> {
    const contracts = new Map<PluginName, unknown>();
    if (this.plugins.size === 0) {
      return contracts;
    }

    // Store deps for lazy loading later
    if (this.type === PluginType.standard) {
      this.setupDeps = deps as PluginsServiceSetupDeps;
    }

    const runtimeDependencies = buildPluginRuntimeDependencyMap(this.plugins);
    this.runtimeResolver.setDependencyMap(runtimeDependencies);

    let sortedPlugins = new Map(
      [...this.getTopologicallySortedPluginNames()]
        .map((pluginName) => [pluginName, this.plugins.get(pluginName)!] as [string, PluginWrapper])
        .filter(([pluginName, plugin]) => plugin.includesServerPlugin)
    );

    // LAZY TASK MANAGER POC: True lazy loading - only load core infrastructure
    if (LAZY_TASK_MANAGER_POC && this.type === PluginType.standard) {
      const originalCount = sortedPlugins.size;
      const deferredPluginNames: string[] = [];

      // Separate plugins into core (load now) and deferred (load on-demand)
      const corePlugins = new Map<string, PluginWrapper>();

      for (const [pluginName, plugin] of sortedPlugins) {
        if (CORE_INFRASTRUCTURE_PLUGINS.has(pluginName)) {
          corePlugins.set(pluginName, plugin);
        } else {
          // Store for lazy loading later
          this.deferredPlugins.set(pluginName, plugin);
          deferredPluginNames.push(pluginName);
        }
      }

      sortedPlugins = corePlugins;

      const memBefore = process.memoryUsage();
      this.log.info(`[LAZY_POC] ========================================`);
      this.log.info(`[LAZY_POC] TRUE LAZY LOADING ENABLED`);
      this.log.info(`[LAZY_POC] ========================================`);
      this.log.info(`[LAZY_POC] Total plugins discovered: ${originalCount}`);
      this.log.info(`[LAZY_POC] Core plugins to load NOW: ${corePlugins.size}`);
      this.log.info(`[LAZY_POC] Deferred plugins (lazy): ${deferredPluginNames.length}`);
      this.log.info(`[LAZY_POC] Core plugins: [${[...corePlugins.keys()].join(', ')}]`);
      this.log.info(`[LAZY_POC] Memory before setup: ${(memBefore.heapUsed / 1024 / 1024).toFixed(1)}MB`);
      this.log.info(`[LAZY_POC] ========================================`);
    }

    this.log.info(
      `Setting up [${sortedPlugins.size}] plugins: [${[...sortedPlugins.keys()].join(',')}]`
    );

    // MEMORY TRACKING - collect per-plugin memory deltas
    const pluginMemoryDeltas: Array<{
      name: string;
      heapDelta: number;
      rssDelta: number;
      initHeapDelta: number;
      setupHeapDelta: number;
    }> = [];

    for (const [pluginName, plugin] of sortedPlugins) {
      this.log.debug(`Setting up plugin "${pluginName}"...`);
      const pluginDeps = new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins]);
      const pluginDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
        // Only set if present. Could be absent if plugin does not have server-side code or is a
        // missing optional dependency.
        if (contracts.has(dependencyName)) {
          depContracts[dependencyName] = contracts.get(dependencyName);
        }

        return depContracts;
      }, {} as Record<PluginName, unknown>);

      let pluginSetupContext;
      if (this.type === PluginType.preboot) {
        pluginSetupContext = createPluginPrebootSetupContext({
          deps: deps as PluginsServicePrebootSetupDeps,
          plugin,
        });
      } else {
        pluginSetupContext = createPluginSetupContext({
          deps: deps as PluginsServiceSetupDeps,
          plugin,
          runtimeResolver: this.runtimeResolver,
        });
      }

      // MEMORY TRACKING - measure memory BEFORE plugin.init() (which loads the code via require())
      const memBeforeInit = process.memoryUsage();

      await plugin.init();

      // MEMORY TRACKING - measure memory AFTER init but BEFORE setup
      const memAfterInit = process.memoryUsage();
      const initHeapDelta = (memAfterInit.heapUsed - memBeforeInit.heapUsed) / 1024 / 1024;

      // MEMORY TRACKING - measure memory before plugin setup
      const memBefore = process.memoryUsage();

      let contract: unknown;
      const contractOrPromise = plugin.setup(pluginSetupContext, pluginDepContracts);
      if (isPromise(contractOrPromise)) {
        if (this.coreContext.env.mode.dev) {
          this.log.warn(
            `Plugin ${pluginName} is using asynchronous setup lifecycle. Asynchronous plugins support will be removed in a later version.`
          );
        }
        const contractMaybe = await withTimeout<any>({
          promise: contractOrPromise,
          timeoutMs: 10 * Sec,
        });

        if (contractMaybe.timedout) {
          throw new Error(
            `Setup lifecycle of "${pluginName}" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.`
          );
        } else {
          contract = contractMaybe.value;
        }
      } else {
        contract = contractOrPromise;
      }

      // MEMORY TRACKING - measure memory after plugin setup
      const memAfter = process.memoryUsage();
      const setupHeapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
      const rssDelta = (memAfter.rss - memBeforeInit.rss) / 1024 / 1024;
      const totalHeapDelta = initHeapDelta + setupHeapDelta;
      this.log.info(
        `[MEMORY] ${pluginName}: init=${initHeapDelta.toFixed(2)}MB, setup=${setupHeapDelta.toFixed(2)}MB, total=${totalHeapDelta.toFixed(2)}MB`
      );
      pluginMemoryDeltas.push({ name: pluginName, heapDelta: totalHeapDelta, rssDelta, initHeapDelta, setupHeapDelta });

      contracts.set(pluginName, contract);
      this.pluginContracts.set(pluginName, contract); // Also store for lazy loading access
      this.satupPlugins.push(pluginName);
    }

    // MEMORY TRACKING - Output sorted summary of top memory consumers
    const sortedByHeap = [...pluginMemoryDeltas].sort((a, b) => b.heapDelta - a.heapDelta);
    const totalHeap = pluginMemoryDeltas.reduce((sum, p) => sum + p.heapDelta, 0);
    const totalInit = pluginMemoryDeltas.reduce((sum, p) => sum + p.initHeapDelta, 0);
    const totalSetup = pluginMemoryDeltas.reduce((sum, p) => sum + p.setupHeapDelta, 0);
    const totalRss = pluginMemoryDeltas.reduce((sum, p) => sum + p.rssDelta, 0);

    this.log.info(`\n[PLUGIN_MEMORY_SUMMARY] ========================================`);
    this.log.info(`[PLUGIN_MEMORY_SUMMARY] Top 20 plugins by TOTAL heap (init + setup):`);
    this.log.info(`[PLUGIN_MEMORY_SUMMARY] ${'Plugin'.padEnd(35)} ${'Init'.padStart(10)} ${'Setup'.padStart(10)} ${'Total'.padStart(10)}`);
    sortedByHeap.slice(0, 20).forEach((p, i) => {
      this.log.info(
        `[PLUGIN_MEMORY_SUMMARY] ${(i + 1).toString().padStart(2)}. ${p.name.padEnd(35)} ${p.initHeapDelta.toFixed(2).padStart(8)}MB ${p.setupHeapDelta.toFixed(2).padStart(8)}MB ${p.heapDelta.toFixed(2).padStart(8)}MB`
      );
    });
    this.log.info(`[PLUGIN_MEMORY_SUMMARY] ----------------------------------------`);
    this.log.info(
      `[PLUGIN_MEMORY_SUMMARY] TOTAL (${pluginMemoryDeltas.length} plugins):`
    );
    this.log.info(`[PLUGIN_MEMORY_SUMMARY]   Init (code loading):  ${totalInit.toFixed(2)}MB`);
    this.log.info(`[PLUGIN_MEMORY_SUMMARY]   Setup (runtime):      ${totalSetup.toFixed(2)}MB`);
    this.log.info(`[PLUGIN_MEMORY_SUMMARY]   Combined:             ${totalHeap.toFixed(2)}MB`);
    this.log.info(`[PLUGIN_MEMORY_SUMMARY] ========================================\n`);

    this.runtimeResolver.resolveSetupRequests(contracts);

    // LAZY LOADING: Wire up the plugin loader to Task Manager if it was set up
    if (LAZY_TASK_MANAGER_POC && this.type === PluginType.standard && contracts.has('taskManager')) {
      const taskManagerContract = contracts.get('taskManager') as {
        setPluginLoader?: (loader: (pluginName: string) => Promise<unknown>) => void;
      };
      if (taskManagerContract && typeof taskManagerContract.setPluginLoader === 'function') {
        taskManagerContract.setPluginLoader((pluginName: string) =>
          this.loadPluginOnDemand(pluginName)
        );
        this.log.info(`[LAZY_POC] Wired plugin loader to Task Manager`);
      }
    }

    return contracts;
  }

  public async startPlugins(deps: PluginsServiceStartDeps) {
    if (this.type === PluginType.preboot) {
      throw new Error('Preboot plugins cannot be started.');
    }

    // LAZY LOADING: Store start deps for lazy loading later
    this.startDeps = deps;

    const contracts = new Map<PluginName, unknown>();
    if (this.satupPlugins.length === 0) {
      return contracts;
    }

    this.log.info(`Starting [${this.satupPlugins.length}] plugins: [${[...this.satupPlugins]}]`);

    // MEMORY TRACKING for start phase
    const pluginStartDeltas: Array<{ name: string; heapDelta: number }> = [];

    for (const pluginName of this.satupPlugins) {
      this.log.debug(`Starting plugin "${pluginName}"...`);
      const plugin = this.plugins.get(pluginName)!;
      const pluginDeps = new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins]);
      const pluginDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
        // Only set if present. Could be absent if plugin does not have server-side code or is a
        // missing optional dependency.
        if (contracts.has(dependencyName)) {
          depContracts[dependencyName] = contracts.get(dependencyName);
        }

        return depContracts;
      }, {} as Record<PluginName, unknown>);

      // MEMORY TRACKING - before start
      const memBeforeStart = process.memoryUsage();

      let contract: unknown;
      const contractOrPromise = plugin.start(
        createPluginStartContext({ deps, plugin, runtimeResolver: this.runtimeResolver }),
        pluginDepContracts
      );
      if (isPromise(contractOrPromise)) {
        if (this.coreContext.env.mode.dev) {
          this.log.warn(
            `Plugin ${pluginName} is using asynchronous start lifecycle. Asynchronous plugins support will be removed in a later version.`
          );
        }
        const contractMaybe = await withTimeout({
          promise: contractOrPromise,
          timeoutMs: 10 * Sec,
        });

        if (contractMaybe.timedout) {
          throw new Error(
            `Start lifecycle of "${pluginName}" plugin wasn't completed in 10sec. Consider disabling the plugin and re-start.`
          );
        } else {
          contract = contractMaybe.value;
        }
      } else {
        contract = contractOrPromise;
      }

      // MEMORY TRACKING - after start
      const memAfterStart = process.memoryUsage();
      const heapDelta = (memAfterStart.heapUsed - memBeforeStart.heapUsed) / 1024 / 1024;
      if (Math.abs(heapDelta) > 1) {
        // Only log if significant (>1MB)
        this.log.info(`[MEMORY_START] ${pluginName}: ${heapDelta.toFixed(2)}MB`);
      }
      pluginStartDeltas.push({ name: pluginName, heapDelta });

      contracts.set(pluginName, contract);
      // LAZY LOADING: Also store in pluginStartContracts for lazy loading lookup
      this.pluginStartContracts.set(pluginName, contract);
    }

    // MEMORY TRACKING - Output summary of top start memory consumers
    const sortedByHeap = [...pluginStartDeltas].sort((a, b) => b.heapDelta - a.heapDelta);
    const totalStartHeap = pluginStartDeltas.reduce((sum, p) => sum + p.heapDelta, 0);

    this.log.info(`\n[PLUGIN_START_MEMORY_SUMMARY] ========================================`);
    this.log.info(`[PLUGIN_START_MEMORY_SUMMARY] Top 15 plugins by heap during start():`);
    sortedByHeap.slice(0, 15).forEach((p, i) => {
      this.log.info(
        `[PLUGIN_START_MEMORY_SUMMARY] ${(i + 1).toString().padStart(2)}. ${p.name.padEnd(35)} ${p.heapDelta.toFixed(2).padStart(8)}MB`
      );
    });
    this.log.info(`[PLUGIN_START_MEMORY_SUMMARY] ----------------------------------------`);
    this.log.info(`[PLUGIN_START_MEMORY_SUMMARY] TOTAL start(): ${totalStartHeap.toFixed(2)}MB`);
    this.log.info(`[PLUGIN_START_MEMORY_SUMMARY] ========================================\n`);

    this.runtimeResolver.resolveStartRequests(contracts);

    return contracts;
  }

  public async stopPlugins() {
    if (this.plugins.size === 0 || this.satupPlugins.length === 0) {
      return;
    }

    this.log.info(`Stopping all plugins.`);

    const reverseDependencyMap = buildReverseDependencyMap(this.plugins);
    const pluginStopPromiseMap = new Map<PluginName, Promise<void>>();
    for (let i = this.satupPlugins.length - 1; i > -1; i--) {
      const pluginName = this.satupPlugins[i];
      const plugin = this.plugins.get(pluginName)!;
      const pluginDependant = reverseDependencyMap.get(pluginName)!;
      const dependantPromises = pluginDependant.map(
        (dependantName) => pluginStopPromiseMap.get(dependantName)!
      );

      // Stop plugin as soon as all the dependant plugins are stopped.
      const pluginStopPromise = Promise.all(dependantPromises).then(async () => {
        this.log.debug(`Stopping plugin "${pluginName}"...`);

        try {
          const resultMaybe = await withTimeout({
            promise: plugin.stop(),
            timeoutMs: 15 * Sec,
          });
          if (resultMaybe?.timedout) {
            this.log.warn(`"${pluginName}" plugin didn't stop in 15sec., move on to the next.`);
          }
        } catch (e) {
          this.log.warn(`"${pluginName}" thrown during stop: ${e}`);
        }
      });
      pluginStopPromiseMap.set(pluginName, pluginStopPromise);
    }

    await Promise.allSettled(pluginStopPromiseMap.values());

    this.log.info(`All plugins stopped.`);
  }

  /**
   * LAZY LOADING: Load a plugin on-demand along with all its dependencies.
   * This is called when a task needs to execute and its owner plugin isn't loaded yet.
   *
   * @param pluginName - The name of the plugin to load
   * @returns The plugin's setup contract
   */
  public async loadPluginOnDemand(pluginName: PluginName): Promise<unknown> {
    // Already loaded?
    if (this.pluginContracts.has(pluginName)) {
      return this.pluginContracts.get(pluginName);
    }

    // Not a deferred plugin? (might be a core plugin or unknown)
    if (!this.deferredPlugins.has(pluginName)) {
      // Check if it's in the main plugins map but not yet loaded
      if (this.plugins.has(pluginName) && !this.pluginContracts.has(pluginName)) {
        this.log.warn(`[LAZY_POC] Plugin "${pluginName}" exists but wasn't deferred - loading anyway`);
      } else {
        this.log.error(`[LAZY_POC] Unknown plugin "${pluginName}" requested for lazy loading`);
        throw new Error(`Plugin "${pluginName}" not found for lazy loading`);
      }
    }

    // Prevent circular loading
    if (this.loadingPlugins.has(pluginName)) {
      this.log.warn(`[LAZY_POC] Circular dependency detected while loading "${pluginName}"`);
      return undefined;
    }

    this.loadingPlugins.add(pluginName);
    const startTime = Date.now();
    const memBefore = process.memoryUsage();

    try {
      this.log.info(`[LAZY_POC] Loading plugin on-demand: "${pluginName}"`);

      const plugin = this.deferredPlugins.get(pluginName) || this.plugins.get(pluginName);
      if (!plugin) {
        throw new Error(`Plugin "${pluginName}" not found`);
      }

      // First, load all required dependencies
      for (const depName of plugin.requiredPlugins) {
        if (!this.pluginContracts.has(depName)) {
          this.log.info(`[LAZY_POC] Loading dependency "${depName}" for "${pluginName}"`);
          await this.loadPluginOnDemand(depName);
        }
      }

      // Also load optional dependencies that are available
      for (const depName of plugin.optionalPlugins) {
        if (this.deferredPlugins.has(depName) && !this.pluginContracts.has(depName)) {
          this.log.info(`[LAZY_POC] Loading optional dependency "${depName}" for "${pluginName}"`);
          await this.loadPluginOnDemand(depName);
        }
      }

      // Build dependency contracts
      const pluginDeps = new Set([...plugin.requiredPlugins, ...plugin.optionalPlugins]);
      const pluginDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
        if (this.pluginContracts.has(dependencyName)) {
          depContracts[dependencyName] = this.pluginContracts.get(dependencyName);
        }
        return depContracts;
      }, {} as Record<PluginName, unknown>);

      // Create setup context
      if (!this.setupDeps) {
        throw new Error('Setup deps not available for lazy loading');
      }

      // LAZY LOADING POC: Enable lazy loading mode on HTTP service
      // This allows routers to be registered after the server has started
      if (
        this.setupDeps.http &&
        typeof (this.setupDeps.http as any).enableLazyLoadingMode === 'function'
      ) {
        (this.setupDeps.http as any).enableLazyLoadingMode();
      }

      // LAZY LOADING POC: Unlock features registration to allow late feature registration
      const featuresContract = this.pluginContracts.get('features') as {
        _unlockRegistration?: () => void;
        _lockRegistration?: () => void;
      };
      if (featuresContract && typeof featuresContract._unlockRegistration === 'function') {
        this.log.debug('[LAZY_POC] Unlocking features registration for lazy plugin loading');
        featuresContract._unlockRegistration();
      }

      // Use inner try/finally to ensure features are ALWAYS re-locked
      try {
        const pluginSetupContext = createPluginSetupContext({
          deps: this.setupDeps,
          plugin,
          runtimeResolver: this.runtimeResolver,
        });

        // LAZY LOADING POC: Load and register the plugin's config schema BEFORE init()
        // This ensures config defaults are properly applied when the plugin reads config
        try {
          const configDescriptor = plugin.getConfigDescriptor();
          if (configDescriptor && configDescriptor.schema) {
            this.log.info(`[LAZY_POC] Replacing config schema for "${pluginName}" at path "${plugin.configPath}"`);
            // Use replaceSchema to override the permissive schema that was registered at startup
            (this.coreContext.configService as any).replaceSchema(
              plugin.configPath,
              configDescriptor.schema
            );
            // Verify the config can be read with the new schema
            try {
              const testConfig = this.coreContext.configService.atPathSync(plugin.configPath);
              this.log.info(`[LAZY_POC] Config schema replaced for "${pluginName}", test read: ${JSON.stringify(testConfig).substring(0, 200)}`);
            } catch (configErr) {
              this.log.error(`[LAZY_POC] Config read test failed for "${pluginName}": ${configErr}`);
            }
          }
        } catch (e) {
          this.log.warn(`[LAZY_POC] Config schema replacement for "${pluginName}" failed: ${e}`);
        }

        // Initialize plugin (loads code)
        await plugin.init();

        // Setup plugin
        let contract: unknown;
        const contractOrPromise = plugin.setup(pluginSetupContext, pluginDepContracts);
        if (isPromise(contractOrPromise)) {
          const contractMaybe = await withTimeout<any>({
            promise: contractOrPromise,
            timeoutMs: 10 * Sec,
          });
          if (contractMaybe.timedout) {
            throw new Error(`Lazy setup of "${pluginName}" timed out after 10sec`);
          }
          contract = contractMaybe.value;
        } else {
          contract = contractOrPromise;
        }

        // Store setup contract
        this.pluginContracts.set(pluginName, contract);
        this.satupPlugins.push(pluginName);

        // Remove from deferred since it's now loaded
        this.deferredPlugins.delete(pluginName);

        // LAZY LOADING POC: Now call start() - this is critical for plugins to initialize their services
        if (!this.startDeps) {
          throw new Error(`Cannot lazy load "${pluginName}" - startDeps not available (startPlugins hasn't been called yet)`);
        }

        this.log.debug(`[LAZY_POC] Calling start() for lazy-loaded plugin "${pluginName}"`);
        
        // Build start dep contracts from already-started plugins
        const pluginStartDepContracts = Array.from(pluginDeps).reduce((depContracts, dependencyName) => {
          if (this.pluginStartContracts.has(dependencyName)) {
            depContracts[dependencyName] = this.pluginStartContracts.get(dependencyName);
          }
          return depContracts;
        }, {} as Record<PluginName, unknown>);

        const pluginStartContext = createPluginStartContext({
          deps: this.startDeps,
          plugin,
          runtimeResolver: this.runtimeResolver,
        });

        let startContract: unknown;
        const startContractOrPromise = plugin.start(pluginStartContext, pluginStartDepContracts);
        if (isPromise(startContractOrPromise)) {
          const startContractMaybe = await withTimeout<any>({
            promise: startContractOrPromise,
            timeoutMs: 10 * Sec,
          });
          if (startContractMaybe.timedout) {
            throw new Error(`Lazy start of "${pluginName}" timed out after 10sec`);
          }
          startContract = startContractMaybe.value;
        } else {
          startContract = startContractOrPromise;
        }

        // Store start contract
        this.pluginStartContracts.set(pluginName, startContract);

        const memAfter = process.memoryUsage();
        const memDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;
        const duration = Date.now() - startTime;

        this.log.info(
          `[LAZY_POC] Loaded "${pluginName}" on-demand (setup+start): ${memDelta.toFixed(2)}MB in ${duration}ms`
        );

        return contract;
      } finally {
        // LAZY LOADING POC: ALWAYS re-lock features registration, even on error
        if (featuresContract && typeof featuresContract._lockRegistration === 'function') {
          this.log.debug('[LAZY_POC] Re-locking features registration after lazy plugin loading');
          featuresContract._lockRegistration();
        }
      }
    } finally {
      this.loadingPlugins.delete(pluginName);
    }
  }

  /**
   * LAZY LOADING: Check if a plugin is available (either loaded or deferred)
   */
  public hasPlugin(pluginName: PluginName): boolean {
    return this.pluginContracts.has(pluginName) || this.deferredPlugins.has(pluginName);
  }

  /**
   * LAZY LOADING: Get the contract for a plugin, loading it if necessary
   */
  public async getPluginContract(pluginName: PluginName): Promise<unknown> {
    if (this.pluginContracts.has(pluginName)) {
      return this.pluginContracts.get(pluginName);
    }
    return this.loadPluginOnDemand(pluginName);
  }

  /**
   * LAZY LOADING: Get list of deferred (not yet loaded) plugins
   */
  public getDeferredPluginNames(): string[] {
    return [...this.deferredPlugins.keys()];
  }

  /**
   * Get a Map of all discovered UI plugins in topological order.
   */
  public uiPlugins() {
    const uiPluginNames = [...this.getTopologicallySortedPluginNames().keys()].filter(
      (pluginName) => this.plugins.get(pluginName)!.includesUiPlugin
    );
    const filterUiPlugins = (pluginName: string) => uiPluginNames.includes(pluginName);
    const publicPlugins = new Map<PluginName, DiscoveredPlugin>(
      uiPluginNames.map((pluginName) => {
        const plugin = this.plugins.get(pluginName)!;
        return [
          pluginName,
          {
            id: pluginName,
            type: plugin.manifest.type,
            configPath: plugin.manifest.configPath,
            requiredPlugins: plugin.manifest.requiredPlugins.filter(filterUiPlugins),
            optionalPlugins: plugin.manifest.optionalPlugins.filter(filterUiPlugins),
            runtimePluginDependencies:
              plugin.manifest.runtimePluginDependencies.filter(filterUiPlugins),
            requiredBundles: plugin.manifest.requiredBundles,
            enabledOnAnonymousPages: plugin.manifest.enabledOnAnonymousPages,
          },
        ];
      })
    );

    return publicPlugins;
  }

  private getTopologicallySortedPluginNames() {
    if (!this.sortedPluginNames) {
      this.sortedPluginNames = getTopologicallySortedPluginNames(this.plugins);
    }
    return this.sortedPluginNames;
  }
}

/**
 * Gets topologically sorted plugin names that are registered with the plugin system.
 * Ordering is possible if and only if the plugins graph has no directed cycles,
 * that is, if it is a directed acyclic graph (DAG). If plugins cannot be ordered
 * an error is thrown.
 *
 * Uses Kahn's Algorithm to sort the graph.
 */
const getTopologicallySortedPluginNames = (plugins: Map<PluginName, PluginWrapper>) => {
  // We clone plugins so we can remove handled nodes while we perform the
  // topological ordering. If the cloned graph is _not_ empty at the end, we
  // know we were not able to topologically order the graph. We exclude optional
  // dependencies that are not present in the plugins graph.
  const pluginsDependenciesGraph = new Map(
    [...plugins.entries()].map(([pluginName, plugin]) => {
      return [
        pluginName,
        new Set([
          ...plugin.requiredPlugins,
          ...plugin.optionalPlugins.filter((dependency) => plugins.has(dependency)),
        ]),
      ] as [PluginName, Set<PluginName>];
    })
  );

  // First, find a list of "start nodes" which have no outgoing edges. At least
  // one such node must exist in a non-empty acyclic graph.
  const pluginsWithAllDependenciesSorted = [...pluginsDependenciesGraph.keys()].filter(
    (pluginName) => pluginsDependenciesGraph.get(pluginName)!.size === 0
  );

  const sortedPluginNames = new Set<PluginName>();
  while (pluginsWithAllDependenciesSorted.length > 0) {
    const sortedPluginName = pluginsWithAllDependenciesSorted.pop()!;

    // We know this plugin has all its dependencies sorted, so we can remove it
    // and include into the final result.
    pluginsDependenciesGraph.delete(sortedPluginName);
    sortedPluginNames.add(sortedPluginName);

    // Go through the rest of the plugins and remove `sortedPluginName` from their
    // unsorted dependencies.
    for (const [pluginName, dependencies] of pluginsDependenciesGraph) {
      // If we managed delete `sortedPluginName` from dependencies let's check
      // whether it was the last one and we can mark plugin as sorted.
      if (dependencies.delete(sortedPluginName) && dependencies.size === 0) {
        pluginsWithAllDependenciesSorted.push(pluginName);
      }
    }
  }

  if (pluginsDependenciesGraph.size > 0) {
    // Identify circular dependencies
    let cyclePaths: string[] = [];

    try {
      const circularDependencies = findCircularDependencies(pluginsDependenciesGraph);

      cyclePaths = circularDependencies.map((cycle) => `\n  ${cycle.join(' -> ')} -> ${cycle[0]}`);
    } catch (e) {
      cyclePaths = [];
    }

    const edgesLeft = JSON.stringify([...pluginsDependenciesGraph.keys()]);

    throw new Error(
      `Topological ordering of plugins did not complete due to circular dependencies:` +
        `${
          cyclePaths.length > 0 ? `\n\nDetected circular dependencies:${cyclePaths.join('')}` : ''
        }` +
        `\n\nPlugins with cyclic or missing dependencies: ${edgesLeft}`
    );
  }

  return sortedPluginNames;
};

const buildReverseDependencyMap = (
  pluginMap: Map<PluginName, PluginWrapper>
): Map<PluginName, PluginName[]> => {
  const reverseMap = new Map<PluginName, PluginName[]>();
  for (const pluginName of pluginMap.keys()) {
    reverseMap.set(pluginName, []);
  }
  for (const [pluginName, pluginWrapper] of pluginMap.entries()) {
    const allDependencies = [...pluginWrapper.requiredPlugins, ...pluginWrapper.optionalPlugins];
    for (const dependency of allDependencies) {
      // necessary to evict non-present optional dependency
      if (pluginMap.has(dependency)) {
        reverseMap.get(dependency)!.push(pluginName);
      }
    }
    reverseMap.set(pluginName, []);
  }
  return reverseMap;
};

const buildPluginRuntimeDependencyMap = (
  pluginMap: Map<PluginName, PluginWrapper>
): Map<PluginName, Set<PluginName>> => {
  const runtimeDependencies = new Map<PluginName, Set<PluginName>>();
  for (const [pluginName, pluginWrapper] of pluginMap.entries()) {
    const pluginRuntimeDeps = new Set([
      ...pluginWrapper.optionalPlugins,
      ...pluginWrapper.requiredPlugins,
      ...pluginWrapper.runtimePluginDependencies,
    ]);
    runtimeDependencies.set(pluginName, pluginRuntimeDeps);
  }
  return runtimeDependencies;
};

/**
 * Finds all circular dependencies in the plugin graph
 * @param dependencyGraph Map of plugin names to their unresolved dependencies
 * @returns Array of circular dependency paths
 */
export const findCircularDependencies = (
  dependencyGraph: Map<PluginName, Set<PluginName>>
): PluginName[][] => {
  // Store found cycles as a set of stringified paths to avoid duplicates
  const cycleSet = new Set<string>();
  const cycles: PluginName[][] = [];

  // Find all cycles for each node in the graph
  for (const startNode of dependencyGraph.keys()) {
    // Track visited and recursion stack for this specific search
    const visited = new Set<PluginName>();
    const recursionStack = new Set<PluginName>();
    const path: PluginName[] = [];

    const dfs = (node: PluginName) => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const dependencies = dependencyGraph.get(node) || new Set<PluginName>();

      for (const dependency of dependencies) {
        // If we haven't visited this dependency yet, explore it
        if (!visited.has(dependency)) {
          dfs(dependency);
        }
        // If the dependency is in our current recursion path, we found a cycle
        else if (recursionStack.has(dependency)) {
          // Extract the cycle
          const cycleStartIndex = path.indexOf(dependency);
          if (cycleStartIndex !== -1) {
            const cycle = path.slice(cycleStartIndex);
            // Create a canonical representation by starting from alphabetically first node
            const normalizedCycle = normalizeCycle(cycle);

            // Add to cycles if not already seen
            const cycleKey = JSON.stringify(normalizedCycle);
            if (!cycleSet.has(cycleKey)) {
              cycleSet.add(cycleKey);
              cycles.push(cycle);
            }
          }
        }
      }

      // Backtrack
      path.pop();
      recursionStack.delete(node);
    };

    dfs(startNode);
  }

  return cycles;
};

/**
 * Normalizes a cycle by rotating it to start with the alphabetically first node
 * This helps identify duplicate cycles regardless of where we start traversing
 */
export const normalizeCycle = (cycle: PluginName[]): PluginName[] => {
  if (cycle.length <= 1) return cycle;
  if (new Set(cycle).size !== cycle.length) {
    throw new Error(`Cycle contains duplicate plugins: ${cycle}`);
  }

  // Find the index of the alphabetically first node
  let minIndex = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i].localeCompare(cycle[minIndex]) < 0) {
      minIndex = i;
    }
  }

  // Rotate the array to start with that node
  return [...cycle.slice(minIndex), ...cycle.slice(0, minIndex)];
};
