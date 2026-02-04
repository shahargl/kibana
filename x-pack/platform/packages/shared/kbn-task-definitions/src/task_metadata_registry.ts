/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Static metadata for a task type.
 * This allows Task Manager to know about tasks without loading their plugins.
 */
export interface TaskMetadata {
  /** The plugin that owns/registers this task type */
  ownerPlugin: string;
  /** Human-readable title for the task */
  title: string;
}

/**
 * Static registry of all task types and their owner plugins.
 * This allows Task Manager to claim tasks without loading all plugins at startup.
 *
 * AUTO-GENERATED from runtime scan - see scripts/generate_task_registry.js
 */
export const TASK_METADATA_REGISTRY: Record<string, TaskMetadata> = {
  // Task Manager internal tasks
  'task_manager:delete_inactive_background_task_nodes': { ownerPlugin: 'task_manager', title: 'Remove inactive background task nodes' },
  'task_manager:invalidate_api_keys': { ownerPlugin: 'task_manager', title: 'Invalidate task manager API keys' },
  'task_manager:mark_removed_tasks_as_unrecognized': { ownerPlugin: 'task_manager', title: 'Mark removed tasks as unrecognized' },

  // Sample Data Ingest
  'SampleDataIngest:InstallSampleData': { ownerPlugin: 'sample_data_ingest', title: 'Install sample data' },

  // AI Infra / Product Doc Base
  'ProductDocBase:EnsureUpToDate': { ownerPlugin: 'ai_infra', title: 'Ensure product documentation up to date task' },
  'ProductDocBase:EnsureSecurityLabsUpToDate': { ownerPlugin: 'ai_infra', title: 'Ensure Security Labs up to date task' },
  'ProductDocBase:InstallAll': { ownerPlugin: 'ai_infra', title: 'Install all product documentation artifacts' },
  'ProductDocBase:UninstallAll': { ownerPlugin: 'ai_infra', title: 'Uninstall all product documentation artifacts' },

  // Indices Metadata
  'IndicesMetadata:IndicesMetadataTask': { ownerPlugin: 'indices_metadata', title: 'Metrics Data Access - Indices Metadata Task' },

  // Share
  'unusedUrlsCleanupTask': { ownerPlugin: 'share', title: 'Unused URLs Cleanup' },

  // Security
  'session_cleanup': { ownerPlugin: 'security', title: 'Cleanup expired or invalid user sessions' },

  // Entity Store
  'entity_store:v2:extract_entity_task:user': { ownerPlugin: 'entity_store', title: 'Entity Store - Execute Entity Task' },
  'entity_store:v2:extract_entity_task:host': { ownerPlugin: 'entity_store', title: 'Entity Store - Execute Entity Task' },
  'entity_store:v2:extract_entity_task:service': { ownerPlugin: 'entity_store', title: 'Entity Store - Execute Entity Task' },
  'entity_store:v2:extract_entity_task:generic': { ownerPlugin: 'entity_store', title: 'Entity Store - Execute Entity Task' },

  // Actions (connectors)
  'actions_telemetry': { ownerPlugin: 'actions', title: 'Actions usage fetch task' },
  'actions:connector_usage_reporting': { ownerPlugin: 'actions', title: 'Connector usage reporting task' },
  'actions:.email': { ownerPlugin: 'actions', title: 'Email' },
  'actions:.index': { ownerPlugin: 'actions', title: 'Index' },
  'actions:.pagerduty': { ownerPlugin: 'actions', title: 'PagerDuty' },
  'actions:.swimlane': { ownerPlugin: 'actions', title: 'Swimlane' },
  'actions:.server-log': { ownerPlugin: 'actions', title: 'Server log' },
  'actions:.slack': { ownerPlugin: 'actions', title: 'Slack' },
  'actions:.slack_api': { ownerPlugin: 'actions', title: 'Slack API' },
  'actions:.webhook': { ownerPlugin: 'actions', title: 'Webhook' },
  'actions:.cases-webhook': { ownerPlugin: 'actions', title: 'Webhook - Case Management' },
  'actions:.xmatters': { ownerPlugin: 'actions', title: 'xMatters' },
  'actions:.servicenow': { ownerPlugin: 'actions', title: 'ServiceNow ITSM' },
  'actions:.servicenow-sir': { ownerPlugin: 'actions', title: 'ServiceNow SecOps' },
  'actions:.servicenow-itom': { ownerPlugin: 'actions', title: 'ServiceNow ITOM' },
  'actions:.jira': { ownerPlugin: 'actions', title: 'Jira' },
  'actions:.teams': { ownerPlugin: 'actions', title: 'Microsoft Teams' },
  'actions:.torq': { ownerPlugin: 'actions', title: 'Torq' },
  'actions:.opsgenie': { ownerPlugin: 'actions', title: 'Opsgenie' },
  'actions:.jira-service-management': { ownerPlugin: 'actions', title: 'Jira Service Management' },
  'actions:.tines': { ownerPlugin: 'actions', title: 'Tines' },
  'actions:.gen-ai': { ownerPlugin: 'actions', title: 'OpenAI' },
  'actions:.bedrock': { ownerPlugin: 'actions', title: 'Amazon Bedrock' },
  'actions:.gemini': { ownerPlugin: 'actions', title: 'Google Gemini' },
  'actions:.d3security': { ownerPlugin: 'actions', title: 'D3 Security' },
  'actions:.resilient': { ownerPlugin: 'actions', title: 'IBM Resilient' },
  'actions:.thehive': { ownerPlugin: 'actions', title: 'TheHive' },
  'actions:.xsoar': { ownerPlugin: 'actions', title: 'XSOAR' },
  'actions:.mcp': { ownerPlugin: 'actions', title: 'MCP' },
  'actions:.sentinelone': { ownerPlugin: 'actions', title: 'Sentinel One' },
  'actions:.crowdstrike': { ownerPlugin: 'actions', title: 'CrowdStrike' },
  'actions:.inference': { ownerPlugin: 'actions', title: 'AI Connector' },
  'actions:.microsoft_defender_endpoint': { ownerPlugin: 'actions', title: 'Microsoft Defender for Endpoint' },
  'actions:.abuseipdb': { ownerPlugin: 'actions', title: 'AbuseIPDB' },
  'actions:.alienvault-otx': { ownerPlugin: 'actions', title: 'AlienVault OTX' },
  'actions:.brave-search': { ownerPlugin: 'actions', title: 'Brave Search' },
  'actions:.github': { ownerPlugin: 'actions', title: 'Github' },
  'actions:.greynoise': { ownerPlugin: 'actions', title: 'GreyNoise' },
  'actions:.notion': { ownerPlugin: 'actions', title: 'Notion' },
  'actions:.shodan': { ownerPlugin: 'actions', title: 'Shodan' },
  'actions:.urlvoid': { ownerPlugin: 'actions', title: 'URLVoid' },
  'actions:.virustotal': { ownerPlugin: 'actions', title: 'VirusTotal' },
  'actions:.jina': { ownerPlugin: 'actions', title: 'Jina Reader' },
  'actions:.sharepoint-online': { ownerPlugin: 'actions', title: 'SharePoint Online' },
  'actions:.workflows': { ownerPlugin: 'actions', title: 'Workflows' },
  'actions:.cases': { ownerPlugin: 'actions', title: 'Cases' },
  'actions:.observability-ai-assistant': { ownerPlugin: 'actions', title: 'Observability AI Assistant' },

  // Workflows Execution Engine
  'workflow:run': { ownerPlugin: 'workflowsExecutionEngine', title: 'Run Workflow' },
  'workflow:resume': { ownerPlugin: 'workflowsExecutionEngine', title: 'Resume Workflow' },
  'workflow:scheduled': { ownerPlugin: 'workflowsExecutionEngine', title: 'Scheduled Workflow Execution' },

  // Maintenance Windows
  'maintenance-window:generate-events': { ownerPlugin: 'maintenance_windows', title: 'Maintenance window events generator task' },

  // Alerting
  'ad_hoc_run-backfill': { ownerPlugin: 'alerting', title: 'Alerting Backfill Rule Run' },
  'alert-deletion': { ownerPlugin: 'alerting', title: 'Alert deletion task' },
  'alerting_telemetry': { ownerPlugin: 'alerting', title: 'Alerting usage fetch task' },
  'alerts_invalidate_api_keys': { ownerPlugin: 'alerting', title: 'Invalidate alert API Keys' },
  'alerting_health_check': { ownerPlugin: 'alerting', title: 'Alerting framework health check task' },
  'gap-auto-fill-scheduler-task': { ownerPlugin: 'alerting', title: 'Gap Auto Fill Scheduler' },
  'alerting:.index-threshold': { ownerPlugin: 'alerting', title: 'Index threshold' },
  'alerting:.geo-containment': { ownerPlugin: 'alerting', title: 'Tracking containment' },
  'alerting:.es-query': { ownerPlugin: 'alerting', title: 'Elasticsearch query' },
  'alerting:transform_health': { ownerPlugin: 'alerting', title: 'Transform health' },
  'alerting:xpack.ml.anomaly_detection_alert': { ownerPlugin: 'alerting', title: 'Anomaly detection' },
  'alerting:xpack.ml.anomaly_detection_jobs_health': { ownerPlugin: 'alerting', title: 'Anomaly detection jobs health' },
  'alerting:attack-discovery': { ownerPlugin: 'alerting', title: 'Attack Discovery Schedule' },
  'alerting:security.attack_discovery.data_generator': { ownerPlugin: 'alerting', title: 'Attack Discovery Data Generator' },
  'alerting:streams.rules.esql': { ownerPlugin: 'alerting', title: 'ES|QL Rule' },
  'alerting:observability.rules.custom_threshold': { ownerPlugin: 'alerting', title: 'Custom threshold' },
  'alerting:slo.rules.burnRate': { ownerPlugin: 'alerting', title: 'SLO burn rate' },
  'alerting:xpack.uptime.alerts.monitorStatus': { ownerPlugin: 'alerting', title: 'Uptime monitor status' },
  'alerting:xpack.uptime.alerts.tlsCertificate': { ownerPlugin: 'alerting', title: 'Uptime TLS' },
  'alerting:xpack.uptime.alerts.durationAnomaly': { ownerPlugin: 'alerting', title: 'Uptime Duration Anomaly' },
  'alerting:xpack.uptime.alerts.tls': { ownerPlugin: 'alerting', title: 'Uptime TLS (Legacy)' },
  'alerting:xpack.synthetics.alerts.monitorStatus': { ownerPlugin: 'alerting', title: 'Synthetics monitor status' },
  'alerting:xpack.synthetics.alerts.tls': { ownerPlugin: 'alerting', title: 'Synthetics TLS certificate' },
  'alerting:apm.transaction_duration': { ownerPlugin: 'alerting', title: 'Latency threshold' },
  'alerting:apm.anomaly': { ownerPlugin: 'alerting', title: 'APM Anomaly' },
  'alerting:apm.error_rate': { ownerPlugin: 'alerting', title: 'Error count threshold' },
  'alerting:apm.transaction_error_rate': { ownerPlugin: 'alerting', title: 'Failed transaction rate threshold' },
  'alerting:siem.eqlRule': { ownerPlugin: 'alerting', title: 'Event Correlation Rule' },
  'alerting:siem.esqlRule': { ownerPlugin: 'alerting', title: 'ES|QL Rule' },
  'alerting:siem.savedQueryRule': { ownerPlugin: 'alerting', title: 'Saved Query Rule' },
  'alerting:siem.indicatorRule': { ownerPlugin: 'alerting', title: 'Indicator Match Rule' },
  'alerting:siem.mlRule': { ownerPlugin: 'alerting', title: 'Machine Learning Rule' },
  'alerting:siem.queryRule': { ownerPlugin: 'alerting', title: 'Custom Query Rule' },
  'alerting:siem.thresholdRule': { ownerPlugin: 'alerting', title: 'Threshold Rule' },
  'alerting:siem.newTermsRule': { ownerPlugin: 'alerting', title: 'New Terms Rule' },
  'alerting:siem.notifications': { ownerPlugin: 'alerting', title: 'Security Solution notification (Legacy)' },
  'alerting:logs.alert.document.count': { ownerPlugin: 'alerting', title: 'Log threshold' },
  'alerting:metrics.alert.inventory.threshold': { ownerPlugin: 'alerting', title: 'Inventory' },
  'alerting:metrics.alert.threshold': { ownerPlugin: 'alerting', title: 'Metric threshold' },
  'alerting:datasetQuality.degradedDocs': { ownerPlugin: 'alerting', title: 'Degraded docs' },
  'alerting:monitoring_alert_cluster_health': { ownerPlugin: 'alerting', title: 'Cluster health' },
  'alerting:monitoring_alert_license_expiration': { ownerPlugin: 'alerting', title: 'License expiration' },
  'alerting:monitoring_alert_cpu_usage': { ownerPlugin: 'alerting', title: 'CPU Usage' },
  'alerting:monitoring_alert_missing_monitoring_data': { ownerPlugin: 'alerting', title: 'Missing monitoring data' },
  'alerting:monitoring_alert_disk_usage': { ownerPlugin: 'alerting', title: 'Disk Usage' },
  'alerting:monitoring_alert_thread_pool_search_rejections': { ownerPlugin: 'alerting', title: 'Thread pool search rejections' },
  'alerting:monitoring_alert_thread_pool_write_rejections': { ownerPlugin: 'alerting', title: 'Thread pool write rejections' },
  'alerting:monitoring_alert_jvm_memory_usage': { ownerPlugin: 'alerting', title: 'Memory Usage (JVM)' },
  'alerting:monitoring_alert_nodes_changed': { ownerPlugin: 'alerting', title: 'Nodes changed' },
  'alerting:monitoring_alert_logstash_version_mismatch': { ownerPlugin: 'alerting', title: 'Logstash version mismatch' },
  'alerting:monitoring_alert_kibana_version_mismatch': { ownerPlugin: 'alerting', title: 'Kibana version mismatch' },
  'alerting:monitoring_alert_elasticsearch_version_mismatch': { ownerPlugin: 'alerting', title: 'Elasticsearch version mismatch' },
  'alerting:monitoring_ccr_read_exceptions': { ownerPlugin: 'alerting', title: 'CCR read exceptions' },
  'alerting:monitoring_shard_size': { ownerPlugin: 'alerting', title: 'Shard size' },

  // Dashboard
  'dashboard_telemetry': { ownerPlugin: 'dashboard', title: 'Dashboard telemetry collection task' },

  // Cases
  'cai:cases_analytics_index_backfill': { ownerPlugin: 'cases', title: 'Backfill cases analytics indexes' },
  'cai:cases_analytics_index_scheduler': { ownerPlugin: 'cases', title: 'Schedules cases analytics synchronization tasks' },
  'cai:cases_analytics_index_synchronization': { ownerPlugin: 'cases', title: 'Synchronization for the cases analytics index' },
  'cases-telemetry-task': { ownerPlugin: 'cases', title: 'Collect Cases telemetry data' },
  'cases_incremental_id_assignment': { ownerPlugin: 'cases', title: 'Cases Numerical ID assignment' },

  // ML
  'ML:saved-objects-sync': { ownerPlugin: 'ml', title: 'ML saved object sync' },

  // Reporting
  'report:execute': { ownerPlugin: 'reporting', title: 'Reporting: execute job' },
  'report:execute-scheduled': { ownerPlugin: 'reporting', title: 'Reporting: execute scheduled job' },
  'reporting_telemetry': { ownerPlugin: 'reporting', title: 'Reporting snapshot telemetry fetch task' },

  // Streams
  'streams_description_generation': { ownerPlugin: 'streams', title: 'Streams description generation' },
  'streams_systems_identification': { ownerPlugin: 'streams', title: 'Streams systems identification' },
  'streams_significant_events_queries_generation': { ownerPlugin: 'streams', title: 'Streams significant events queries generation' },
  'streams_features_identification': { ownerPlugin: 'streams', title: 'Streams features identification' },
  'streams_insights_discovery': { ownerPlugin: 'streams', title: 'Streams insights discovery' },

  // SLO
  'SLO:ORPHAN_SUMMARIES-CLEANUP-TASK': { ownerPlugin: 'slo', title: 'SLO orphan summary cleanup task' },
  'slo:temp-summary-cleanup-task': { ownerPlugin: 'slo', title: 'SLO temp summary cleanup task' },
  'slo:stale-instances-cleanup-task': { ownerPlugin: 'slo', title: 'Stale SLO instances cleanup task' },
  'slo:bulk-delete-task': { ownerPlugin: 'slo', title: 'SLO bulk delete' },

  // Fleet
  'Fleet-Usage-Sender': { ownerPlugin: 'fleet', title: 'Fleet Usage Sender' },
  'Fleet-Usage-Logger': { ownerPlugin: 'fleet', title: 'Fleet Usage Logger' },
  'Fleet-Metrics-Task': { ownerPlugin: 'fleet', title: 'Fleet Metrics Task' },
  'fleet:setup:upgrade_managed_package_policies': { ownerPlugin: 'fleet', title: 'Fleet Setup Upgrade managed package policies' },
  'fleet:deploy_agent_policies': { ownerPlugin: 'fleet', title: 'Fleet Deploy policies' },
  'fleet:bump_agent_policies': { ownerPlugin: 'fleet', title: 'Fleet Bump policies' },
  'fleet:packages-bulk-operations': { ownerPlugin: 'fleet', title: 'Fleet packages bulk operations' },
  'fleet:setup': { ownerPlugin: 'fleet', title: 'Fleet setup operations' },
  'fleet:agentless-deployment-sync-task': { ownerPlugin: 'fleet', title: 'Fleet agentless deployment sync Task' },
  'fleet:reindex_integration_knowledge': { ownerPlugin: 'fleet', title: 'Fleet Reindex integration knowledge' },
  'fleet:reassign_agents_to_version_specific_policies': { ownerPlugin: 'fleet', title: 'Fleet reassign agents to version specific policies' },
  'fleet:reassign_action:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:unenroll_action:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:upgrade_action:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:update_agent_tags:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:request_diagnostics:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:migrate_action:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:privilege_level_change:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:rollback_action:retry': { ownerPlugin: 'fleet', title: 'Bulk Action Retry' },
  'fleet:check-deleted-files-task': { ownerPlugin: 'fleet', title: 'Fleet Deleted Files Periodic Tasks' },
  'fleet:unenroll-inactive-agents-task': { ownerPlugin: 'fleet', title: 'Fleet Unenroll Inactive Agent Task' },
  'fleet:delete-unenrolled-agents-task': { ownerPlugin: 'fleet', title: 'Fleet Delete Unenrolled Agents Task' },
  'fleet:upgrade-agentless-deployments-task': { ownerPlugin: 'fleet', title: 'Fleet upgrade agentless deployments Task' },
  'fleet:sync-integrations-task': { ownerPlugin: 'fleet', title: 'Fleet Sync Integrations Task' },
  'fleet:automatic-agent-upgrade-task': { ownerPlugin: 'fleet', title: 'Fleet Automatic agent upgrades' },
  'fleet:auto-install-content-packages-task': { ownerPlugin: 'fleet', title: 'Fleet Auto Install Content Packages Task' },
  'fleet:agent-status-change-task': { ownerPlugin: 'fleet', title: 'Fleet Agent Status Change Task' },
  'fleet:policy-revisions-cleanup-task': { ownerPlugin: 'fleet', title: 'Fleet Policy Revisions Cleanup Task' },

  // Cloud Security Posture
  'cloud_security_posture-stats_task': { ownerPlugin: 'cloud_security_posture', title: 'Aggregate latest findings index for score calculation' },

  // Synthetics
  'UPTIME:SyntheticsService:Sync-Saved-Monitor-Objects': { ownerPlugin: 'synthetics', title: 'Synthetics Service - Sync Saved Monitors' },
  'Synthetics:Clean-Up-Package-Policies': { ownerPlugin: 'synthetics', title: 'Synthetics Plugin Clean Up Task' },
  'Synthetics:Sync-Private-Location-Monitors': { ownerPlugin: 'synthetics', title: 'Synthetics Sync Global Params Task' },
  'Synthetics:Sync-Global-Params-Private-Locations': { ownerPlugin: 'synthetics', title: 'Synthetics Sync Global Params Task' },

  // APM
  'apm-telemetry-task': { ownerPlugin: 'apm', title: 'Collect APM usage' },
  'apm-source-map-migration-task': { ownerPlugin: 'apm', title: 'Migrate fleet source map artifacts' },

  // Osquery
  'osquery:telemetry-packs': { ownerPlugin: 'osquery', title: 'Osquery Packs Telemetry' },
  'osquery:telemetry-saved-queries': { ownerPlugin: 'osquery', title: 'Osquery Saved Queries Telemetry' },
  'osquery:telemetry-configs': { ownerPlugin: 'osquery', title: 'Osquery Configs Telemetry' },

  // Security Solution
  'risk_engine:risk_scoring': { ownerPlugin: 'security_solution', title: 'Entity Analytics Risk Engine - Risk Scoring Task' },
  'entity_store:field_retention:enrichment': { ownerPlugin: 'security_solution', title: 'Entity Analytics Entity Store - Execute Enrich Policy Task' },
  'entity_store:data_view:refresh': { ownerPlugin: 'security_solution', title: 'Entity Analytics Entity Store - Execute Data View Refresh Task' },
  'entity_store:snapshot': { ownerPlugin: 'security_solution', title: 'Entity Store snapshot task' },
  'entity_store:health': { ownerPlugin: 'security_solution', title: 'Entity Store - Execute Health Checks Task' },
  'entity_analytics:monitoring:privileges:engine': { ownerPlugin: 'security_solution', title: 'Entity Analytics Privilege Monitoring' },
  'endpoint:user-artifact-packager': { ownerPlugin: 'security_solution', title: 'Security Solution Endpoint Exceptions Handler' },
  'endpoint:complete-external-response-actions': { ownerPlugin: 'security_solution', title: 'Security Solution Complete External Response Actions' },
  'security:endpoint-diagnostics': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Diagnostics task' },
  'security:endpoint-meta-telemetry': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Endpoint Metrics and Info task' },
  'security:telemetry-lists': { ownerPlugin: 'security_solution', title: 'Security Solution Lists Telemetry' },
  'security:telemetry-detection-rules': { ownerPlugin: 'security_solution', title: 'Security Solution Detection Rule Lists Telemetry' },
  'security:telemetry-prebuilt-rule-alerts': { ownerPlugin: 'security_solution', title: 'Security Solution - Prebuilt Rule and Elastic ML Alerts Telemetry' },
  'security:telemetry-timelines': { ownerPlugin: 'security_solution', title: 'Security Solution Timeline telemetry' },
  'security:telemetry-diagnostic-timelines': { ownerPlugin: 'security_solution', title: 'Security Solution Diagnostic Timeline telemetry' },
  'security:telemetry-configuration': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Configuration Task' },
  'security:telemetry-filterlist-artifact': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Filter List Artifact Task' },
  'security:indices-metadata-telemetry': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Indices Metadata task' },
  'security:ingest-pipelines-stats-telemetry': { ownerPlugin: 'security_solution', title: 'Security Solution Telemetry Ingest Pipelines Stats task' },
  'security:telemetry-response-actions-rules': { ownerPlugin: 'security_solution', title: 'Security Solution Response Actions Rules Telemetry' },
  'endpoint:metadata-check-transforms-task': { ownerPlugin: 'security_solution', title: 'Security Solution Endpoint Metadata Periodic Tasks' },
  'security:health-diagnostic': { ownerPlugin: 'security_solution', title: 'Security Solution - Health Diagnostic Task' },
  'security:trial-companion-milestone': { ownerPlugin: 'security_solution', title: 'This task periodically checks currently achieved milestones' },
  'security-solution-ea-asset-criticality-ecs-migration': { ownerPlugin: 'security_solution', title: 'Migrate Asset Criticality index data to be ECS compliant' },

  // Content Connectors
  'search:agentless-connectors-manager': { ownerPlugin: 'content_connectors', title: 'Agentless Connector Deployment Manager' },
};

/**
 * Get all task types owned by a specific plugin.
 */
export function getTaskTypesForPlugin(pluginId: string): string[] {
  return Object.entries(TASK_METADATA_REGISTRY)
    .filter(([, meta]) => meta.ownerPlugin === pluginId)
    .map(([taskType]) => taskType);
}

/**
 * Get the owner plugin for a task type.
 */
export function getOwnerPlugin(taskType: string): string | undefined {
  return TASK_METADATA_REGISTRY[taskType]?.ownerPlugin;
}

/**
 * Get all unique plugin IDs that own tasks.
 */
export function getAllTaskOwnerPlugins(): string[] {
  const plugins = new Set<string>();
  for (const meta of Object.values(TASK_METADATA_REGISTRY)) {
    plugins.add(meta.ownerPlugin);
  }
  return [...plugins];
}

/**
 * Check if a task type is known (registered in the static registry).
 */
export function isKnownTaskType(taskType: string): boolean {
  return taskType in TASK_METADATA_REGISTRY;
}
