# Execution identity insights

## The architectural boundary

The current execution identity is a **Kibana service account implemented on top of UIAM API
keys**, not a native UIAM service account.

UIAM remains the authorization authority for each API key:

- UIAM authenticates the user requesting a key.
- UIAM verifies that the user may delegate the requested project and application roles.
- UIAM generates the credential and stores its immutable assignments.
- UIAM validates the credential when it is used.

Kibana owns the service-account abstraction:

- The stable service-account ID and its space binding.
- The mapping from that ID to a UIAM API key.
- Encrypted storage and runtime resolution of the credential.
- Rotation, deletion, and workflow binding.

UIAM therefore sees an update as “grant key K2, then revoke key K1.” It does not know that K1
and K2 represent successive credentials for the same service account.

## Primitives added by this PoC

The service-account implementation adds three UIAM capabilities:

1. `POST /api-keys/_delegable_roles` discovers application roles that the caller may grant across
   the requested projects. The result is advisory and exists to power autocomplete; `_grant`
   remains the final enforcement point.
2. A delegated key can persist an optional use trust policy. `allowed_role_assignments` is the
   product path: callers must cover every trusted project-role assignment. The earlier
   `allowed_user_ids` representation remains readable for PoC compatibility but is no longer
   exposed by the UI.
3. `POST /api-keys/{id}/_can_use` authorizes both human and API-key principals. Human callers enable
   user-to-service-account delegation; API-key callers enable service-account-to-service-account
   switching in nested workflows.

The policy is an `actAs`-style authorization for Kibana-mediated use. It does not reveal the key,
permit rotation, edit the policy, or grant management of the service-account saved object.

The UI intentionally exposes trust policy only for custom-role identities:

- Built-in identities need no policy UI. `_can_use` applies UIAM's role containment directly.
- Custom identities default to exact-role containment because UIAM treats unknown custom role
  names as opaque.
- An administrator can enable **Allow principals with additional project roles** and select one or
  more minimum role requirements. A human or API-key caller must cover all selected requirements.

For example, a `workflow_logs_reader` identity may trust `editor`. Editors, admins that cover
editor, and service-account API keys carrying editor can switch to the identity. A viewer cannot.

The PoC does **not** add a reusable “published workload role” primitive. Such a primitive would let
an administrator approve a custom role for selected principals to assign to service accounts they
create themselves. Here, the administrator creates the custom-role service account and delegates
use of that ready-made identity to callers holding approved roles.

## Built-in and custom application roles

Built-in roles are owned by UIAM:

- UIAM enumerates them from its application-role mappings.
- `RoleAssignmentAuthorityChecker` compares their registered actions and understands hierarchy,
  such as `admin` covering `viewer`.
- The discovery response includes only roles covered on every requested project.

Custom roles are owned by the project application and Elasticsearch:

- Kibana reads candidate names from the current project's Elasticsearch role catalog.
- UIAM does not receive or interpret Elasticsearch role descriptors.
- A project `admin` may delegate an existing custom-role candidate because project admins already
  control that project's role definitions.
- A non-admin may delegate a custom role only when the caller holds the exact role name. Semantic
  containment of arbitrary Elasticsearch descriptors requires a future Elasticsearch authorization
  primitive.
- The PoC UI initially offers custom roles only for a single project. Matching names in two projects
  do not prove matching semantics, so the PoC does not approximate CPS custom-role intersection by
  name.

This makes the different paths explicit: built-in roles support self-service downscoping through
known hierarchy, while custom roles support an administrator-created, explicitly shared identity.

## Existing Cloud and UIAM custom-role behavior

The Cloud UI and the underlying UIAM role-assignment API have different capabilities. This behavior
predates the execution-identity PoC:

- The Cloud UI lists custom roles only under **Assign for each resource**. It reads candidates from
  one selected project's Elasticsearch role catalog and can therefore validate that the role exists
  in that project.
- The UIAM role-assignment API also supports putting a custom role name in `application_roles` on an
  unscoped/all-project assignment. One assignment then applies that name to current and future
  projects of the selected type.
- UIAM treats the custom role as an opaque name. If a project does not define that role,
  Elasticsearch grants no privileges from it in that project; assigning an unknown role name does
  not create the role or fail authentication.
- If every project consistently defines the same role name, the all-project API assignment works as
  one role mapping. UIAM does not verify that the descriptors are present or equivalent.
- UIAM API-key assignments are immutable, but the Elasticsearch role definitions referenced by
  those assignments are mutable. Editing or deleting the role can therefore change or remove the
  effective permissions of existing keys and long-running jobs.

Therefore, the absence of custom roles from Cloud's **Assign to all** picker is a UX and validation
choice, not a hard UIAM API limitation. It avoids asking a user to type an unchecked role name and
avoids implying that Cloud centrally owns or distributes the role definition.

## PoC decision and remaining custom-role gaps

The current PoC deliberately chooses the conservative product path:

- Single-project identity: offer built-in and custom roles.
- Cross-project identity: offer centrally known built-in roles only.
- Administrator-delegated custom identity: use a project-role trust policy to define which human
  or API-key principals may exercise the ready-made identity.

This restriction is about making the semantics understandable, not about claiming that UIAM cannot
carry a custom role across projects. Before treating custom roles as CPS-compatible, the product
must choose one of these models:

1. **Unchecked shared name** — assign one custom role name to all selected projects and document that
   administrators must provision the same definition everywhere. Missing roles grant no privileges,
   and differing definitions produce differing access.
2. **Per-project assignments** — select and validate roles independently for each project, for
   example `workflow_logs_reader` in project A and `viewer` in project B. This is the safest
   near-term UX.
3. **Global custom role** — UIAM owns a reusable organization-level role or template and governs how
   its policy is made effective across projects. This is the cleanest long-term model.

The current UI disables cross-project scope as soon as a custom role is selected, and the server
independently rejects a multi-project custom-role request. The restriction is therefore not merely
an autocomplete behavior.

## Role-based trust-policy UX

Raw UIAM user IDs are not a viable product interface, and a people picker would require a complete
organization directory that Kibana does not currently have. Role-based delegation avoids that
identity-discovery dependency and follows the trust-policy model used by cloud IAM products.

The service-account flyout therefore follows these rules:

- Built-in identities show no “who can run” control. Role containment determines use automatically.
- Selecting a custom role forces single-project scope.
- The default custom-role policy allows organization administrators and principals that already
  hold the exact custom role.
- An administrator may opt into additional delegation and select trusted project roles from the
  same UIAM-backed role autocomplete.
- The text states that delegated roles can exercise every permission of the target identity through
  workflows. Use still does not imply manage, rotate, reveal-secret, or edit-policy.

The current policy is a conjunction: a caller must cover all selected role assignments. A future
policy language could support multiple alternative statements, conditions, or workload audiences,
but those are intentionally not new primitives in this PoC.

## External roadmap and discussions

As of July 2026, the foundational Serverless custom-role feature is delivered, but the following
improvements do not have a committed delivery date:

- [Assign a custom role to all Serverless projects](https://github.com/elastic/enhancements/issues/28726)
  is an open customer request for users and API keys across current and future projects.
- [Global custom-role MVP](https://github.com/elastic/cp-iam-team/issues/173) tracks broader reuse,
  while explicitly noting that “assign to all” is missing from the current UI.
- [Use predefined roles as custom-role templates](https://github.com/elastic/kibana/issues/188888)
  is open.
- [Query custom roles across multiple projects](https://github.com/elastic/kibana/issues/182602) is
  open; it improves discovery efficiency but does not prove descriptor equivalence.
- [Project-centric user and role management](https://github.com/elastic/cp-iam-team/issues/113) is
  open and would be relevant if a future product reintroduces per-person trust statements.

Slack discussions clarify the intended architecture and current uncertainty:

- The [Assign to all discussion](https://elastic.slack.com/archives/C045BMYS12M/p1782375469638739)
  confirms that the API supports a custom role across all projects as one mapping and that exposing
  it in the UI is considered an enhancement request.
- The [unscoped custom-role discussion](https://elastic.slack.com/archives/C08J6934AUE/p1759334404423499)
  explains that the UI validates per-project roles, while the API accepts an all-project role name;
  projects missing the role grant no privileges.
- The [UIAM/CPS design discussion](https://elastic.slack.com/archives/C080DB7966Q/p1752135624876599)
  chose `application_roles` on all scopes as an interim capability compatible with a future
  flexible global-custom-role model, whose final shape and timing were explicitly unknown.
- The [FY27 planning discussion](https://elastic.slack.com/archives/C09NZ90112B/p1769797308810079)
  treats global custom roles as strategically useful for unified permissions and Kibana Spaces, but
  also records unresolved prioritization. It should not be treated as a committed roadmap.
- The [long-running-job discussion](https://elastic.slack.com/archives/C080DB7966Q/p1739951545569969)
  documents the mutable-role-reference behavior and accepts it as an interim trade-off until
  Stack-level policy management is lifted into UIAM.

## Authorization stages

Creation, binding, and execution are separate decisions:

1. **Creation (`_grant`)** — UIAM verifies that the creator may assign every requested project and
   application role. This is the privilege-escalation boundary for creating the key.
2. **Binding and interactive use (`_can_use`)** — UIAM checks identity-role containment or the
   explicit `allowed_role_assignments` trust policy. Kibana calls this before binding
   `settings.run_as` and before user-initiated use.
3. **Nested identity switch (`_can_use`)** — when a child workflow declares a different `run_as`,
   UIAM evaluates the parent service-account API key as the caller. Kibana switches to the child
   credential only after approval.
4. **Execution (API-key authentication)** — UIAM authenticates the stored key and applies its
   immutable roles. It does not know the original human user, workflow, or binding.

An explicit trust policy intentionally lets a less-privileged human or service account exercise a
stronger identity when an authorized administrator delegates it. That is authorized delegation,
not an accidental privilege escalation. Permission to use an identity remains separate from
permission to manage it.

## Runtime and rotation model

Task Manager persists only `{ id, spaceId }`. At execution time, Kibana resolves that reference,
decrypts the current UIAM API key, and creates a synthetic request with its `Authorization` header.
The browser session cookie is not persisted or used for background execution.

Nested workflows normally inherit that synthetic request. If a child definition contains its own
`settings.run_as`, the execution engine invokes a request resolver registered by workflows
management. That resolver calls `_can_use` with the parent's API-key-authenticated request, resolves
the child credential only on success, and passes the switched request to both synchronous and
asynchronous child execution. The execution engine remains independent of execution-identity
storage and UIAM; it depends only on the generic resolver contract.

Updating permissions rotates the credential:

1. The updater authenticates to Kibana.
2. Kibana asks UIAM to grant a new key with the requested assignments.
3. UIAM authorizes the grant against the updater's current authority.
4. Kibana replaces the encrypted credential behind the stable service-account ID.
5. Kibana revokes the previous key.
6. Subsequent executions resolve the same ID to the replacement key.

This gives workflows mutable service-account permissions while UIAM API key permissions remain
immutable.

The grant, saved-object update, and revocation span two systems and are not one distributed
transaction. A failed saved-object update requires cleanup of the new key; a failed old-key
revocation requires durable retry. Updating during an active execution may also invalidate the
credential already held by that execution.

## Security implications

Kibana is a trusted credential broker and lifecycle authority in this model. Compromise of the
Kibana process, its encryption key plus saved-object storage, or code with equivalent internal
access can expose or misuse service-account credentials.

This does **not** mean that Kibana can invent arbitrary UIAM permissions. UIAM still authorizes
every grant and enforces every key. The trust delegated to Kibana is custody of the key and the
claim that a stable Kibana ID represents whichever UIAM key is currently stored behind it.

The current model is reasonable when Kibana is accepted as that trust boundary. It is not
equivalent to a centrally managed workload identity.

The role trust policy does not introduce a new runtime trust boundary. The raw key was already
stored and used by Kibana. It does add a security-sensitive delegation surface, so the
implementation must preserve these invariants:

- `_grant` authorizes every role before a policy can be attached.
- Trust assignments are organization- and project-scoped UIAM role assignments, not unchecked
  display labels.
- `use` does not imply manage, rotate, reveal-secret, or edit-policy.
- Kibana checks `_can_use` on every binding, interactive execution, and nested identity-switch path.
- Grants, policy changes, bindings, denials, rotations, and revocations are auditable.

The policy cannot provide actor-aware enforcement after Kibana presents the raw API key. A leaked
key is authenticated as the key itself, and a scheduled top-level workflow represents a previously
authorized durable binding rather than a live human session. Nested identity switches are
actor-aware because the current parent API key is presented to `_can_use`. The raw-key limitation
is the original, known PoC boundary—not a new limitation caused by custom roles or the trust
policy.

## End-to-end flows

### Built-in self-service downscoping

1. An `admin` or `editor` opens the service-account flyout.
2. Kibana asks UIAM for roles delegable across the selected projects.
3. UIAM returns covered built-ins, for example `viewer`.
4. The user creates the identity; `_grant` independently verifies the same assignment.
5. The workflow executes with the immutable permissions of the resulting key.

Reversing the hierarchy is denied: a `viewer` does not discover or successfully grant `admin`.

### Administrator-delegated custom role

1. An administrator creates `workflow_logs_reader` in the project role catalog.
2. The flyout sends that name as a custom candidate to `_delegable_roles`.
3. UIAM returns it as `custom` for a project administrator.
4. The administrator creates a service account with that role and optionally trusts `editor`.
5. An editor may bind and manually run a workflow with that identity even without personally
   holding `workflow_logs_reader`.
6. A viewer receives `role_policy_not_covered` from `_can_use`.

The editor cannot manage the service account solely because they can use it.

### Service-account-to-service-account switch

1. A parent workflow runs as service account A.
2. A `workflow.execute` or `workflow.executeAsync` step loads child workflow B.
3. B declares `settings.run_as: <service-account-B>`.
4. The generic execution-request resolver asks `_can_use` whether A's API-key principal may use B.
5. UIAM compares A's persisted role assignments with B's `allowed_role_assignments`.
6. On success Kibana resolves B's encrypted credential and starts the child with B's request. On
   denial, the step fails before child execution starts.

For example, B may hold `workflow_logs_reader` and trust `editor`; A carrying `editor` can switch,
while A carrying only `viewer` cannot.

### Edit, rotation, and revocation

1. The updater selects new identity roles, projects, or trusted caller roles.
2. UIAM authorizes and grants a replacement key containing the new assignments and policy.
3. Kibana atomically swaps the encrypted credential behind the stable service-account ID.
4. Kibana revokes the previous key.
5. Future resolutions of that stable ID use the replacement key.

Removing a trusted role denies new bindings, interactive use, and future nested switches by
principals that depended on that role. Existing scheduled top-level bindings remain within the
known Kibana trust boundary because runtime API-key authentication has no original human actor
context. Deleting the service account revokes its key and removes the stable reference.

### Cross-project search

For built-ins, Kibana groups selected projects by type and intersects the per-scope discovery
results. `_grant` then verifies every assignment. Custom-role identities remain single-project:
the UI disables CPS and the server rejects a multi-project custom-role assignment because role-name
equality across projects is not a semantic proof.

## Boundary of a native UIAM service account

If we want to remove Kibana as the credential-lifecycle and service-account policy boundary, the
service account must become a first-class UIAM resource. UIAM would own:

- A stable organization-scoped service-account ID.
- Project and application-role assignments.
- Update authorization, enable/disable state, and deletion.
- Credential versioning, revocation, and audit history.
- Issuance of short-lived runtime credentials.

Kibana and Task Manager would persist only the UIAM service-account ID. At execution time, Kibana
would authenticate as an approved workload and exchange that reference for a short-lived token.
Permission updates in UIAM would then affect future token issuance without Kibana rotating or
storing a long-lived service-account secret.

A complete native flow is:

1. UIAM owns a stable service account, its assignments, use policy, and credential lifecycle.
2. Binding creates an authorization capability scoped to the service account, Kibana workload, and
   workflow.
3. At execution time Kibana exchanges that capability for a short-lived credential.
4. UIAM evaluates current policy and revocation during the exchange.
5. Kibana and Task Manager persist only service-account references or binding capabilities.

This can also be implemented as a general actor-bound delegation/exchange primitive, but a native
service account is the clearest product resource.

Kibana would still be a trusted execution environment: a compromised Kibana process could use
tokens available to that workload. The improvement is narrower and important—UIAM, rather than
Kibana, becomes the authoritative identity lifecycle, policy, and credential-issuance boundary.

## Reusable primitives

The primitives introduced by this PoC remain useful in a native UIAM design:

- Workflow `run_as` stores a stable identity reference.
- Task Manager resolves identities at execution time and fails closed.
- Tasks do not persist execution credentials.
- Fake requests carry the resolved authorization context.

The resolver implementation would change from decrypting a Kibana-managed API key to requesting a
short-lived UIAM token for a native service account.
