# Workflow YAML Reference

Elastic Workflows are YAML documents executed by Kibana. They have metadata, triggers, optional inputs/constants, and an
ordered `steps` array.

## Root Structure

```yaml
version: '1'
name: Workflow Name
description: What this workflow does
enabled: true
tags: ["tag1", "tag2"]

consts:
  index: "logs-*"

inputs:
  properties:
    severity:
      type: string
      description: Alert severity to process
      default: "critical"

triggers:
  - type: manual

steps:
  - name: first_step
    type: console
    with:
      message: "Workflow started"
```

## Triggers

### Manual

Use manual triggers for demos, testing, and user-initiated runs.

```yaml
triggers:
  - type: manual
```

Manual runs do not have alert event context. If a workflow can run manually and from alerts, guard alert-only branches.

### Scheduled

Use scheduled triggers for recurring checks or reports.

```yaml
triggers:
  - type: scheduled
    with:
      every: "1h"
```

### Alert

Use alert triggers when a Kibana rule or Security detection should dispatch to the workflow.

```yaml
triggers:
  - type: alert
```

Alert runtime data is available under `event`:

- `{{ event.alerts }}` - array of alert documents
- `{{ event.alerts[0]._id }}` - alert ID
- `{{ event.alerts[0]._index }}` - alert index
- `{{ event.alerts[0]["@timestamp"] }}` - alert timestamp
- `{{ event.rule.name }}` - rule name
- `{{ event.spaceId }}` - Kibana space

Never use `triggers.event`, `trigger.event`, or `triggers.event.*`.

## Inputs And Constants

Use `consts` for fixed workflow configuration, and `inputs` for values passed at run time.

```yaml
consts:
  target_index: "logs-*"

inputs:
  properties:
    service_name:
      type: string
      description: Service to inspect
```

Reference them with Liquid:

```yaml
with:
  message: "Checking {{ inputs.service_name }} in {{ consts.target_index }}"
```

## Step Fields

Every step has:

- `name`: unique within the workflow
- `type`: step type ID or connector type
- `with`: input parameters for the step type

Common optional fields:

- `connector-id`: connector instance ID for connector steps
- `if`: skip this step unless the expression is truthy
- `timeout`: step timeout
- `on-failure`: retry, fallback, and continuation behavior

Step config fields outside `with` depend on the step type:

- `if` step: `condition`, `steps`, `else`
- `foreach` step: `foreach`, `steps`

## Built-In Step Types

| Step type | Description |
| --- | --- |
| `console` | Log a message for debugging or demo output |
| `elasticsearch.search` | Execute Elasticsearch Query DSL |
| `elasticsearch.esql.query` | Execute ES|QL |
| `elasticsearch.bulk` | Bulk index documents |
| `data.set` | Store values in workflow context |
| `data.transform` | Transform data |
| `if` | Branch by KQL condition |
| `foreach` | Iterate over a collection |
| `wait` | Pause execution |
| `http` | Make an HTTP request |
| `ai.agent` | Invoke an Agent Builder agent |

## Connector Steps

Connector steps use the connector type as the step type and require a connector instance ID.

```yaml
- name: send_slack
  type: slack
  connector-id: my-slack-connector
  with:
    message: "Workflow completed"
```

Prefer connector steps for Slack, Jira, PagerDuty, email, ServiceNow, Teams, and similar integrations. Use raw `http`
only when no connector exists or the user requests a custom HTTP API call.

## Liquid Templating

Use Liquid expressions for dynamic values:

```yaml
{{ inputs.input_name }}
{{ consts.constant_name }}
{{ steps.step_name.output.field }}
{{ foreach.item }}
{{ event }}
```

Useful filters:

```yaml
{{ data | json }}
{{ value | default: "fallback" }}
{{ text | url_encode }}
{{ items | size }}
```

Only step outputs are addressable through `steps.<name>.output`. Step input parameters are not addressable through
`steps.<name>.with.*`.

## Error Handling

Use `on-failure` for retries and fallback steps:

```yaml
- name: call_service
  type: http
  with:
    method: GET
    url: "https://example.com/status"
  on-failure:
    retry:
      max-attempts: 3
      delay: "10s"
    fallback:
      - name: log_failure
        type: console
        with:
          message: "HTTP call failed"
    continue: true
```

## Lifecycle

Use the `elastic` CLI for the fast loop:

1. Write YAML.
2. `TEST workflow` with `post-workflows-test`.
3. Fix validation/runtime errors.
4. `CREATE workflow`.
5. `RUN workflow`.
6. Inspect execution and logs.
