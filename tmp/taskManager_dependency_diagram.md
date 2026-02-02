# Task Manager Dependency Graph

## Visual Diagram

```
                                    ┌─────────────────────────────────────────────────────┐
                                    │           WHAT DEPENDS ON taskManager               │
                                    │                  (26 plugins)                       │
                                    └─────────────────────────────────────────────────────┘
                                                           │
        ┌──────────────────────────────────────────────────┼──────────────────────────────────────────────────┐
        │                                                  │                                                  │
        ▼                                                  ▼                                                  ▼
┌───────────────────┐                           ┌───────────────────┐                           ┌───────────────────┐
│     alerting      │                           │      actions      │                           │     security      │
│     (2.1MB)       │                           │      (1.8MB)      │                           │     (1.5MB)       │
└───────────────────┘                           └───────────────────┘                           └───────────────────┘
        │                                                  │                                                  │
        │ pulls in                                         │ pulls in                                         │
        ▼                                                  ▼                                                  ▼
┌───────────────────┐                           ┌───────────────────┐                           ┌───────────────────┐
│      data         │                           │ encryptedSavedObj │                           │     spaces        │
│    (73.9MB)       │◄──────────────────────────│      (1.2MB)      │                           │     (1.1MB)       │
└───────────────────┘                           └───────────────────┘                           └───────────────────┘
                                                                                                          
        ┌──────────────────────────────────────────────────┼──────────────────────────────────────────────────┐
        │                                                  │                                                  │
        ▼                                                  ▼                                                  ▼
┌───────────────────┐                           ┌───────────────────┐                           ┌───────────────────┐
│ contentConnectors │                           │      streams      │                           │  securitySolution │
│    (53.6MB)       │                           │    (25.1MB)       │                           │     (6.6MB)       │
└───────────────────┘                           └───────────────────┘                           └───────────────────┘
        │                                                  │                                                  │
        │ pulls in                                         │ pulls in                                         │ pulls in
        ▼                                                  ▼                                                  ▼
┌───────────────────┐                           ┌───────────────────┐                           ┌───────────────────┐
│      home         │                           │   ruleRegistry    │                           │      cases        │
│    (13.4MB)       │                           │    (11.0MB)       │                           │    (19.3MB)       │
└───────────────────┘                           └───────────────────┘                           └───────────────────┘


                                    ┌─────────────────────────────────────────────────────┐
                                    │              taskManager itself                     │
                                    │                  (1.5MB)                            │
                                    └─────────────────────────────────────────────────────┘
                                                           │
                                                           │ requires
                                                           ▼
                                    ┌─────────────────────────────────────────────────────┐
                                    │                licensing                            │
                                    │                  (0.8MB)                            │
                                    └─────────────────────────────────────────────────────┘
```

## Summary

### taskManager's OWN dependencies (what it NEEDS)
| Plugin | Memory |
|--------|--------|
| taskManager | 1.5MB |
| licensing | 0.8MB |
| **TOTAL** | **2.3MB** |

### Plugins that REQUIRE taskManager (what NEEDS it)
| Plugin | Memory | What it pulls in |
|--------|--------|------------------|
| alerting | 2.1MB | data (73.9MB), ruleRegistry (11MB) |
| actions | 1.8MB | encryptedSavedObjects |
| security | 1.5MB | spaces |
| contentConnectors | 53.6MB | home (13.4MB) |
| streams | 25.1MB | ruleRegistry |
| securitySolution | 6.6MB | cases (19.3MB), productDocBase |
| productDocBase | 8.9MB | - |
| reporting | 4.0MB | home |
| indicesMetadata | 5.5MB | - |
| fleet | - | files (4.6MB) |
| ml | - | usageCollection |
| slo | - | streams, ruleRegistry |
| synthetics | - | streams |
| uptime | - | streams |
| ... and 12 more | | |

## The Problem

When Kibana runs in **background_tasks** role (Task Manager mode):

1. **taskManager itself** only needs **2.3MB**
2. But **26 plugins depend on taskManager** 
3. Those plugins pull in **113 additional plugins**
4. Total: **115 plugins, ~245MB**

## Heavy Plugins NOT Needed for Task Manager Role

| Plugin | Memory | Why NOT needed |
|--------|--------|----------------|
| data | 73.9MB | Search/query DSL for UI |
| contentConnectors | 53.6MB | Content management UI |
| streams | 25.1MB | Streams UI |
| cases | 19.3MB | Cases UI |
| home | 13.4MB | Home page UI |
| ruleRegistry | 11.0MB | Alert registry (UI-focused) |
| productDocBase | 8.9MB | AI docs UI |
| securitySolution | 6.6MB | Security UI |

## Potential Savings

If Task Manager role could load **only what it needs**:

| Scenario | Plugins | Memory |
|----------|---------|--------|
| Current (all dependents) | 115 | ~245MB |
| Minimal (TM + essential deps) | ~10 | ~20MB |
| **Savings** | 105 plugins | **~225MB** |

## Recommendations

1. **Add `enabledOnRoles` to plugin manifest**
   ```jsonc
   {
     "plugin": {
       "enabledOnRoles": ["ui"]  // Not loaded for background_tasks
     }
   }
   ```

2. **Check role BEFORE loading plugin code**
   - Currently: load code → check config → skip if disabled
   - Should be: check manifest → skip if wrong role → load code

3. **Split heavy plugins**
   - `data`: Split into data-core (always) vs data-ui (UI only)
   - `alerting`: Split into alerting-execution vs alerting-ui
