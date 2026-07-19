# Execution identity PoC

This plugin provides space-scoped service accounts for background execution. A service account is
a Kibana-managed identity backed by an explicitly downscoped UIAM API key.

See [INSIGHTS.md](./INSIGHTS.md) for the complete trust boundary, built-in/custom role flows, added
UIAM primitives, and the long-term native UIAM service-account model.
See [manual_e2e_testing.md](./manual_e2e_testing.md) for the seeded demo inventory and verification
flows.

## Security model

- The creator requests explicit project IDs and application roles.
- Role autocomplete comes from UIAM's `_delegable_roles` decision. Built-in roles use UIAM's
  authoritative hierarchy; single-project custom-role candidates come from the Elasticsearch role
  catalog.
- UIAM permits organization administrators to grant those assignments. Other creators may grant
  only project and application roles already covered by their own assignments. A project admin may
  grant an existing custom role; a non-admin custom role requires an exact-name assignment.
- Built-in-role identities use role containment: the caller's current assignments must cover the
  identity assignments.
- A single-project custom-role identity may add a role-based trust policy. UIAM persists
  `allowed_role_assignments`; a user or API-key principal must cover every trusted assignment.
  Without that policy, callers must cover the identity's custom role by exact name.
- The resulting permissions are stored on the UIAM API key and remain stable if the creator's
  permissions later change.
- Editing a service account grants a replacement UIAM API key with the requested assignments,
  atomically swaps the encrypted credential, and then revokes the previous key.
- Kibana stores the credential in an encrypted saved object. Workflows and Task Manager store only
  the service account ID and space ID.
- Resolution is fail-closed. A missing identity or resolver never falls back to the user who last
  saved the workflow.
- Before a user binds or manually runs a workflow with `run_as`, Kibana asks UIAM whether the
  caller is covered by the trust policy or identity assignments. UIAM organization administrators
  are always allowed.
- A nested workflow with its own `settings.run_as` performs the same check using the parent
  service-account API key as the source principal, then switches credentials only when UIAM allows
  that service-account-to-service-account delegation.
- Existing Kibana space privileges control who can manage or bind service accounts in this PoC.

## Workflow usage

Create a service account in **Stack Management → Security → Service accounts**, then reference its
saved object ID in the workflow:

```yaml
settings:
  run_as: <service-account-id>
```

Both manual and scheduled executions resolve the identity at execution time. Scheduled Task Manager
documents contain only:

```yaml
executionIdentity:
  id: <service-account-id>
  spaceId: <space-id>
```

If the current user cannot use the referenced service account, the editor becomes read-only, Save
and Run are disabled, and the server rejects save and manual execution requests with `403`.
Previously scheduled executions continue to use the stable service account identity.

## Role and sharing flows

### Built-in role

An administrator or editor selects a UIAM built-in role such as `viewer`. The picker shows only
roles covered across every selected project, and `_grant` rechecks the assignment when creating the
key.

### Custom role

For a single project, an administrator can select an existing Elasticsearch custom role, such as
`workflow_logs_reader`. By default, organization administrators and principals holding that exact
role can use the identity. The administrator may additionally trust a role such as `editor`;
users and service-account API keys covering `editor` can then switch to the stronger custom-role
identity. This delegation does not grant permission to edit or delete the service account, and
Kibana never displays its credential.

Custom roles disable cross-project scope in the UI, and the server rejects a custom role assigned
to multiple projects. Equal names across projects do not prove equal role descriptors.

To demonstrate the denial flow locally:

1. Sign in with both `admin` and `viewer`, then create a service account assigned only `admin`.
2. Create a workflow with that service account in `settings.run_as`.
3. Sign out and sign back in with only `viewer`.
4. Open the workflow. Kibana shows the permission warning and disables editing and execution.

## Local CPS validation

Build the modified UIAM repository first. For a local build without Artifactory access, clone
`elastic/uiam-commons` as a sibling of the UIAM repository and enable UIAM's documented local
composite build.

```bash
git clone git@github.com:elastic/uiam-commons.git ~/git/uiam-commons
cd ~/git/uiam-execution-identity-poc
JAVA_HOME=/opt/homebrew/opt/openjdk@25 ./gradlew assemble -Plocal=true
docker build -f src/main/docker/Dockerfile.jvm -t uiam-local:dev .
```

Allocate at least 16 GB to Docker Desktop. Then start Kibana's local Serverless CPS stack with the
local image. Rspack is important here because the legacy optimizer's parallel bundle build can
exhaust host memory while the four Elasticsearch nodes and UIAM are running.

```bash
cd ~/git/kibana-execution-identity-poc
nvm use
KBN_USE_RSPACK=true \
KBN_ES_SNAPSHOT_USE_CACHED=true \
UIAM_DOCKER_IMAGE=uiam-local:dev \
node scripts/scout start-server \
  --arch serverless \
  --domain security_complete \
  --serverConfigSet execution_identity_cps_local
```

The stack starts origin and linked Elasticsearch projects that share the same UIAM service.
An identity that performs CPS must have assignments for both projects: the origin authorizes the
request before applying `project_routing`, and the linked project authorizes the routed search.

Run the API test against the started stack:

```bash
npx playwright test \
  --config x-pack/platform/plugins/shared/execution_identity/test/scout_cps_local/api/playwright.config.ts \
  --project=local
```

The suite verifies cross-project execution and key rotation, project-aware built-in role discovery,
custom-role autocomplete, single-project enforcement, and role-based `_can_use` denial/approval.

## PoC limitations

- This is a Kibana abstraction over a UIAM API key, not a native UIAM service-account principal.
- At execution time UIAM authenticates the API key, not the original human user or workflow
  binding. The trust policy secures Kibana-mediated binding and nested identity switching; it is
  not actor-aware enforcement on a leaked raw key.
- UIAM does not expose an in-place API key update API, so editing rotates the credential.
- A failed post-swap revocation is logged but is not yet persisted for durable retry.
- Reusable administrator-published workload-role templates are not included. They would be a
  separate creation-delegation primitive allowing selected users to create their own service
  accounts from an approved custom role. The implemented trust policy delegates use of an existing
  identity instead.
- The PoC protects binding, editing, and execution, but does not yet hide historical execution
  outputs from users who otherwise have permission to read them.
- The implementation is Serverless-only because stateful deployments do not have UIAM.
- End-to-end CPS verification requires a locally built UIAM image containing the corresponding
  `_grant` API changes.
