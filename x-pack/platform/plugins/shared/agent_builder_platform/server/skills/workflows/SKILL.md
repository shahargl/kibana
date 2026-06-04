---
name: kibana-workflows
basePath: skills/platform/workflows
description: >
  Create, validate, test, run, and debug Elastic Workflow YAML definitions. Use when the user wants to turn natural
  language into a Kibana workflow, fix workflow YAML, understand triggers or steps, or run a quick workflow test loop.
experimental: true
metadata:
  author: workflows
  version: "0.1.0"
  visibility: internal
---

# Kibana Workflows

Create and iterate on Elastic Workflow YAML definitions. Workflows are declarative automations that run inside Kibana:
they can query Elasticsearch, transform data, branch, loop, call connectors, create cases, notify external systems, and
invoke AI steps.

This skill follows the universal skill pattern: workflow syntax and generation guidance live in markdown, and live
validation/execution feedback comes from the `elastic` CLI.

<!-- begin-partial: preamble -->

## Environment Configuration

This skill validates and runs workflows through the `elastic` CLI. Before running any operation, confirm the `elastic`
CLI is installed and configured with a Kibana context.

If the CLI is not available, ask the user to install or configure the [`elastic` CLI](https://github.com/elastic/cli)
before continuing. Do not guess Kibana credentials or call workflow indices directly.

This skill references workflow operations in shorthand form, for example `TEST workflow`, `CREATE workflow`, and
`RUN workflow`. The [Operations](#operations) table maps each shorthand operation to the corresponding
`elastic stack kb workflows ...` command.

Verify the connection before changing anything:

```bash
elastic es info
```

If workflow APIs are hidden, enable the required Kibana settings for the target space:

- `agentBuilder:experimentalFeatures`
- `workflows:ui:enabled`

<!-- end-partial: preamble -->

## Guidelines

1. **Start with the user's intent.** Identify the trigger, inputs, data sources, actions, and desired output before
   writing YAML. If a required external dependency is unknown (for example a Slack connector ID), ask or create a safe
   placeholder rather than inventing one.

2. **Pick the smallest useful workflow.** Prefer a manual trigger for the first draft unless the user explicitly asks for
   a scheduled or alert-driven workflow. Add scheduling, alert context, connectors, and destructive actions only when
   they are part of the request.

3. **Use the workflow YAML structure exactly.** Include `version: '1'`, a unique `name`, at least one trigger, and a
   `steps` array. Use 2-space indentation. Step input parameters go under `with`; step configuration fields such as
   `condition`, `steps`, `else`, `foreach`, `connector-id`, `if`, `timeout`, and `on-failure` live beside `with`.

4. **Generate YAML from known workflow patterns.** Before writing unfamiliar step types or trigger shapes, read the
   references:
   - [Workflow YAML Reference](references/workflow_yaml_reference.md) - root structure, triggers, common step patterns,
     Liquid usage, and lifecycle commands
   - [Workflow Generation Tips](references/generation_tips.md) - critical syntax rules, common mistakes, and repair loops
   - [Workflow Patterns](references/workflow_patterns.md) - natural-language request patterns mapped to workflow YAML
   - [Demo Test Loop](references/demo_test_loop.md) - a repeatable prompt, YAML draft, and CLI command sequence

5. **Prefer connector steps over raw HTTP.** For integrations such as Slack, Jira, PagerDuty, email, ServiceNow, and
   Teams, use the connector name as the step `type` and set `connector-id`. Use raw `http` only when no connector exists
   or the user explicitly asks for a raw API call.

6. **Do not guess runtime paths.** Step outputs are referenced through `steps.<name>.output`. Never use
   `steps.<name>.with.*` or `steps.<name>.<input_param>`. Trigger event data is `event`, never `trigger.event` or
   `triggers.event`.

7. **Validate or test-run quickly.** After generating YAML, run `TEST workflow` when possible. If the workflow must be
   persisted first, run `CREATE workflow`, then `RUN workflow`, then inspect execution details and logs. Fix YAML based
   on validation/runtime feedback and repeat.

## Workflow YAML Quick Reference

```yaml
version: '1'
name: Manual Hello Workflow
description: Logs a hello message from a manual workflow
enabled: true
tags: ["demo", "workflow"]

triggers:
  - type: manual

inputs:
  properties:
    name:
      type: string
      description: Name to greet
      default: "world"

steps:
  - name: log_hello
    type: console
    with:
      message: "Hello {{ inputs.name }}"
```

Every step supports common fields:

```yaml
- name: unique_step_name
  type: step_type
  with:
    param: value
  connector-id: connector-id-for-connector-steps
  if: "steps.previous.output.ok"
  timeout: "30s"
  on-failure:
    retry:
      max-attempts: 3
      delay: "5s"
    fallback:
      - name: handle_error
        type: console
        with:
          message: "Step failed"
    continue: true
```

Common built-in step types:

| Step type | Use for |
| --- | --- |
| `console` | Debug logging during tests |
| `elasticsearch.search` | Query Elasticsearch with Query DSL |
| `elasticsearch.esql.query` | Query Elasticsearch with ES|QL |
| `elasticsearch.bulk` | Bulk indexing |
| `data.set` | Set values in workflow context |
| `data.transform` | Transform data |
| `if` | Branch on a KQL condition |
| `foreach` | Loop over a collection |
| `wait` | Pause execution |
| `http` | Raw HTTP calls |
| `ai.agent` | Invoke an Agent Builder agent |

Connector-based step types use the connector type name, for example `slack`, `jira`, `email`, or `pagerduty`, with a
`connector-id` field.

## Generation Tips

Use [Workflow Generation Tips](references/generation_tips.md) before authoring anything beyond a trivial manual workflow.
The most common mistakes are:

- Missing `version: '1'`
- Invalid or guessed step type IDs
- Putting step config inside `with`
- Referencing `triggers.event` instead of `event`
- Reading step inputs from `steps.<name>.with.*`
- Using Liquid expressions in `if` step `condition`
- Forgetting `connector-id` for connector steps
- Creating alert-triggered workflows that assume manual runs also have `event.alerts`

## Fast Test-Run Loop

For a new workflow, keep the first loop small:

1. Write the YAML.
2. `TEST workflow` with `{}` inputs or realistic input values.
3. If test execution fails, inspect the returned validation or runtime error.
4. Fix YAML and test again.
5. Only persist with `CREATE workflow` once the test path works.
6. `RUN workflow`, then inspect execution details and logs.

For YAML with complex shell quoting, write a temporary JSON command input file and use `--input-file`. This is safer than
passing multi-line YAML directly on the command line.

Example command input for testing an unsaved YAML draft:

```json
{
  "workflowYaml": "version: '1'\nname: Manual Hello Workflow\ntriggers:\n  - type: manual\nsteps:\n  - name: log_hello\n    type: console\n    with:\n      message: \"Hello world\"",
  "inputs": {}
}
```

Then run:

```bash
elastic stack kb workflows post-workflows-test --input-file /tmp/workflow-test.json
```

## References

- [Workflow YAML Reference](references/workflow_yaml_reference.md) - root schema, triggers, step patterns, Liquid, and
  API lifecycle
- [Workflow Generation Tips](references/generation_tips.md) - syntax rules, validation strategy, common failures
- [Workflow Patterns](references/workflow_patterns.md) - natural language patterns mapped to workflow YAML
- [Demo Test Loop](references/demo_test_loop.md) - repeatable local PoC prompt and command sequence

## Operations

The body of this skill references workflow operations in shorthand form. How you run them depends on the environment:

- **Direct shell / Claude:** run the `elastic` CLI commands in the table below.
- **Agent Builder (CLI exposed as an MCP server):** there is no shell. Use the MCP tools `discover` → `man` → `exec`.
  Do **not** call `elastic --help` or `elastic help`; the MCP wrapper only accepts real API commands and rejects help
  invocations. To list commands, call `discover` with `surface: "kb"`, `query: "workflow"`. The command IDs are
  dot-path form **without** a `stack.` prefix, e.g. `kb.workflows.post-workflows-test`. Fetch a command's input schema
  with `man` (`id: "kb.workflows.post-workflows-test"`), then run it with `exec`:

  ```json
  {
    "id": "kb.workflows.post-workflows-test",
    "input": {
      "workflowYaml": "version: '1'\nname: Manual Hello Workflow\ntriggers:\n  - type: manual\nsteps:\n  - name: log_hello\n    type: console\n    with:\n      message: \"Hello world\"",
      "inputs": {}
    }
  }
  ```

  Note: `inputs` is required for `post-workflows-test`. `exec` input keys match the `man` schema (e.g. `workflowYaml`,
  not snake_case). Map the shorthand operations to MCP IDs by replacing `elastic stack kb workflows <cmd>` with
  `kb.workflows.<cmd>`.

When running the shell CLI, note that read-only `get-` commands may fail with `EAGAIN: resource temporarily unavailable`
if the shell leaves stdin open; append `</dev/null` to those commands (for example
`... get-workflows-executions-executionid --execution-id "{id}" --include-output true </dev/null`).

| Operation | `elastic` CLI command |
| --- | --- |
| `STATUS` | `elastic es info` |
| `LIST workflows` | `elastic stack kb workflows get-workflows` |
| `GET workflow` | `elastic stack kb workflows get-workflows-workflow-id --id "{workflowId}"` |
| `TEST workflow` | `elastic stack kb workflows post-workflows-test --input-file /tmp/workflow-test.json` |
| `CREATE workflow` | `elastic stack kb workflows post-workflows-workflow --input-file /tmp/workflow-create.json` |
| `UPDATE workflow` | `elastic stack kb workflows put-workflows-workflow-id --id "{workflowId}" --input-file /tmp/workflow-update.json` |
| `RUN workflow` | `elastic stack kb workflows post-workflows-workflow-id-run --id "{workflowId}" --inputs "{}"` |
| `GET execution` | `elastic stack kb workflows get-workflows-executions-executionid --execution-id "{executionId}" --include-output true` |
| `GET logs` | `elastic stack kb workflows get-workflows-executions-executionid-logs --execution-id "{executionId}" --size 100` |
| `GET schema` | `elastic stack kb workflows get-workflows-schema --loose true` |
| `TEST step` | `elastic stack kb workflows post-workflows-step-test --input-file /tmp/workflow-step-test.json` |

For `CREATE workflow`, prefer an input file shaped like:

```json
{
  "id": "manual-hello-workflow",
  "yaml": "version: '1'\nname: Manual Hello Workflow\ntriggers:\n  - type: manual\nsteps:\n  - name: log_hello\n    type: console\n    with:\n      message: \"Hello world\""
}
```

For `RUN workflow`, pass inputs as JSON:

```bash
elastic stack kb workflows post-workflows-workflow-id-run --id "manual-hello-workflow" --inputs '{"name":"world"}'
```
