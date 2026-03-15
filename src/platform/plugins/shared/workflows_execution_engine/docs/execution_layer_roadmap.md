# Workflows as the Execution Layer: Roadmap Proposal

## 1. Intro

LLMs need an execution layer. Bash was the accidental first one -- agents chain commands, grep output, iterate. The industry is now converging on purpose-built execution environments.

We believe workflows is that execution layer for Elastic. Not a tool the LLM calls, but the runtime it executes through. Steps are the vocabulary. Workflows are the programs. Agent Builder is the conversational interface. The workflow editor is the refinement environment.

Every feature we build should be thought about through two lenses:

- **Human face**: Visual builder, editor, UX -- making workflows authorable and debuggable by people
- **LLM face**: APIs, discoverability, programmatic access -- making workflows composable and executable by agents

The execution engine, step registry, and schemas are shared infrastructure that powers both.

Steps are typed (Zod schemas validate inputs/outputs before execution). Steps are auth-aware (connectors hold credentials, RBAC controls access). Steps are observable (every execution is logged to Elasticsearch with full audit trail). Steps are constrained (the LLM can only use registered steps, not arbitrary code).

The ownership model is clear: the workflows team builds the runtime -- the execution engine, control flow, scheduler, error handling. Other teams across Elastic contribute steps -- security contributes alert steps, observability contributes monitoring steps, search contributes query steps. The richer the step library, the more powerful the execution layer becomes.

And the key differentiator: **when an AI agent finishes iterating through steps, the sequence can be saved as a workflow that runs deterministically forever.** In other execution layers, commands vanish after execution. In Kibana, the agent's reasoning becomes a permanent, auditable, zero-token automation.

**Analogy: Bash and CLI**

A useful mental model for this proposal:


| Bash                                 | Workflows                                                          |
| ------------------------------------ | ------------------------------------------------------------------ |
| CLI binary (`curl`, `jq`, `grep`)    | **Step** (`elasticsearch.search`, `data.filter`, `ai.summarize`)   |
| Bash script                          | **Workflow** (YAML with control flow, error handling, data piping) |
| `--help`                             | Step schema (typed inputs/outputs, description, examples)          |
| `--dry-run`                          | Step dry-run mode (preview side effects before executing)          |
| `PATH` (discover available binaries) | Step registry (discover available steps)                           |
| Bash (the language/runtime)          | Workflow engine (the runtime with execution, scheduling, retries)  |


The difference: typing, auth, observability, and persistence. Bash commands are ephemeral. Workflows are artifacts.



---

## 2. Why the Roadmap Needs an Update

The current roadmap is solid. We're shipping real capabilities: internal action steps, secrets management, the automation engine, a visual builder, YAML editor improvements, E2E tests. These are all the right things to build.

But they're almost entirely built for humans.

Look at the active and planned items:

- **YAML Editor** (completions, hovers, speedup) -- built for a human editing YAML in the browser
- **Workflow Executions UX** -- built for a human looking at a dashboard
- **Visual Builder / Flow Control Icons** -- built for a human dragging and dropping
- **Agent Step UX** -- built for a human configuring steps in a UI form
- **Secrets Management** -- built for a human managing credentials

None of these are wrong. But none of them answer: **how does an LLM discover what steps exist? How does an LLM execute a step independently? How does an LLM generate a workflow and validate it programmatically? How does Agent Builder use workflows as its execution layer?**

The current roadmap builds workflows as a product. What's missing is building workflows as a platform -- an execution layer that both humans and LLMs consume through different interfaces but the same underlying primitives.

This isn't a pivot. It's adding the second lens. Every item on the current roadmap stays relevant. But each one should also ask: "does this have an API equivalent? Is this discoverable by an LLM? Can an agent get the same feedback programmatically?" That's what the three pillars below propose.

---

## 3. The Three Pillars

### Pillar 1: Steps as First-Class Citizens

Today, steps are an implementation detail of workflows. They exist inside the execution engine, they're tested via `testStep` which runs them within a workflow graph, and there's no public API to discover or run them independently. Steps are private internals of the workflow system.

This needs to change. **Steps should be independent, atomic, first-class building blocks** -- discoverable, executable, and composable by any consumer (humans, LLMs, Agent Builder, other plugins).

What "first-class citizen" means concretely:

**Discoverable**: A public API returns all registered steps with their schemas, descriptions, categories, and examples. Today, only an internal test endpoint exists. An LLM (or a UI) should be able to ask "what steps are available?" and get a complete, typed answer.

**Independently executable**: A public API executes a single step with inputs and returns outputs. No workflow context needed. Today, step execution is coupled to the workflow graph. An LLM iterating on a problem (run a query, look at results, decide next action) needs to run steps one at a time.

**Self-describing**: Every step has `description`, `category`, `examples` alongside its schema. Today, step definitions have `id`, `inputSchema`, `outputSchema`, `handler` -- no human or LLM-readable description. An LLM choosing between `data.map` and `data.filter` needs to know what they do.

**Safe to explore**: Steps that create artifacts (Jira tickets, ES documents, Slack messages) need a dry-run / simulation mode. When an LLM is exploring and iterating, we don't want it creating 50 Jira tickets. Each step should declare its side-effect level (`read-only`, `creates`, `modifies`, `deletes`) and optionally support a dry-run handler that returns what *would* happen without actually doing it. This is a known pattern in the industry (Terraform's `plan` vs `apply`, Kubernetes `--dry-run`).

**Reusable across contexts**: Steps are the same whether they're composed into a workflow YAML, called one-by-one by Agent Builder, or executed via an API or CLI. Same step, same schema, same connector, same auth -- regardless of who calls it.

**A CLI for steps and workflows**: A workflows CLI (`ewf`) would make steps tangible outside the UI:

```
ewf steps list                          # discover available steps
ewf steps describe elasticsearch.search # show schema, description, examples
ewf steps run elasticsearch.search \
  --input '{"query": ...}'              # run a step standalone
ewf steps run jira.create \
  --input '{"summary": ...}' --dry-run  # preview what would happen
ewf validate -f workflow.yaml           # validate a workflow
ewf run -f workflow.yaml                # run a workflow
```

This CLI serves multiple purposes: developers use it for testing and scripting, CI pipelines use it for validation, and Agent Builder could use it as its structured execution interface.

### Pillar 2: From Intent to Workflow

When you ask Cursor to "add authentication to my app," Cursor reasons about the task, writes code, runs tests, checks for errors, and iterates until it works. The output isn't the bash commands it ran -- it's the code it produced. The bash commands were the means. The code is the artifact.

Agent Builder should work the same way. When a user says "create an automation that checks for critical alerts every 15 minutes and sends a Slack summary," the output isn't the individual step calls -- it's a workflow. The steps were the means. The workflow is the artifact.

This pillar is about the journey from intent to artifact:

1. The user describes what they want (natural language)
2. The agent discovers available steps from the registry (Pillar 1)
3. The agent generates a complete workflow -- trigger, steps, data flow
4. The agent validates it against the schema
5. The user reviews it (visually or as YAML)
6. The user approves, saves, and it runs forever

[Epic #15734](https://github.com/elastic/security-team/issues/15734) covers much of this for the workflow editor surface. The agentic era extends it: the same capability should work from the AB sidebar on any Kibana page, not just inside the workflow editor. When a user says "automate this" from an alert page, the agent should generate a workflow right there.

**Eval framework**: You can't ship this without testing it. We need an eval framework that measures: does the generated YAML parse? Does it pass schema validation? Does it use correct step types? Does it work across models? Does it regress? This is the "data science" layer Shay asked about -- and it's an opportunity for us. We can build eval capabilities as workflow-native features: an eval workflow that generates test cases, runs them through the generation pipeline, validates outputs, and reports results. Workflows evaluating workflow generation. Dog-fooding at its finest -- and a capability we can offer to customers doing their own LLM evaluation.

**Caching and reuse**: The first time a workflow is generated for "check alerts and notify Slack," it costs tokens. The hundredth time a similar request comes in, find the cached workflow and run it. First run = LLM. Every subsequent run = deterministic, zero tokens. In Cursor terms: you write the code once, then you just run it.

### Pillar 3: The Sandbox UX

In Cursor, the AI panel is always available -- open it from any file, it knows your context, and it can execute against your codebase. The terminal (bash, file system) is right there.

In Kibana, the AB sidebar flyout is the same pattern. It opens from any page (alert page, dashboard, workflow editor, Cmd+;), it knows where you are, and it should be able to execute against the Elastic stack through workflow steps.

Three modes of the sandbox:

**Quick execution**: From any Kibana page, open the AB sidebar, describe what you need. The agent generates a workflow, shows a preview, you approve, it runs. One-shot. Like asking Cursor "run the tests" -- except instead of bash, it's a validated workflow. And unlike Cursor, the workflow is saved and reusable.

**Iterative exploration**: "Help me investigate this alert." The agent uses individual steps as tools -- queries ES, filters data, summarizes with AI -- step by step, reasoning between each call. Like how Cursor iterates: run a command, read the output, decide the next command. But instead of arbitrary bash, each step is typed, auth-aware, logged, and safe (dry-run for write operations). When the exploration reaches a useful pattern: "Want to save this as a workflow?" The ephemeral becomes permanent.

**Deep authoring**: From the workflow editor, open the chat sidebar and iterate on YAML with AI assistance. Inline edits, quick fixes, chat-based editing. This is the [Epic #15734](https://github.com/elastic/security-team/issues/15734) experience -- the refinement environment where you tune a workflow until it's exactly right.

What needs to be built:

- **Workflow attachment type**: When the agent generates a workflow in AB chat, it appears as a rich attachment (like dashboards or ESQL today) -- previewable, saveable, editable
- **Individual steps as AB tools**: The agent can call steps directly during iterative exploration, with dry-run support for write operations
- **Dynamic workflow discovery**: "Are there existing workflows that handle alert triage?" instead of only pre-configured workflow tools
- **Codify-and-save**: The bridge from iterative exploration to saved deterministic workflow
- **Workflow-specific browser tools**: `create_workflow`, `run_workflow`, `update_yaml` registered when on workflow pages
- **"Open in editor" handoff**: From AB sidebar preview to the full workflow editor with generated YAML pre-loaded

---

## 4. Gaps from Today's Roadmap

### What's aligned (keep as-is)


| Roadmap Item                                        | Pillar | Why it fits                              |
| --------------------------------------------------- | ------ | ---------------------------------------- |
| `[Epic] Define an allowed list of internal actions` | 1      | Grows the step vocabulary                |
| `Ensure prioritized internal actions work`          | 1      | Quality of existing vocabulary           |
| `[Discussion] System Workflows`                     | 1      | Pre-built reusable workflow compositions |
| `[Epic] Support User-defined Workflow Secrets`      | 1      | Credentials never touch the LLM          |
| `[One Workflow] Create Scout/E2E tests`             | All    | Quality foundation                       |
| `[sub-task] Queue collision strategy`               | All    | Engine reliability                       |
| `[Epic #15734] AI-Assisted Workflow Authoring`      | 2      | Core epic for intent-to-workflow         |
| `[#15740] Workflow Authoring Skill and Tooling`     | 2      | Foundation done (CLOSED)                 |


### What exists but needs the LLM lens


| Roadmap Item                                            | Human lens (exists)      | LLM lens (missing)                                                    |
| ------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| YAML Editor improvements (completions, hovers, speedup) | Editor UX                | Expose `_validate` as a public API so agents can self-correct         |
| Workflow Executions UX                                  | Dashboard for humans     | Structured, machine-parseable execution results for agent consumption |
| Agent Step UX (configuration, reasoning visualization)  | UI for configuring steps | Steps discoverable and configurable programmatically                  |
| Flow Control Icons (Switch, While)                      | Visual representation    | JSON schema fully represents these so generated YAML can use them     |


### What's completely missing

**Pillar 1: Steps as first-class citizens**


| Item                                                          | Why it matters                                                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Public Step Registry API                                      | No way for an LLM to ask "what can I do?" -- only an internal test endpoint exists               |
| Step Metadata Enrichment (descriptions, categories, examples) | LLMs can't reason about step selection without knowing what steps do                             |
| Standalone Step Execution API                                 | Step execution is coupled to workflow graphs -- iterative agents need to run steps independently |
| Dry-run / side-effect declarations on steps                   | LLMs exploring freely will create unwanted artifacts (Jira tickets, Slack messages) without this |
| Workflows CLI (`ewf`)                                         | No command-line interface for step discovery, execution, or workflow validation                  |


**Pillar 2: From Intent to Workflow**


| Item                                                    | Why it matters                                                                                        |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Intent-to-workflow as AB skill (not just editor-scoped) | #15739 scopes creation to the workflows surface -- "automate this" from an alert page should work too |
| Zero-shot generation tool                               | Programmatic workflow generation for agents, not just the chat-based editor experience                |
| Eval framework for workflow generation                  | No way to test quality across models, catch regressions, or measure improvement                       |
| Workflow caching/reuse                                  | Without it, every request regenerates from scratch                                                    |


**Pillar 3: Sandbox UX**


| Item                                           | Why it matters                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Workflow attachment type for AB                | Dashboards and ESQL are attachments today -- workflows are not                        |
| Individual steps as AB tools                   | Can't do iterative exploration without step-level tool calling                        |
| Dynamic workflow discovery                     | Agent can only use pre-configured workflow tools, can't find relevant ones at runtime |
| Codify-and-save pattern                        | No bridge from iterative exploration to saved deterministic workflow                  |
| Workflow-specific browser tools for AB sidebar | AB sidebar has no workflow-aware capabilities when on workflow pages                  |


---

## 5. Suggested Roadmap

### Phase 1: Steps as First-Class Citizens

**Goal**: Decouple steps from the workflow runtime. Make them discoverable, independently executable, self-describing, and safe to explore.


| Item                                                                              | Pillar |
| --------------------------------------------------------------------------------- | ------ |
| Public Step Registry API                                                          | 1      |
| Step Metadata Enrichment (descriptions, categories, examples on every step)       | 1      |
| Standalone Step Execution API                                                     | 1      |
| Side-effect declarations on steps (`read-only`, `creates`, `modifies`, `deletes`) | 1      |
| Dry-run support for write steps                                                   | 1      |
| Workflows CLI (`ewf`) -- step discovery, execution, workflow validation           | 1      |
| Make `_validate` endpoint public                                                  | 1 + 2  |
| Continue: internal actions allowed list + ensure they work                        | 1      |


### Phase 2: From Intent to Workflow

**Goal**: The generation pipeline works and is measurably good. Enriches [Epic #15734](https://github.com/elastic/security-team/issues/15734).


| Item                                                                     | Pillar |
| ------------------------------------------------------------------------ | ------ |
| Eval framework for workflow generation (workflow-native, dog-fooded)     | 2      |
| Zero-shot generation tool (generate workflow from description)           | 2      |
| Intent-to-workflow as AB skill (available from sidebar, not just editor) | 2 + 3  |
| Chat-based creation in workflow editor (#15739)                          | 2      |
| Workflow caching/reuse                                                   | 2      |


### Phase 3: The Sandbox

**Goal**: Agent Builder and Workflows work as one system. The full sandbox UX is live.


| Item                                                             | Pillar |
| ---------------------------------------------------------------- | ------ |
| Individual steps as AB tools (with dry-run for write operations) | 3      |
| Workflow attachment type for AB                                  | 3      |
| Dynamic workflow discovery                                       | 3      |
| Codify-and-save pattern                                          | 3      |
| Workflow-specific browser tools for AB sidebar                   | 3      |


---

## 6. PoCs That Demonstrate Value

Each PoC is designed to prove a specific part of the vision and build momentum toward the roadmap.

### PoC 1: "Step Explorer"

**What we build**: The public step registry API + standalone step execution API + the `ewf` CLI wrapper.

**The demo**: From the terminal (or through AB), ask: "query ES for the top 10 error logs from yesterday." The LLM discovers `elasticsearch.search` from the step registry, reads its schema, constructs valid typed inputs, and executes it. Alternatively, a developer runs `ewf steps list`, picks a step, runs `ewf steps run elasticsearch.search --input '{...}'`, and gets results.

**What it proves**: Steps can be first-class citizens -- discoverable, independently executable, and usable by both LLMs and humans from the command line. The "step as CLI binary" model works.

**How it serves the roadmap**: Validates Phase 1. If this works, the step-as-first-class-citizen model is sound and Phases 2 and 3 build on top of it.

### PoC 2: "Intent to Workflow"

**What we build**: A generation prompt that includes the workflow YAML schema + step registry + 5 example workflows. An eval harness that tests generation quality: YAML validity, schema compliance, step selection accuracy, across 3 models. The eval harness itself is built as a workflow (dog-fooding).

**The demo**: Feed it: "when a new critical alert fires, query ES for related events in the last hour, summarize them with AI, and send a Slack notification." Out comes a valid, executable workflow YAML. The eval workflow runs the test suite and reports pass rates across models.

**What it proves**: An LLM can generate a complete, valid workflow from a single sentence. We can measure quality and identify the best model. The eval framework works as a workflow (dog-fooding). The "from intent to workflow" pipeline is viable.

**How it serves the roadmap**: Validates Phase 2. The eval harness becomes the foundation of the eval framework. The prompt becomes the generation skill.

### PoC 3: "Iterative Agent"

**What we build**: Register 4-5 workflow steps as AB tools (`elasticsearch.search`, `data.filter`, `data.map`, `ai.summarize`, `send_slack_message`). Implement dry-run for `send_slack_message`. Give an agent these tools.

**The demo**: Ask: "find the noisiest alert rule in the last 24 hours and explain why it's firing so much." The agent reasons, calls `elasticsearch.search` to get alert counts, calls `data.filter` to find the top rule, calls `elasticsearch.search` again for that rule's recent alerts, calls `ai.summarize` to explain the pattern. The Slack notification step runs in dry-run mode ("would send to #alerts: ..."). Then: "Want to save this as a reusable workflow?" -- the step sequence becomes a saved workflow.

**What it proves**: Agent Builder can use workflow steps as its execution layer (like Cursor uses bash). The iterative pattern works. Dry-run prevents unwanted side effects. The codify-and-save bridge works -- ephemeral exploration becomes a permanent, deterministic artifact.

**How it serves the roadmap**: Validates Phase 3. Proves the full `Agent Builder : workflow steps :: Cursor : bash` analogy end-to-end, including the part where bash can't do: saving the exploration as a reusable workflow.

---

## 7. What It Looks Like When It's Done

### SRE responding to an incident

Maya is an SRE. A P1 alert fires at 3am -- error rate spike on the payments service.

She opens Kibana, sees the alert, and opens the AB sidebar (Cmd+;). She types: "What's going on with the payments service? Check error logs, correlate with recent deployments, and summarize."

Agent Builder reasons about the request. It calls `elasticsearch.search` to pull error logs from the last hour. It calls `data.filter` to extract unique error patterns. It calls `elasticsearch.search` again against the deployments index. It calls `ai.summarize` to correlate the errors with a deployment that went out 45 minutes ago.

Maya sees the full execution trail -- every step, every input/output, timestamped and logged to Elasticsearch. She sees the summary: "Error spike correlates with deployment v2.4.1 which changed the payment gateway timeout from 30s to 5s."

She says: "Save this as a workflow I can run next time." The step sequence becomes a saved workflow called "Payment Error Triage." Next incident, anyone on her team runs it with one click. No LLM needed. Deterministic. Auditable. The on-call dashboard shows execution history across incidents.

### Security analyst hunting a threat

David is a security analyst. He's investigating a suspicious IP that appeared in multiple alerts.

He opens the AB sidebar from the alerts page. He types: "Investigate IP 10.0.0.47 -- check if it appears in threat intel, find all related alerts in the last 7 days, and check what user accounts accessed it."

Agent Builder generates a workflow and shows it as an attachment -- David can see the visual flow: threat intel lookup -> alert search -> user extraction -> summary. He reviews it, clicks "Run." The execution runs deterministically. He gets a structured summary with links to the relevant alerts and user accounts.

He says: "Add a step to create a case with these findings." The `cases.create` step runs in dry-run first -- David sees "Would create case: IP 10.0.0.47 Investigation with 3 related alerts." He approves. The case is created. He saves the full workflow as "IP Investigation Playbook." His whole team can now run it -- the analyst who built it doesn't need to be on shift.

### Platform team onboarding a new data source

Alex is on the platform team. They've just added a new data source (cloud audit logs) and want to automate quality checks.

They go to the Workflows page, click "Create with AI," and type: "Every hour, check if the cloud-audit-logs index has received data in the last 15 minutes. If not, send an alert to the #data-quality Slack channel with the last ingestion timestamp."

The AI generates the workflow YAML in the editor. Alex sees the trigger (interval: 1h), the steps (ES query, conditional check, Slack notification), the Liquid expressions connecting them. They tweak the threshold from 15 to 30 minutes in the YAML, the AI validates it, and they save. Done. No code. Runs forever. When it fires, the execution is logged and visible in the workflow dashboard.

---

## Value Story

**For users**: "Describe what you want automated, from any page in Kibana. The agent figures out the steps, shows you the plan as a visual workflow, and runs it. You can trust it because every step is typed and validated. You can reuse it because it's saved as a deterministic workflow. You can audit it because every execution is logged."

**For the platform**: "Workflows become the standard way agents execute multi-step tasks in Elastic. Instead of every solution building its own tool-calling patterns, they contribute steps to the registry. Agent Builder composes them. The execution layer is shared."

**For Shay's vision**: "Workflows as a sandboxed execution runtime for LLMs -- with the step library as the vocabulary, the intent-to-workflow pipeline as the compiler, the AB sidebar as the conversational interface, and the workflow editor as the refinement environment."