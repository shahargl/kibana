# Demo Test Loop

Use this as the minimal repeatable demo for the universal `kibana-workflows` skill.

## Prompt

```text
Use the kibana-workflows skill. Create a simple manual workflow named "Manual Hello Workflow" that accepts a `name`
input and logs `Hello {{ inputs.name }}`. Test it with the elastic CLI, then show me the create/run/log commands I can
reuse.
```

## Expected YAML Draft

```yaml
version: '1'
name: Manual Hello Workflow
description: Logs a greeting from a manual workflow
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

## Test Unsaved YAML

Write a JSON input file. Prefer JSON files for CLI invocations so multi-line YAML does not depend on shell quoting.

```json
{
  "workflowYaml": "version: '1'\nname: Manual Hello Workflow\ndescription: Logs a greeting from a manual workflow\nenabled: true\ntags: [\"demo\", \"workflow\"]\n\ntriggers:\n  - type: manual\n\ninputs:\n  properties:\n    name:\n      type: string\n      description: Name to greet\n      default: \"world\"\n\nsteps:\n  - name: log_hello\n    type: console\n    with:\n      message: \"Hello {{ inputs.name }}\"",
  "inputs": {
    "name": "Shahar"
  }
}
```

Run:

```bash
elastic stack kb workflows post-workflows-test --input-file /tmp/manual-hello-test.json
```

## Create Workflow

```json
{
  "id": "manual-hello-workflow",
  "yaml": "version: '1'\nname: Manual Hello Workflow\ndescription: Logs a greeting from a manual workflow\nenabled: true\ntags: [\"demo\", \"workflow\"]\n\ntriggers:\n  - type: manual\n\ninputs:\n  properties:\n    name:\n      type: string\n      description: Name to greet\n      default: \"world\"\n\nsteps:\n  - name: log_hello\n    type: console\n    with:\n      message: \"Hello {{ inputs.name }}\""
}
```

Run:

```bash
elastic stack kb workflows post-workflows-workflow --input-file /tmp/manual-hello-create.json
```

## Run And Inspect

```bash
elastic stack kb workflows post-workflows-workflow-id-run --id "manual-hello-workflow" --inputs '{"name":"Shahar"}'
elastic stack kb workflows get-workflows-executions-executionid --execution-id "{executionId}" --include-output true
elastic stack kb workflows get-workflows-executions-executionid-logs --execution-id "{executionId}" --size 100
```

## Success Criteria

- Agent Builder loads `kibana-workflows` as a markdown universal skill.
- The loaded skill includes references for syntax, generation tips, patterns, and this demo loop.
- The generated YAML uses `version: '1'`, a manual trigger, valid `inputs.properties`, and a `console` step.
- The workflow is validated or test-run through `elastic stack kb workflows post-workflows-test`.
- The final answer shows the exact CLI commands for create, run, execution details, and logs.
