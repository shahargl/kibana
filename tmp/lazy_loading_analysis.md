# Kibana Memory Optimization: Lazy Loading Analysis

## The Fundamental Problem

When Node.js loads a module via `require()` or `import`, **all top-level code executes immediately**:

```typescript
// This ALL runs at require() time, NOT when used:
export const configSchema = schema.object({...});  // Schema object created
export const routes = router.get({...});           // Route registered
export const types = [...];                        // Array allocated
export { helper } from './heavy-module';           // Heavy module loaded!
```

This means:
- **~450MB** of memory is consumed during plugin discovery
- Even **disabled plugins** consume memory (their code is loaded to check config)
- Heavy dependencies are loaded even if never used

## Current State

| Category | Memory | Description |
|----------|--------|-------------|
| Plugin code loading (init) | ~451MB | All plugin server/index.ts files |
| Plugin setup execution | ~312MB | Runtime setup logic |
| Core services | ~100MB | Elasticsearch, HTTP, etc. |
| Node.js baseline | ~50MB | V8, libuv, etc. |
| **Total** | **~900MB+** | Minimum Kibana memory |

## Why This Happens

82 plugins have **eager re-exports** like:
```typescript
// transform/server/index.ts
export { registerTransformHealthRuleType } from './lib/alerting';
// ↑ This loads @kbn/alerting-plugin + 100 transitive dependencies
// Even though it's just exporting a function!
```

## Solution Options

### Option 1: Runtime Require Hook (Experimental)
**Created:** `scripts/lazy_require_hook.js`

```bash
node -r ./scripts/lazy_require_hook.js scripts/kibana --dev
```

- Intercepts `require()` and returns Proxy objects
- Only loads module when export is accessed
- **Potential savings:** ~200-300MB
- **Risk:** May break `instanceof`, spread operations

### Option 2: Build-Time Transformation (Babel Plugin)
Transform at compile time:

```typescript
// Before
export { helper } from './heavy';

// After  
let _helper;
export const helper = new Proxy(() => {}, {
  apply(target, thisArg, args) {
    if (!_helper) _helper = require('./heavy').helper;
    return _helper.apply(thisArg, args);
  }
});
```

- **Potential savings:** ~200-300MB
- **Risk:** Complex implementation, type issues

### Option 3: Plugin Refactoring (Recommended)
Manually fix the top 20 memory consumers:

1. Remove eager re-exports from `index.ts`
2. Use dynamic `import()` for heavy dependencies
3. Separate config schemas into standalone files
4. Use factory functions instead of top-level registration

**Example fix for transform:**
```typescript
// BEFORE (index.ts)
export { registerTransformHealthRuleType } from './lib/alerting';

// AFTER (index.ts) - Remove this line entirely
// Move to plugin.ts:
async setup() {
  const { registerTransformHealthRuleType } = await import('./lib/alerting');
  registerTransformHealthRuleType(...);
}
```

### Option 4: V8 Isolates / Worker Threads
Load plugins in separate V8 isolates:

- Each plugin runs in isolated memory
- Only communicate via messages
- **Potential savings:** Massive (pay-per-use)
- **Risk:** Major architecture change

## Recommended Action Plan

### Phase 1: Quick Wins (1-2 weeks)
1. Fix top 10 memory consumers manually:
   - transform (167MB)
   - data (52MB) 
   - alerting (45MB)
   - security (40MB)
   - ml (35MB)

2. Add lint rule to prevent eager re-exports:
   ```
   // eslint-plugin-kibana: no-eager-reexport
   export { x } from './y'; // ERROR: Use lazy export
   ```

### Phase 2: Systematic Fix (1-2 months)
1. Create codemod to transform eager re-exports
2. Run codemod on all 82 affected plugins
3. Test for regressions

### Phase 3: Architecture (long-term)
1. Evaluate V8 isolates for plugin isolation
2. Consider module federation for browser-style lazy loading
3. Explore ESM with top-level await for truly lazy modules

## Test the Lazy Hook

```bash
# With lazy loading
KIBANA_LAZY_VERBOSE=true node -r ./scripts/lazy_require_hook.js scripts/kibana --dev

# Without (baseline)
KIBANA_LAZY_LOAD=false node -r ./scripts/lazy_require_hook.js scripts/kibana --dev
```

Compare memory usage and check for errors.

## Files Created

1. `scripts/lazy_require_hook.js` - Runtime lazy loading experiment
2. `scripts/analyze_lazy_loading.js` - Analyze plugin patterns
3. `scripts/lazy_transform_poc.js` - Show transformation approach
4. `src/core/packages/plugins/server-internal/src/lazy_plugin_loader.ts` - Plugin loader utilities
