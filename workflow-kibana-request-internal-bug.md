# [Bug] [One Workflow] - `kibana.request` step uses external URL instead of internal routing, failing behind Okta/SSO proxies

## Problem

When using the `kibana.request` workflow step to call Kibana APIs, the request is routed through the **public/external Kibana URL** rather than internally. This causes failures in environments where Kibana is behind an authentication proxy (e.g., Okta, SAML SSO) because the workflow cannot authenticate with the proxy.

## Root Cause

The `kibana.request` step implementation in `kibana_action_step.ts` constructs an external HTTP request using the public Kibana URL:

```typescript
// kibana_action_step.ts
private getKibanaUrl(): string {
  const coreStart = this.stepExecutionRuntime.contextManager.getCoreStart();
  const { cloudSetup } = this.stepExecutionRuntime.contextManager.getDependencies();
  return getKibanaUrl(coreStart, cloudSetup);
}
```

The `getKibanaUrl` function returns the **public base URL**:

```typescript
export function getKibanaUrl(coreStart?: CoreStart, cloudSetup?: CloudSetup): string {
  if (coreStart?.http?.basePath?.publicBaseUrl) {
    return coreStart.http.basePath.publicBaseUrl;  // External URL
  }
  if (cloudSetup?.kibanaUrl) {
    return cloudSetup.kibanaUrl;  // Cloud external URL
  }
  // ... fallback to localhost
}
```

The step then uses Node.js `fetch()` to make an external HTTP request:

```typescript
let fullUrl = `${kibanaUrl}${path}`;
const response = await fetch(fullUrl, fetchOptions);
```

This request goes **out over the network** to the public URL. In the user's environment:
- The public Kibana URL goes through **Nginx**
- Nginx handles authentication (Okta/SSO)
- Nginx expects either a valid SSO session OR an `Authorization` header to bypass auth
- The workflow request doesn't have the right auth header format that Nginx expects, so Nginx rejects it

**Key insight from the user**: The workflow *does* include an `Authorization` header (API key from Task Manager), but Nginx may not be configured to recognize/accept this format, or the header isn't being passed correctly through the proxy.

## Expected Behavior

In Dev Tools, using `kbn:/api/some-endpoint` routes the request **internally** through Kibana's HTTP client, which:
- Automatically inherits the user's session authentication
- Never leaves the Kibana process for internal routing
- Bypasses external authentication proxies

The `kibana.request` step should have an option to behave similarly - routing internally rather than making an external HTTP call.

## Impact

- **Workflows cannot call Kibana APIs** in environments behind Okta, SAML, or other SSO proxies
- Users must expose a separate non-authenticated API endpoint and manage credentials manually
- Limits workflow functionality in enterprise/secure deployments

## Reproduction

1. Deploy Kibana behind an Okta (or similar SSO) proxy
2. Create a workflow with a `kibana.request` step:
   ```yaml
   steps:
     - name: call-agent
       type: kibana.request
       with:
         method: "POST"
         path: "/api/agent_builder/converse"
         body:
           message: "Hello"
   ```
3. Execute the workflow
4. Observe authentication failure due to Okta redirect

## Proposed Solutions

### Option 1: Add `internal: true` option (recommended)

Add an option to route the request through Kibana's internal HTTP service instead of making an external HTTP call:

```yaml
steps:
  - name: call-agent
    type: kibana.request
    with:
      internal: true  # Route internally, bypass external URL/proxy
      method: "POST"
      path: "/api/agent_builder/converse"
```

When `internal: true`:
- Use Kibana's internal router or localhost with internal port
- Authenticate using the workflow's execution context (API key from Task Manager)
- Never hit the external proxy (Nginx/Okta)

### Option 2: Kibana configuration for internal URL

Add a Kibana configuration option to specify an internal/localhost URL for workflow `kibana.request` steps:

```yaml
# kibana.yml
xpack.workflow.kibanaInternalUrl: "http://localhost:5601"
```

### Option 3: Use localhost by default for self-requests

Change `getKibanaUrl()` to return `localhost` when making requests from the server-side workflow engine, since the request originates from the same Kibana instance.

### User-side workaround (immediate)

Configure Nginx to accept/pass-through the `Authorization: ApiKey ...` header that workflows use. This would allow the existing workflow auth to work through the proxy.

## Workaround

Currently, users can:
1. **Configure Nginx to accept the Authorization header** - Allow requests with `Authorization: ApiKey ...` header to bypass Okta/SSO authentication
2. Expose a separate API endpoint without SSO protection
3. Store credentials/API keys in the workflow and authenticate manually
4. Configure a network path that bypasses the SSO proxy (not always possible)

## Related

- Similar to how `elasticsearch.request` uses the internal ES client directly rather than making external HTTP calls
- Dev Tools `kbn:/` prefix demonstrates the internal routing pattern

## Additional Context

From the reporter's team:
> "The configured main URL is going through nginx (and nginx is doing the auth) so it probably misses something when kibana executes the request"

> "The only thing that would bypass Nginx is if the request has the Auth header." - Christopher Cutajar

The workflow does send an `Authorization` header with the API key from Task Manager, but Nginx may not be configured to recognize this format for auth bypass.

## Reporter

Julien Lavesque, Christopher Cutajar (Elastic InfoSec SIEM team)
