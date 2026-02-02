# Workflow execution results intermittently return null due to race condition between workflow completion and Elasticsearch index refresh

## Problem

After the performance improvements in PR #249121, workflow execution results occasionally return `null` when querying via the API immediately after a workflow completes. This is a race condition caused by the change from `refresh: true` to `refresh: false` for Elasticsearch write operations.

## Root Cause

PR #249121 introduced performance optimizations by changing Elasticsearch write operations from `refresh: true` to `refresh: false`:

- `step_execution_repository.ts`: Changed `refresh: true` to `refresh: false` on bulk upsert operations
- `workflow_execution_repository.ts`: Changed `refresh: true` to `refresh: false` on index operations

This change means documents are not immediately searchable after being written - they become searchable only after the next index refresh cycle (~1 second, or up to 5 seconds in serverless). 

When a workflow completes:
1. The workflow status is updated to a terminal state (e.g., `COMPLETED`)
2. Step execution results are written with `refresh: false`
3. If the API is called to retrieve the workflow execution immediately after completion, the search query for step executions may return no results because the index hasn't refreshed yet
4. The output appears as `null` even though the workflow completed successfully

## Impact

- Tool calls backed by workflows intermittently return `null` results
- Workflow test executions in the UI may show "spinning" indefinitely or display incomplete step information
- Users experience inconsistent behavior when rapidly polling for workflow results

## Partial Fix (PR #249940)

The fix adds an index refresh on the **read side** (management API) rather than the write side (execution engine):

```typescript
// If workflow is in terminal status but no steps found, refresh and retry
// Steps may not be visible yet due to refresh: false on writes
if (isTerminalStatus(doc.status) && stepExecutions.length === 0) {
  await esClient.indices.refresh({ index: stepsExecutionIndex });
  stepExecutions = await searchStepExecutions({ ... });
}
```

This approach:
- Preserves the performance benefits of `refresh: false` during workflow execution
- Only incurs the refresh cost when someone actually requests the data
- Only triggers for terminal workflows (running workflows don't need it)

## Remaining Issue

**The fix only handles the case where zero steps are returned.** There is still a race condition when:

1. **Some steps are visible but others are missing** - If a workflow has multiple steps and only some have been indexed, the condition `stepExecutions.length === 0` is false, so no refresh occurs, and the response returns incomplete step data.

2. **Steps are visible but with stale status** - A step may be indexed as `RUNNING` or `IN_PROGRESS` but its final `COMPLETED` status update hasn't been indexed yet. The workflow shows as complete but individual steps appear stuck.

### Proper Fix

The condition should check that **all steps have reached a terminal status** when the workflow itself is in a terminal status:

```typescript
if (isTerminalStatus(doc.status)) {
  const allStepsTerminal = stepExecutions.every(step => isTerminalStatus(step.status));
  if (stepExecutions.length === 0 || !allStepsTerminal) {
    await esClient.indices.refresh({ index: stepsExecutionIndex });
    stepExecutions = await searchStepExecutions({ ... });
  }
}
```

This ensures consistency between the workflow's terminal state and all its step executions.

## Related PRs

- Performance PR: https://github.com/elastic/kibana/pull/249121
- Partial Fix PR: https://github.com/elastic/kibana/pull/249940
