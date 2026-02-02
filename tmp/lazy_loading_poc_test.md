# Lazy Loading PoC Test Instructions

## What Was Built

1. **`@kbn/task-definitions` package** - Contains:
   - `TASK_METADATA_REGISTRY` - Static mapping of 202 task types to their owner plugins
   - `ESSENTIAL_PLUGINS_FOR_BACKGROUND_TASKS` - Set of ~50 plugins needed for TM role
   - `SKIP_FOR_BACKGROUND_TASKS` - Set of ~100 UI-only plugins that can be skipped

2. **Plugin filtering in `plugins_system.ts`** - When `LAZY_TASK_MANAGER_POC=true`:
   - Filters out non-essential plugins during `setupPlugins()`
   - Logs which plugins were skipped

## How to Test

### Step 1: Stop Existing Kibana
If Kibana is running, stop it with Ctrl+C.

### Step 2: Run Baseline (Normal Mode)
```bash
# Normal startup - all 191 plugins loaded
node scripts/kibana --dev 2>&1 | tee kibana_baseline.log
```
Wait for "Server running at http://localhost:5601" then note the memory in the logs.

### Step 3: Run PoC (Lazy Mode)
```bash
# Lazy loading - only essential plugins loaded
LAZY_TASK_MANAGER_POC=true node scripts/kibana --dev 2>&1 | tee kibana_lazy.log
```
Wait for startup, then note:
- Number of plugins loaded (should be ~50 instead of ~191)
- Memory at startup
- Look for `[LAZY_POC]` log lines

### Step 4: Compare Results

After both runs, compare:
```bash
# Get memory phases from both logs
grep "MEMORY_PHASE" kibana_baseline.log
grep "MEMORY_PHASE" kibana_lazy.log

# Get plugin counts
grep "Setting up \[" kibana_baseline.log
grep "Setting up \[" kibana_lazy.log
grep "LAZY_POC" kibana_lazy.log
```

## Expected Results

| Metric | Baseline | PoC (Lazy) | Savings |
|--------|----------|------------|---------|
| Plugins loaded | ~191 | ~50 | ~74% fewer |
| Init memory | ~435 MB | ~150 MB | ~285 MB |
| Setup memory | ~120 MB | ~50 MB | ~70 MB |
| Total heap | ~1,350 MB | ~700-900 MB | 30-45% |

## Success Criteria

1. Kibana starts successfully with `LAZY_TASK_MANAGER_POC=true`
2. Task Manager plugin is loaded and functional
3. Memory reduction of at least 300 MB compared to baseline
4. No critical errors in logs

## Known Limitations

This PoC:
- Only filters plugins at startup - doesn't support on-demand loading yet
- May break some functionality if a skipped plugin is needed
- Uses a static list - production would need dynamic dependency resolution

## Files Created

- `/x-pack/platform/packages/shared/kbn-task-definitions/` - New package
- Modified: `/src/core/packages/plugins/server-internal/src/plugins_system.ts`

## Reverting

To disable the PoC, simply don't set the environment variable:
```bash
node scripts/kibana --dev  # Normal behavior
```
