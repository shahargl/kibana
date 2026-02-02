# PR Title

fix: use mget for step executions to eliminate race conditions and improve performance

# Summary

Using Apostolos' approach of persisting the last step ID, I've extended it a bit (because it's somewhat tricky to know what's the "last step" - could be different in loops, retries, or failed workflows). Instead of tracking just the last step, we now persist **all step execution IDs** on the workflow document.

This lets us use `mget` (multi-get by ID) instead of search to fetch steps. The key insight is that `mget` is **real-time** - it reads directly from the translog and doesn't depend on index refresh at all. So the race condition is completely eliminated, not just mitigated.

## Problem

PR #249121 changed step execution writes from `refresh: true` to `refresh: false` for performance. This introduced race conditions:

1. **Missing steps** - Steps not yet indexed when workflow completes
2. **Stale step status** - Steps show as `RUNNING` when actually `COMPLETED`
3. **Partial visibility** - Some steps indexed but others missing entirely

Previous fixes (PR #249940) using conditional refresh only handled the case where zero steps were returned, but edge cases remained (e.g., some steps indexed but not others).

## Solution

Store all step execution IDs on the workflow document, then use `mget` (multi-get by ID) instead of search:

1. **Write side**: Store `stepExecutionIds` array on workflow document during flush
2. **Read side**: Use `mget` to fetch steps by ID - instant, real-time, no refresh needed
3. **Fallback**: Search only for backward compatibility with old workflows

### Why mget eliminates the race condition

- **Real-time reads** - `mget` reads from the translog, finds documents immediately after write
- **No refresh dependency** - Unlike search, doesn't need index refresh to see new documents
- **Deterministic** - Know exactly which steps should exist, no guessing
- **O(1) performance** - Direct document lookup vs query execution

## Changes

### Type Definition
- `src/platform/packages/shared/kbn-workflows/types/v1.ts`
  - Added `stepExecutionIds?: string[]` to `EsWorkflowExecution` interface

### Write Side  
- `src/platform/plugins/shared/workflows_execution_engine/server/workflow_context_manager/workflow_execution_state.ts`
  - `flushWorkflowChanges()` now includes all step execution IDs in workflow document

### Read Side
- `src/platform/plugins/shared/workflows_management/server/workflows_management/lib/get_workflow_execution.ts`
  - Added `getStepExecutionsByIds()` helper using `mget`
  - Use `mget` when `stepExecutionIds` available (real-time, no refresh needed)
  - Fallback to search for backward compatibility (old workflows without `stepExecutionIds`)

## Backward Compatibility

Old workflows without `stepExecutionIds` fall back to the previous search-based approach with basic refresh logic.

## Testing

- Existing tests pass
- Manual testing: Workflow results consistently show all steps immediately after completion
- Performance: No more unnecessary refreshes

## Credit

Thanks to Apostolos for the direction on persisting step IDs to avoid the search/refresh dependency!
