# Kibana Task Manager Memory Baseline

**Date:** 2026-02-01  
**Mode:** Development (`--dev`)  
**Config:** Default (all plugins enabled)

## Memory Phases

| Phase | Heap Used | Delta | RSS |
|-------|-----------|-------|-----|
| 0. Node Baseline | 177.0 MB | - | 355.8 MB |
| 1. Core Imports | 177.0 MB | +0.0 MB | 355.8 MB |
| 2. Root Constructed | 185.0 MB | +8.0 MB | 357.7 MB |
| 3. Preboot Complete | 572.8 MB | +387.7 MB | 1012.6 MB |
| 4. Setup Complete | 1162.3 MB | +589.5 MB | 1436.9 MB |
| 5. Start Complete | 1351.8 MB | +189.5 MB | 1632.0 MB |

## Plugins Loaded

- **Preboot plugins:** 1 (interactiveSetup)
- **Standard plugins:** 190

---

## CRITICAL: Plugins WITH Tasks vs WITHOUT Tasks

### Plugins WITH Tasks (23 plugins) - NEEDED for Task Manager

| Plugin | Init (code) | Setup | Total | Tasks |
|--------|-------------|-------|-------|-------|
| securitySolution | 98.88 MB | 4.03 MB | 102.92 MB | 24 |
| ml | 18.64 MB | -3.87 MB | 14.77 MB | 1 |
| fleet | 10.49 MB | 11.24 MB | 21.73 MB | 28 |
| slo | 9.96 MB | 1.50 MB | 11.46 MB | 4 |
| maintenanceWindows | 8.78 MB | 2.20 MB | 10.98 MB | 1 |
| synthetics | 7.51 MB | 5.45 MB | 12.95 MB | 4 |
| cases | 7.36 MB | 11.21 MB | 18.57 MB | 5 |
| security | 7.29 MB | -3.81 MB | 3.48 MB | 1 |
| sampleDataIngest | 6.02 MB | 0.08 MB | 6.10 MB | 1 |
| entityStore | 5.78 MB | -8.15 MB | -2.37 MB | 4 |
| dashboard | 5.11 MB | -6.27 MB | -1.16 MB | 1 |
| osquery | 4.88 MB | 0.73 MB | 5.61 MB | 3 |
| actions | 2.69 MB | 3.20 MB | 5.89 MB | 47 |
| taskManager | 2.19 MB | 2.28 MB | 4.47 MB | 3 |
| reporting | 1.19 MB | 8.53 MB | 9.72 MB | 3 |
| alerting | 0.10 MB | 1.92 MB | 2.02 MB | 54 |
| indicesMetadata | 0.02 MB | 0.26 MB | 0.28 MB | 1 |
| streams | 0.02 MB | 3.51 MB | 3.53 MB | 5 |
| contentConnectors | 0.02 MB | -7.87 MB | -7.85 MB | 1 |
| apm | 0.01 MB | 6.17 MB | 6.18 MB | 2 |
| workflowsExecutionEngine | -0.45 MB | 0.11 MB | -0.34 MB | 3 |
| cloudSecurityPosture | -6.73 MB | 2.45 MB | -4.28 MB | 1 |
| share | -7.87 MB | 0.59 MB | -7.27 MB | 1 |
| **SUBTOTAL** | **196.94 MB** | **65.46 MB** | | **202** |

### Plugins WITHOUT Tasks (168 plugins) - CAN BE SKIPPED

Top 15 by init memory:

| Plugin | Init (code) | Setup | Total |
|--------|-------------|-------|-------|
| elasticAssistant | 35.52 MB | 2.89 MB | 38.41 MB |
| stackConnectors | 30.89 MB | -0.21 MB | 30.69 MB |
| ecsDataQualityDashboard | 17.98 MB | 0.22 MB | 18.20 MB |
| monitoring | 15.87 MB | -7.41 MB | 8.47 MB |
| workflowsManagement | 13.53 MB | 2.28 MB | 15.81 MB |
| infra | 13.07 MB | -9.53 MB | 3.54 MB |
| contentManagement | 10.80 MB | 1.01 MB | 11.81 MB |
| enterpriseSearch | 10.72 MB | -5.31 MB | 5.41 MB |
| automaticImport | 10.34 MB | 0.31 MB | 10.66 MB |
| indexManagement | 9.19 MB | 1.61 MB | 10.80 MB |
| watcher | 8.93 MB | 0.45 MB | 9.38 MB |
| maps | 8.86 MB | 2.11 MB | 10.97 MB |
| screenshotting | 8.58 MB | 0.05 MB | 8.62 MB |
| datasetQuality | 7.15 MB | 0.57 MB | 7.72 MB |
| eventLog | 6.50 MB | 0.04 MB | 6.54 MB |
| ... and 153 more | | | |
| **SUBTOTAL (168)** | **391.58 MB** | **116.10 MB** | |

---

## Summary

| Category | Plugins | Init Memory | Setup Memory | Total |
|----------|---------|-------------|--------------|-------|
| WITH tasks | 23 | 196.94 MB | 65.46 MB | 262.40 MB |
| WITHOUT tasks | 168 | 391.58 MB | 116.10 MB | 507.68 MB |
| **TOTAL** | **191** | **588.52 MB** | **181.56 MB** | **770.08 MB** |

## Potential Memory Savings for Task Manager Role

| Optimization | Savings |
|--------------|---------|
| Skip 168 plugins without tasks | ~508 MB |
| Lazy load task-owning plugins (70% estimate) | ~138 MB additional |
| **TOTAL POTENTIAL** | **~646 MB** |

## Current vs Target

| Metric | Current | Target | Reduction |
|--------|---------|--------|-----------|
| Final Heap | 1,351.8 MB | ~700-800 MB | 40-50% |
| Plugins Loaded at Startup | 191 | 23 (task owners) | 88% |

## Task Owners Identified

```
actions, ai_infra, alerting, apm, cases, cloud_security_posture, content_connectors, 
dashboard, entity_store, fleet, indices_metadata, maintenance_windows, ml, osquery, 
reporting, sample_data_ingest, security, security_solution, share, slo, streams, 
synthetics, workflows_execution_engine
```
