# Workflow Generation Tips

Guidelines for translating natural language into valid Elastic Workflow YAML.

## Generation Process

1. **Classify the trigger.**
   - "Run this now", "on demand", "manual" -> `manual`
   - "Every hour", "daily", "periodically" -> `scheduled`
   - "When an alert fires", "from a detection rule" -> `alert`

2. **Identify inputs and constants.**
   - Values users provide at run time belong in `inputs`.
   - Fixed values such as index patterns, thresholds, or connector names belong in `consts`.

3. **Choose the smallest step sequence.**
   - Start with `console` for simple demos.
   - Use `elasticsearch.search` or `elasticsearch.esql.query` for data lookup.
   - Use `data.set` / `data.transform` before conditions when a computed value is needed.
   - Use connector steps for external systems.

4. **Write YAML with explicit data flow.**
   - Give each step a stable snake_case `name`.
   - Reference prior step outputs through `steps.<name>.output`.
   - Use `foreach.item` only inside `foreach` child steps.

5. **Test early.**
   - Use `post-workflows-test` before persisting when possible.
   - If a workflow must be persisted first, create it disabled or safe, then run with minimal inputs.

## Critical Syntax Rules

### Include The Workflow Version

Always include:

```yaml
version: '1'
```

### Use `event`, Not `triggers.event`

The `triggers` block configures activation. Runtime data is available as `event`.

```yaml
# WRONG
message: "{{ triggers.event.rule.name }}"

# CORRECT
message: "{{ event.rule.name }}"
```

### Step Outputs Use `.output`

```yaml
# WRONG
message: "{{ steps.search.with.query }}"

# CORRECT
message: "{{ steps.search.output.hits.total.value }}"
```

### `if` Step Conditions Are KQL-Like, Not Liquid

Do not put Liquid filters directly in an `if` step's `condition`.

```yaml
# WRONG
- name: check
  type: if
  condition: "{{ steps.search.output.hits | size }} > 0"

# BETTER
- name: set_count
  type: data.set
  with:
    count: "{{ steps.search.output.hits.hits | size }}"
- name: check
  type: if
  condition: "steps.set_count.output.count > 0"
```

### Connector Steps Need `connector-id`

```yaml
- name: notify
  type: slack
  connector-id: my-slack-connector
  with:
    message: "Done"
```

If the connector ID is unknown, ask the user or use a placeholder that is clearly marked.

### Step Config Does Not Always Belong In `with`

For `if` and `foreach`, child steps and control fields are step-level config:

```yaml
- name: for_each_alert
  type: foreach
  foreach: "{{ event.alerts }}"
  steps:
    - name: log_alert
      type: console
      with:
        message: "{{ foreach.item._id }}"
```

## Validation Strategy

Prefer this loop:

1. Generate YAML.
2. Build `/tmp/workflow-test.json` with `workflowYaml` and `inputs`.
3. Run:

   ```bash
   elastic stack kb workflows post-workflows-test --input-file /tmp/workflow-test.json
   ```

4. If validation fails, fix all occurrences of the same mistake before retrying.
5. If runtime fails, inspect execution/logs and fix the step that failed.

## Repair Heuristics

| Error shape | Likely fix |
| --- | --- |
| Unknown step type | Use a built-in type or connector type known to exist |
| Missing required property | Move the field into `with` or add required step config |
| Liquid variable resolves empty | Check `steps.<name>.output` path or `event` availability |
| Manual run has no alert data | Add inputs or guard alert-only branches |
| Connector step fails before execution | Add or correct `connector-id` |
| Query step returns no useful data | Loosen filters, validate index/field names, or use sample output |

## Safe Defaults

- Use `manual` trigger for the first draft.
- Use `console` output in demos before adding side effects.
- Prefer read-only Elasticsearch queries before writes.
- Add `enabled: true` only when the user wants the workflow runnable from triggers.
- Ask before creating workflows that send notifications, write documents, or call external services.
