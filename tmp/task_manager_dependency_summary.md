# Task Manager Plugin - Dependency Analysis

## Overview
- **Total internal modules**: 238 files
- **Total internal dependencies**: 572 connections

## External Dependencies (NPM packages)

### Heavy Dependencies (most imported)
| Package | Import Count | Notes |
|---------|--------------|-------|
| rxjs | 103 | Reactive programming - heavily used |
| lodash | 46 | Utility library |
| uuid | 24 | UUID generation |
| sinon | 14 | Test mocking (test-only) |
| @elastic/elasticsearch | 12 | ES client |
| elastic-apm-node | 10 | APM instrumentation |
| moment | 6 | Date handling |
| stats-lite | 6 | Statistics |
| fp-ts/Option | 7 | Functional programming |
| utility-types | 2 | TypeScript utilities |
| murmurhash | 2 | Hashing |
| p-map | 1 | Promise utilities |
| deepmerge | 1 | Object merging |
| minimatch | 1 | Glob matching |

### @kbn/* Internal Dependencies
| Package | Import Count |
|---------|--------------|
| @kbn/core/server | 87 |
| @kbn/core/server/mocks | 43 |
| @kbn/config-schema | 23 |
| @kbn/utility-types | 20 |
| @kbn/rrule | 7 |
| @kbn/encrypted-saved-objects-shared | 7 |
| @kbn/usage-collection-plugin/server | 6 |
| @kbn/logging | 6 |
| @kbn/safer-lodash-set | 5 |
| @kbn/security-plugin-types-server | 3 |
| @kbn/licensing-plugin/server/mocks | 3 |
| @kbn/core-saved-objects-* | 9+ |

## Most Connected Internal Modules
1. `server/plugin.ts` - 24 dependencies (main entry point)
2. `server/polling_lifecycle.ts` - 13 dependencies
3. `server/task_running/task_runner.ts` - 12 dependencies
4. `server/task_claimers/strategy_mget.ts` - 12 dependencies
5. `server/task_store.ts` - 11 dependencies

## Module Distribution
| Directory | File Count |
|-----------|------------|
| server/lib | 58 |
| server (root) | 30 |
| server/metrics | 26 |
| server/saved_objects | 18 |
| server/monitoring | 15 |
| server/invalidate_api_keys | 13 |
| server/task_pool | 12 |
| server/queries | 11 |
| server/integration_tests | 11 |
| server/task_claimers | 8 |
| server/routes | 8 |
| server/kibana_discovery_service | 6 |

## Tree-Shaking Opportunities

### Potential Issues:
1. **rxjs (103 imports)** - Check if using barrel imports vs specific operators
2. **lodash (46 imports)** - Should use `lodash/method` instead of `lodash`
3. **moment (6 imports)** - Consider date-fns or native Intl APIs
4. **fp-ts usage** - Using specific imports (good)

### Recommendations:
1. Audit `lodash` imports - switch to `import get from 'lodash/get'` pattern
2. Review `rxjs` imports for optimal tree-shaking
3. Consider lazy loading for `elastic-apm-node` if not always needed

---

## Important Note: Server-Only Plugin

**Task Manager is a server-side only plugin** - it has no `public/` folder and therefore:
- No client-side webpack bundles are generated
- The `--profile` build produces no output for this plugin
- Bundle size analysis via webpack-bundle-analyzer is not applicable

For server-side code, tree-shaking opportunities are primarily about:
1. Reducing startup time by lazy-loading modules
2. Avoiding pulling in large dependencies that aren't always used
3. Keeping the overall server-side code footprint small

### Server-Side Dependencies Analysis

The key dependencies to audit for server-side optimization:

| Dependency | Size Impact | Recommendation |
|------------|-------------|----------------|
| rxjs | Medium | Check operator imports |
| lodash | Medium | Use specific imports |
| moment | High (~300KB) | Consider lighter alternatives |
| elastic-apm-node | High | Already conditionally loaded |
| @elastic/elasticsearch | Large but required | N/A |
