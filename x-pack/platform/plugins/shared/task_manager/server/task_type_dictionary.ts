/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ObjectType } from '@kbn/config-schema';
import type { Logger } from '@kbn/core/server';
import type { TaskDefinition, TaskRunCreatorFunction, TaskPriority, TaskCost } from './task';
import { taskDefinitionSchema } from './task';
import { CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE } from './constants';

/**
 * Types that are no longer registered and will be marked as unregistered
 */
export const REMOVED_TYPES: string[] = [
  // for testing
  'sampleTaskRemovedType',

  // deprecated in https://github.com/elastic/kibana/pull/121442
  'alerting:siem.signals',

  'search_sessions_monitor',
  'search_sessions_cleanup',
  'search_sessions_expire',

  'cleanup_failed_action_executions',
  'reports:monitor',

  // deprecated in https://github.com/elastic/kibana/pull/216916
  'obs-ai-assistant:knowledge-base-migration',

  // removed in https://github.com/elastic/kibana/pull/250218
  'logs-data-telemetry',
];

export const SHARED_CONCURRENCY_TASKS: string[][] = [
  // for testing
  ['sampleTaskSharedConcurrencyType1', 'sampleTaskSharedConcurrencyType2'],

  // reporting
  ['report:execute', 'report:execute-scheduled'],
];

/**
 * Defines a task which can be scheduled and run by the Kibana
 * task manager.
 */
export interface TaskRegisterDefinition {
  /**
   * A brief, human-friendly title for this task.
   */
  title?: string;
  /**
   * How long, in minutes or seconds, the system should wait for the task to complete
   * before it is considered to be timed out. (e.g. '5m', the default). If
   * the task takes longer than this, Kibana will send it a kill command and
   * the task will be re-attempted.
   */
  timeout?: string;
  /**
   * An optional definition of task priority. Tasks will be sorted by priority prior to claiming
   * so high priority tasks will always be claimed before normal priority, which will always be
   * claimed before low priority
   */
  priority?: TaskPriority;
  /**
   * An optional definition of the cost associated with running the task.
   */
  cost?: TaskCost;
  /**
   * An optional more detailed description of what this task does.
   */
  description?: string;

  /**
   * Creates an object that has a run function which performs the task's work,
   * and an optional cancel function which cancels the task.
   */
  createTaskRunner: TaskRunCreatorFunction;

  /**
   * Up to how many times the task should retry when it fails to run. This will
   * default to the global variable. The default value, if not specified, is 1.
   */
  maxAttempts?: number;
  /**
   * The maximum number tasks of this type that can be run concurrently per Kibana instance.
   * Setting this value will force Task Manager to poll for this task type separately from other task types
   * which can add significant load to the ES cluster, so please use this configuration only when absolutely necessary.
   * The default value, if not given, is 0.
   */
  maxConcurrency?: number;
  stateSchemaByVersion?: Record<
    number,
    {
      schema: ObjectType;
      up: (state: Record<string, unknown>) => Record<string, unknown>;
    }
  >;

  paramsSchema?: ObjectType;
}

/**
 * A mapping of task type id to the task definition.
 */
export type TaskDefinitionRegistry = Record<string, TaskRegisterDefinition>;

// LAZY LOADING: Type for the plugin loader function
export type PluginLoaderFn = (pluginName: string) => Promise<unknown>;

// LAZY LOADING: Static registry mapping task types to owner plugins
// This is populated at startup from @kbn/task-definitions package
let TASK_TO_PLUGIN_REGISTRY: Map<string, string> = new Map();

export class TaskTypeDictionary {
  private definitions = new Map<string, TaskDefinition>();
  private logger: Logger;

  // LAZY LOADING: Plugin loader function to load plugins on-demand
  private pluginLoader?: PluginLoaderFn;

  // LAZY LOADING: Track which plugins are currently being loaded to prevent race conditions
  private loadingPlugins = new Set<string>();

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * LAZY LOADING: Set the plugin loader function for on-demand plugin loading
   */
  public setPluginLoader(loader: PluginLoaderFn) {
    this.pluginLoader = loader;
    this.logger.info(`[LAZY_POC] Plugin loader set for lazy task loading`);
  }

  /**
   * LAZY LOADING: Initialize the task-to-plugin registry from @kbn/task-definitions
   */
  public initializeTaskRegistry() {
    try {
      // Dynamic import to avoid circular dependencies
      const taskDefs = require('@kbn/task-definitions');
      if (taskDefs.TASK_METADATA_REGISTRY) {
        const registry = taskDefs.TASK_METADATA_REGISTRY;
        for (const [taskType, metadata] of Object.entries(registry)) {
          const ownerPlugin = (metadata as { ownerPlugin: string }).ownerPlugin;
          TASK_TO_PLUGIN_REGISTRY.set(taskType, ownerPlugin);
        }
        this.logger.info(
          `[LAZY_POC] Initialized task registry with ${TASK_TO_PLUGIN_REGISTRY.size} task types`
        );
      }
    } catch (e) {
      this.logger.warn(`[LAZY_POC] Could not load @kbn/task-definitions: ${e.message}`);
    }
  }

  /**
   * LAZY LOADING: Get the owner plugin for a task type from the static registry
   */
  public getOwnerPlugin(taskType: string): string | undefined {
    return TASK_TO_PLUGIN_REGISTRY.get(taskType);
  }

  /**
   * LAZY LOADING: Ensure the plugin that owns this task type is loaded
   * Returns true if the task definition is now available, false otherwise
   */
  public async ensureTaskPluginLoaded(taskType: string): Promise<boolean> {
    // Already have the definition?
    if (this.definitions.has(taskType)) {
      return true;
    }

    // No plugin loader? Can't do lazy loading
    if (!this.pluginLoader) {
      this.logger.warn(`[LAZY_POC] No plugin loader set, cannot lazy load for "${taskType}"`);
      return false;
    }

    // Look up owner plugin from static registry
    const ownerPlugin = TASK_TO_PLUGIN_REGISTRY.get(taskType);
    if (!ownerPlugin) {
      this.logger.warn(`[LAZY_POC] Unknown task type "${taskType}" - not in registry`);
      return false;
    }

    // Prevent duplicate loading
    if (this.loadingPlugins.has(ownerPlugin)) {
      this.logger.debug(`[LAZY_POC] Plugin "${ownerPlugin}" already loading, waiting...`);
      // Wait a bit and check again
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.definitions.has(taskType);
    }

    try {
      this.loadingPlugins.add(ownerPlugin);
      const startTime = Date.now();
      this.logger.info(`[LAZY_POC] Loading plugin "${ownerPlugin}" for task "${taskType}"`);

      await this.pluginLoader(ownerPlugin);

      const duration = Date.now() - startTime;

      // Check if the task was registered after loading
      if (this.definitions.has(taskType)) {
        this.logger.info(
          `[LAZY_POC] Successfully loaded plugin "${ownerPlugin}" for task "${taskType}" in ${duration}ms`
        );
        return true;
      } else {
        this.logger.warn(
          `[LAZY_POC] Plugin "${ownerPlugin}" loaded but task "${taskType}" still not registered`
        );
        return false;
      }
    } catch (error) {
      this.logger.error(
        `[LAZY_POC] Failed to load plugin "${ownerPlugin}" for task "${taskType}": ${error}`
      );
      return false;
    } finally {
      this.loadingPlugins.delete(ownerPlugin);
    }
  }

  /**
   * LAZY LOADING: Async version of get() that ensures the plugin is loaded first
   */
  public async getAsync(taskType: string): Promise<TaskDefinition | undefined> {
    // Try to get the definition directly first
    let definition = this.definitions.get(taskType);
    if (definition) {
      return definition;
    }

    // Try to lazy load the plugin
    const loaded = await this.ensureTaskPluginLoaded(taskType);
    if (loaded) {
      return this.definitions.get(taskType);
    }

    return undefined;
  }

  /**
   * Extract the caller plugin name from the stack trace.
   * We need to find the FIRST plugin in the call stack that is NOT task_manager.
   */
  private extractCallerPlugin(): string {
    // Use Error.prepareStackTrace to get structured stack frames
    const originalPrepare = Error.prepareStackTrace;
    let callerPlugin = 'unknown';

    Error.prepareStackTrace = (err, stack) => {
      // Find the first plugin in the stack that is NOT task_manager
      for (const frame of stack) {
        const fileName = frame.getFileName() || '';

        // Skip node internals and node_modules
        if (fileName.includes('node:') || fileName.includes('node_modules') || !fileName) {
          continue;
        }

        // Extract plugin name from path
        // Pattern: /plugins/shared/PLUGIN_NAME/ or /plugins/private/PLUGIN_NAME/ or /solutions/*/plugins/PLUGIN_NAME/
        const match = fileName.match(
          /\/(?:plugins\/(?:shared|private)\/|solutions\/[^/]+\/plugins\/)([^/]+)\//
        );

        if (match) {
          const pluginName = match[1];
          // Return the FIRST plugin that is NOT task_manager
          if (pluginName !== 'task_manager') {
            callerPlugin = pluginName;
            break;
          }
        }
      }
      return '';
    };

    // Trigger stack trace capture
    const err = new Error();
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    err.stack;

    Error.prepareStackTrace = originalPrepare;

    return callerPlugin;
  }

  [Symbol.iterator]() {
    return this.definitions.entries();
  }

  public getAllTypes() {
    return [...this.definitions.keys()];
  }

  public getAllDefinitions() {
    return [...this.definitions.values()];
  }

  public has(type: string) {
    return this.definitions.has(type);
  }

  public size() {
    return this.definitions.size;
  }

  public get(type: string): TaskDefinition | undefined {
    return this.definitions.get(type);
  }

  public ensureHas(type: string) {
    if (!this.has(type)) {
      throw new Error(
        `Unsupported task type "${type}". Supported types are ${this.getAllTypes().join(', ')}`
      );
    }
  }

  /**
   * Method for allowing consumers to register task definitions into the system.
   * @param taskDefinitions - The Kibana task definitions dictionary
   */
  public registerTaskDefinitions(taskDefinitions: TaskDefinitionRegistry) {
    const taskTypesToRegister = Object.keys(taskDefinitions);

    // [TASK_REGISTRY_SCAN] Extract caller plugin from stack trace for lazy loading PoC
    const callerPlugin = this.extractCallerPlugin();
    for (const taskType of taskTypesToRegister) {
      const definition = taskDefinitions[taskType];
      this.logger.info(
        `[TASK_REGISTRY_SCAN] taskType="${taskType}" ownerPlugin="${callerPlugin}" title="${definition.title || 'N/A'}"`
      );
    }
    const duplicate = taskTypesToRegister.find((type) => this.definitions.has(type));
    if (duplicate) {
      throw new Error(`Task ${duplicate} is already defined!`);
    }

    const invalidTaskType = taskTypesToRegister.find((type) => type.includes(','));
    if (invalidTaskType) {
      throw new Error(`Task type "${invalidTaskType}" cannot contain a comma.`);
    }

    const removed = taskTypesToRegister.find((type) => REMOVED_TYPES.indexOf(type) >= 0);
    if (removed) {
      throw new Error(`Task ${removed} has been removed from registration!`);
    }

    for (const taskType of taskTypesToRegister) {
      if (taskDefinitions[taskType].maxConcurrency !== undefined) {
        if (!CONCURRENCY_ALLOW_LIST_BY_TASK_TYPE.includes(taskType)) {
          // maxConcurrency is designed to limit how many tasks of the same type a single Kibana
          // instance should run at a time. Meaning if you have 8 Kibanas running, you will still
          // see up to 8 tasks running at a time but one per Kibana instance. This is helpful for
          // reporting purposes but not for many other cases and are better off not setting this value.
          throw new Error(`maxConcurrency setting isn't allowed for task type: ${taskType}`);
        }

        // if this task type shares concurrency with another task type and both have been
        // registered, throw an error if their maxConcurrency values are different
        this.verifySharedConcurrencyAndCost(
          taskType,
          taskDefinitions[taskType].maxConcurrency!,
          taskDefinitions[taskType].cost
        );
      }
    }

    try {
      for (const definition of sanitizeTaskDefinitions(taskDefinitions)) {
        this.definitions.set(definition.type, definition);
      }
    } catch (e) {
      this.logger.error(`Could not sanitize task definitions: ${e.message}`);
    }
  }

  private verifySharedConcurrencyAndCost(
    taskType: string,
    maxConcurrency: number,
    cost?: TaskCost
  ) {
    const shared = sharedConcurrencyTaskTypes(taskType);

    if (shared) {
      const otherTaskTypes: string[] = shared.filter((type) => type !== taskType);

      for (const otherTaskType of otherTaskTypes) {
        const otherTaskDef = this.definitions.get(otherTaskType);
        if (otherTaskDef && otherTaskDef.maxConcurrency !== maxConcurrency) {
          throw new Error(
            `Task type "${taskType}" shares concurrency limits with ${otherTaskType} but has a different maxConcurrency.`
          );
        }
        if (otherTaskDef && otherTaskDef.cost !== cost) {
          throw new Error(
            `Task type "${taskType}" shares concurrency limits with ${otherTaskType} but has a different cost.`
          );
        }
      }
    }
  }
}

/**
 * Sanitizes the system's task definitions. Task definitions have optional properties, and
 * this ensures they all are given a reasonable default.
 *
 * @param taskDefinitions - The Kibana task definitions dictionary
 */
export function sanitizeTaskDefinitions(taskDefinitions: TaskDefinitionRegistry): TaskDefinition[] {
  return Object.entries(taskDefinitions).map(([type, rawDefinition]) => {
    return taskDefinitionSchema.validate({ type, ...rawDefinition }) as TaskDefinition;
  });
}

export function sharedConcurrencyTaskTypes(taskType: string) {
  return SHARED_CONCURRENCY_TASKS.find((tasks: string[]) => tasks.includes(taskType));
}
