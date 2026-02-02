/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Plugins that are ESSENTIAL for Task Manager role.
 * These must be loaded at startup regardless of lazy loading configuration.
 *
 * Criteria for being essential:
 * 1. Core infrastructure (licensing, security, taskManager itself)
 * 2. Own background tasks that run regularly
 * 3. Required dependencies of task-owning plugins
 */
export const ESSENTIAL_PLUGINS_FOR_BACKGROUND_TASKS = new Set([
  // Core infrastructure - always needed
  'licensing',
  'security',
  'encryptedSavedObjects',
  'taskManager',
  'eventLog',
  'features',
  'spaces',

  // Task-owning plugins (from task registry scan)
  'actions',
  'alerting',
  'fleet',
  'cases',
  'security_solution', // maps to securitySolution
  'securitySolution',
  'ml',
  'reporting',
  'synthetics',
  'apm',
  'slo',
  'osquery',
  'streams',
  'entity_store', // maps to entityStore
  'entityStore',
  'maintenance_windows', // maps to maintenanceWindows
  'maintenanceWindows',
  'cloud_security_posture', // maps to cloudSecurityPosture
  'cloudSecurityPosture',
  'workflows_execution_engine', // maps to workflowsExecutionEngine
  'workflowsExecutionEngine',
  'sample_data_ingest', // maps to sampleDataIngest
  'sampleDataIngest',
  'ai_infra', // maps to aiInfra or productDocBase
  'productDocBase',
  'indices_metadata', // maps to indicesMetadata
  'indicesMetadata',
  'share',
  'dashboard',
  'content_connectors', // maps to contentConnectors
  'contentConnectors',

  // Required dependencies of task-owning plugins
  'data',
  'dataViews',
  'savedObjects',
  'elasticsearch',
  'http',
  'usageCollection',
  'telemetry',
  'files',
  'notifications',
  'lists', // security_solution dependency
  'ruleRegistry', // alerting dependency
  'triggersActionsUi', // alerting UI (may be needed for some operations)
  'stackConnectors', // actions dependency

  // Dependencies of dataViews plugin
  'expressions',
  'fieldFormats',
  'contentManagement',

  // Common infrastructure plugins
  'kibanaUsageCollection',
  'telemetryCollectionManager',
  'telemetryCollectionXpack',
  'cloud',
  'monitoringCollection',

  // Additional dependencies discovered during testing
  'esUiShared',
  'customIntegrations',
  'home',
  'management',
  'savedObjectsFinder',
  'embeddable',
  'presentationUtil',
  'kql',
  'charts',
  'navigation',
  'inference',
  'llmTasks',
  'genAiSettings',
  'aiAssistantManagementSelection',
  'advancedSettings',

  // Visualization and expression plugins needed by data
  'visualizations',
  'expressionTagcloud',
  'expressionPartitionVis',
  'expressionMetricVis',
  'expressionLegacyMetricVis',
  'expressionHeatmap',
  'expressionGauge',
  'expressionXY',
  'eventAnnotation',
]);

/**
 * Check if a plugin is essential for the background_tasks role.
 */
export function isEssentialForBackgroundTasks(pluginName: string): boolean {
  return ESSENTIAL_PLUGINS_FOR_BACKGROUND_TASKS.has(pluginName);
}

/**
 * Plugins that can be completely skipped for background_tasks role.
 * These are UI-only plugins that:
 * 1. Have no background tasks registered
 * 2. Are not required dependencies of task-owning plugins
 * 3. Safe to skip without breaking Kibana startup
 * 
 * VERY CONSERVATIVE LIST - only skip plugins we're 100% confident are safe
 * Note: Many "UI" plugins are actually dependencies of task-owning plugins
 */
export const SKIP_FOR_BACKGROUND_TASKS = new Set([
  // Dev tools - definitely not needed for background tasks
  'devTools',
  'console',
  'searchprofiler',
  'painlessLab',
  'grokdebugger',

  // Search UI plugins - no background tasks, no dependencies
  'searchHomepage',
  'searchPlayground',
  'searchNotebooks',
  'searchGettingStarted',

  // Enterprise search UI
  'enterpriseSearch',

  // Vis type plugins (pure UI renderers, no server dependencies)
  'visTypePie',
  'visTypeGauge',
  'visTypeXy',
  'visTypeVislib',
  'visTypeVega',
  'visTypeTimelion',
  'visTypeTagcloud',
  'visTypeTable',
  'visTypeMetric',
  'visTypeHeatmap',
  'visTypeMarkdown',
  'visTypeTimeseries',
  'inputControlVis',
]);

/**
 * Check if a plugin can be skipped for background_tasks role.
 */
export function canSkipForBackgroundTasks(pluginName: string): boolean {
  return SKIP_FOR_BACKGROUND_TASKS.has(pluginName);
}
