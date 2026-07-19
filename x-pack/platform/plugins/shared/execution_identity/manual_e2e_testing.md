# Execution identity manual E2E testing

This guide verifies the UIAM-backed execution-identity PoC against the local CPS stack at
<http://localhost:5620>.

The demo data is ephemeral. Starting a new Scout stack recreates Elasticsearch and requires
re-seeding the identities, workflows, role, and documents.

## Seeded projects and data

- Origin project: `abcdef12345678901234567890123456`
- Linked project: `1234567890abcdef1234567890abcdef`
- Data stream: `logs-execution-identity-e2e`
- Origin document marker: `origin-project`
- Linked document marker: `linked-project`
- Custom Elasticsearch role: `workflow_logs_reader`
  - `read` and `view_index_metadata` on `logs-execution-identity-e2e`

## Seeded service accounts

- `demo-viewer-origin`
  - ID: `5667212c-130a-4864-b5a4-dfb21deccc03`
  - Origin project, built-in `viewer`
- `demo-admin-origin`
  - ID: `c41e7f09-28ac-4d13-ad7e-f504037ed977`
  - Origin project, built-in `admin`
- `demo-viewer-cps`
  - ID: `3084efe0-a629-4981-9dec-a6b09947bb6b`
  - Origin and linked projects, built-in `viewer`
- `demo-parent-editor`
  - ID: `23cc4386-a05a-4198-a694-cd1add2e2748`
  - Origin project, built-in `editor`
- `demo-custom-reader-editor-trust`
  - ID: `896700c2-12fc-48d6-9dcc-5bb23c9d9fcb`
  - Custom `workflow_logs_reader`
  - Trusted callers must cover `editor`
- `demo-custom-reader-admin-trust`
  - ID: `19a666f1-23d3-466e-8825-f70edbe44bc7`
  - Custom `workflow_logs_reader`
  - Trusted callers must cover `admin`
- `demo-custom-reader-exact-holder`
  - ID: `3f05e0b1-ee67-4305-95a0-870832b9b025`
  - Custom `workflow_logs_reader`
  - No additional delegation policy; callers must cover the identity role itself

The service accounts are visible under **Stack Management → Security → Service accounts**.

## Flow 1: compare admin and viewer permissions

First run:

<http://localhost:5620/app/workflows/demo-1-admin-baseline-write>

Expected:

1. `read_origin` returns the origin document.
2. `write_allowed` creates a document whose marker is `admin-write-succeeded`.
3. The execution identity is
   `service_account:c41e7f09-28ac-4d13-ad7e-f504037ed977`.

The write uses a fixed document ID, so a second run can receive a version-conflict response.

Then run:

<http://localhost:5620/app/workflows/demo-2-viewer-read-and-denied-write>

Expected:

1. `read_origin` succeeds and includes `origin-project`.
2. `write_denied` records an Elasticsearch authorization error for the `viewer` role.
3. The workflow continues because the step has `on-failure.continue: true`.
4. No document with marker `this-must-not-be-created` is written.
5. The execution identity is
   `service_account:5667212c-130a-4864-b5a4-dfb21deccc03`.

This proves downscoping through observable allowed and denied operations, rather than merely
displaying the service-account role.

## Flow 2: compare two-project and one-project CPS

Run the two-project workflow:

<http://localhost:5620/app/workflows/demo-3-cps-both-projects>

Expected `search_both_projects` output:

- A hit containing `origin-project`
- A hit containing `linked-project`

The request uses `project_routing: _alias:*`, and the selected identity has `viewer` on both
projects.

Then run the same search with an origin-only identity:

<http://localhost:5620/app/workflows/demo-4-cps-origin-only>

Expected `search_accessible_projects` output:

- A hit containing `origin-project`
- No hit containing `linked-project`

The workflow definition is equivalent except for `settings.run_as`.

## Flow 3: human-to-service-account role delegation

The target identity has custom role `workflow_logs_reader` but trusts callers covering `editor`.

1. Sign out.
2. On the mock identity-provider page, select only `editor`.
3. Open:
   <http://localhost:5620/app/workflows/demo-5-human-editor-delegated-custom-reader>
4. Run the workflow.

Expected:

- Save and Run are enabled.
- The search succeeds and contains `origin-project`.
- The execution identity is
  `service_account:896700c2-12fc-48d6-9dcc-5bb23c9d9fcb`.
- The editor exercised the custom reader identity because UIAM returned
  `explicit_role_policy`, not because the editor held `workflow_logs_reader`.

Negative check:

1. Sign out and select only `viewer`.
2. Open the same workflow.

Expected:

- The workflow becomes read-only.
- Save and Run are disabled with an execution-identity authorization warning.
- A direct save or run request is rejected with `403`.

## Flow 4: allowed service-account-to-service-account switch

Open and run:

<http://localhost:5620/app/workflows/demo-6b-editor-parent-allowed-to-switch>

The parent runs as `demo-parent-editor` and invokes:

<http://localhost:5620/app/workflows/demo-6a-child-trusts-editor-parent>

Expected:

1. The parent starts as
   `service_account:23cc4386-a05a-4198-a694-cd1add2e2748`.
2. The child declares `demo-custom-reader-editor-trust` in `settings.run_as`.
3. UIAM evaluates the parent API-key principal against the child's trusted `editor` assignment.
4. The switch succeeds.
5. `child_read` returns `origin-project` under
   `service_account:896700c2-12fc-48d6-9dcc-5bb23c9d9fcb`.

Inspect the parent execution's child executions to confirm the two distinct execution identities.

## Flow 5: denied service-account-to-service-account switch

Open and run:

<http://localhost:5620/app/workflows/demo-7b-editor-parent-denied-child-switch>

The parent again runs as `demo-parent-editor`, but invokes:

<http://localhost:5620/app/workflows/demo-7a-child-trusts-admin-only>

Expected:

1. UIAM compares the parent `editor` API-key principal with the child's trusted `admin`
   assignment.
2. The comparison returns `role_policy_not_covered`.
3. `run_denied_child` fails before `child_read` starts.
4. No child execution performs the Elasticsearch search.

This is the critical source-identity check: the organization administrator who originally started
the parent does not authorize the nested switch. The current parent service account is the source
principal.

## Flow 6: custom-role CPS guard

1. Open the service-account creation flyout.
2. Select the custom role `workflow_logs_reader`.

Expected:

- Cross-project scope is disabled.
- The explanation states that custom roles are resolved by one Elasticsearch project.
- A direct API request assigning this custom role to both project IDs returns `400`.

Built-in roles such as `viewer`, `editor`, and `admin` remain available for CPS identities.

## Flow 7: exact custom-role holder

The mock UIAM user `67890` (`Custom Reader User`) has both `editor` and
`workflow_logs_reader`. `editor` grants access to execute workflows in Kibana, while
`workflow_logs_reader` covers the service account's custom role.

Open and run:

<http://localhost:5620/app/workflows/demo-8-exact-custom-role-holder>

Expected:

1. UIAM permits the identity with reason `role_assignments_covered`, not
   `explicit_role_policy`.
2. `custom_role_read` succeeds and returns the document containing `origin-project`.
3. `arbitrary_index_read_denied` receives an Elasticsearch authorization error because the role
   grants no access to `arbitrary-private-index`.
4. `custom_role_write_denied` receives an Elasticsearch authorization error because
   `workflow_logs_reader` has no write privilege.
5. The overall workflow completes because both denied steps use `on-failure.continue: true`.
6. The execution identity is
   `service_account:3f05e0b1-ee67-4305-95a0-870832b9b025`.

Verified execution:

<http://localhost:5620/app/workflows/demo-8-exact-custom-role-holder?executionId=c88d488a-0e3e-420b-ae30-4e4ec597b27f&tab=executions>

For the negative comparison, sign in as `editor` without `workflow_logs_reader`. Kibana workflow
execution remains available, but UIAM denies use of this identity because the caller does not cover
its custom role.

## What each flow proves

- Flow 1: immutable API-key downscoping controls effective Elasticsearch operations.
- Flow 2: project assignments control CPS result visibility.
- Flow 3: a role trust policy authorizes human `actAs` use without granting identity management.
- Flow 4: a parent service-account API key can authorize a nested identity switch.
- Flow 5: nested switching fails closed when the source identity does not cover the target policy.
- Flow 6: custom role names are not treated as semantically equivalent across projects.
- Flow 7: holding the exact custom role authorizes identity use without an explicit trust policy,
  while the service account remains downscoped to that role's Elasticsearch privileges.
