# Execution identity PoC

This plugin provides space-scoped service accounts for background execution. A service account is
a Kibana-managed identity backed by an explicitly downscoped UIAM API key.

## Security model

- The creator requests explicit project IDs and application roles.
- UIAM permits organization administrators to grant those assignments. Other creators may grant
  only project and application roles already covered by their own assignments.
- The resulting permissions are stored on the UIAM API key and remain stable if the creator's
  permissions later change.
- Kibana stores the credential in an encrypted saved object. Workflows and Task Manager store only
  the service account ID and space ID.
- Resolution is fail-closed. A missing identity or resolver never falls back to the user who last
  saved the workflow.
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
  --serverConfigSet cps_local
```

The stack starts origin and linked Elasticsearch projects that share the same UIAM service.
An identity that performs CPS must have assignments for both projects: the origin authorizes the
request before applying `project_routing`, and the linked project authorizes the routed search.

Run the API test against the started stack:

```bash
npx playwright test \
  x-pack/platform/plugins/shared/execution_identity/test/scout_cps_local/api/tests/execution_identity_cps.spec.ts \
  --config x-pack/platform/plugins/shared/execution_identity/test/scout_cps_local/api/playwright.config.ts \
  --project=local
```

## PoC limitations

- This is a Kibana abstraction over a UIAM API key, not a native UIAM service-account principal.
- The management form creates one project-type assignment at a time; the backend contract supports
  multiple assignments.
- Credential rotation, editing, role discovery, and per-service-account usage ACLs are not included.
- The implementation is Serverless-only because stateful deployments do not have UIAM.
- End-to-end CPS verification requires a locally built UIAM image containing the corresponding
  `_grant` API changes.
