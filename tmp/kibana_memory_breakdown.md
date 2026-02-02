# Kibana Memory Breakdown - Full Analysis with Proof

## Executive Summary

| Category | Size | % of Total | Source |
|----------|------|------------|--------|
| **Total RSS** | **1,538 MB** | 100% | `ps -o rss` |
| V8 Heap (allocated) | 1,222 MB | 79% | CDP `Runtime.getHeapUsage` |
| V8 Heap (used) | 935 MB | 61% | CDP `Runtime.getHeapUsage` |
| External Memory | 21 MB | 1% | Kibana `/api/status` |
| Node.js/V8 Internals | 295 MB | 19% | Calculated (RSS - Heap - External) |

---

## 1. Proof Sources

### Source A: Kibana Status API
```bash
curl -s -u elastic:changeme "http://localhost:5601/vbj/api/status"
```
```
Heap Used:       935.5 MB
Heap Total:      1237.3 MB
Resident (RSS):  1534.8 MB
External:        20.8 MB
Array Buffers:   17.0 MB
```

### Source B: OS Process Stats
```bash
ps -o pid,rss,vsz -p 72190
```
```
RSS: 1538.4 MB
```

### Source C: Chrome DevTools Protocol
```javascript
// Connected to ws://127.0.0.1:9230
Runtime.getHeapUsage() => {
  usedSize: 935 MB,
  totalSize: 1222 MB
}
```

### Source D: Plugin Setup Memory (Instrumented)
From log file `[MEMORY]` tags - measured heap delta during each plugin's `setup()`:
```
Total: ~94 MB across 190 plugins
```

---

## 2. Detailed Breakdown

### 2.1 V8 JavaScript Heap: 1,222 MB (79% of RSS)

The V8 heap is where JavaScript objects live.

| Component | Size | Proof |
|-----------|------|-------|
| **Heap Used** | 935 MB | CDP `Runtime.getHeapUsage` |
| **Heap Overhead** | 287 MB | V8 allocates more than it uses |

#### What's in the 935 MB Used Heap?

From your heap snapshot:

| Category | Retained Size | Count | % of Heap |
|----------|---------------|-------|-----------|
| (string) | 102 MB | 788,993 | 11% |
| Object | 99 MB | 51,102 | 11% |
| Function | 79 MB | 468,729 | 8% |
| (compiled code) | 77 MB | 299,825 | 8% |
| **FSWatcher** | **64 MB** | 10,363 | **7% (DEV ONLY)** |
| Map | 50 MB | 43,771 | 5% |
| **DirectoryWatcher** | **33 MB** | 10,363 | **4% (DEV ONLY)** |
| Array | 32 MB | 196,915 | 3% |
| system / Context | 33 MB | 180,334 | 4% |
| (concatenated string) | 25 MB | 399,438 | 3% |
| **Watcher** | **25 MB** | 33,581 | **3% (DEV ONLY)** |
| Set | 18 MB | 52,752 | 2% |
| ArrayBuffer | 17 MB | 101 | 2% |
| DirEntry | 15 MB | 31,361 | 2% |
| Bundle | 12 MB | 211 | 1% |
| (sliced string) | 12 MB | 150,266 | 1% |

**Key Finding: ~135 MB (14%) is file watchers (DEV MODE ONLY!)**

---

### 2.2 Plugin Memory: ~94 MB (measured)

Top plugins by heap delta during `setup()`:

| Plugin | Heap MB | Notes |
|--------|---------|-------|
| timelines | 8.56 | Security timelines |
| visTypeTimelion | 8.09 | Legacy visualization |
| ml | 7.34 | Machine Learning |
| securitySolutionEss | 5.79 | Security ESS |
| apm | 5.68 | APM |
| stackConnectors | 5.54 | Alert connectors |
| synthetics | 5.36 | Synthetics monitoring |
| dashboard | 5.24 | Dashboard plugin |
| dataViews | 5.08 | Data views |
| data | 4.87 | Data plugin |
| observabilityOnboarding | 4.31 | Onboarding |
| securitySolution | 3.70 | Security main |
| canvas | 3.67 | Canvas |
| taskManager | 3.49 | Task Manager |
| streams | 3.48 | Streams |
| ... | ... | (175 more plugins) |
| **TOTAL** | **~94 MB** | |

---

### 2.3 External Memory: 21 MB (1% of RSS)

Memory allocated outside V8 heap (native addons, buffers):

| Component | Size | Source |
|-----------|------|--------|
| Array Buffers | 17 MB | Kibana API |
| Other External | 4 MB | Kibana API |
| **Total** | **21 MB** | |

---

### 2.4 Node.js & V8 Internals: 295 MB (19% of RSS)

Calculated: `RSS (1538) - Heap (1222) - External (21) = 295 MB`

This includes:
- V8 engine itself (code, data structures)
- Node.js runtime (libuv, OpenSSL, zlib, etc.)
- Thread stacks (~8MB per thread)
- Memory-mapped shared libraries
- File descriptor tables
- Internal caches

---

## 3. Summary Chart

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TOTAL RSS: 1,538 MB                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │           V8 HEAP TOTAL: 1,222 MB (79%)                       │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │         V8 HEAP USED: 935 MB (61%)                      │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │  │  │
│  │  │  │   Strings    │ │   Objects    │ │ Compiled Code    │ │  │  │
│  │  │  │   ~140 MB    │ │   ~100 MB    │ │    ~77 MB        │ │  │  │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────┘ │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │  │  │
│  │  │  │  Functions   │ │ Maps/Sets    │ │  File Watchers   │ │  │  │
│  │  │  │   ~79 MB     │ │   ~68 MB     │ │   ~135 MB (DEV)  │ │  │  │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────┘ │  │  │
│  │  │                                                         │  │  │
│  │  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │  │  │
│  │  │  │   Plugins    │ │   Arrays     │ │     Other        │ │  │  │
│  │  │  │   ~94 MB     │ │   ~32 MB     │ │    ~210 MB       │ │  │  │
│  │  │  └──────────────┘ └──────────────┘ └──────────────────┘ │  │  │
│  │  │                                                         │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  │  ┌─────────────────────────────────────────────────────────┐  │  │
│  │  │    V8 HEAP OVERHEAD: 287 MB (fragmentation/reserved)    │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  │                                                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌───────────────────┐  ┌─────────────────────────────────────────┐ │
│  │ External: 21 MB   │  │  Node.js/V8 Internals: 295 MB (19%)     │ │
│  │ (Array Buffers)   │  │  (V8 engine, libuv, OpenSSL, threads)   │ │
│  └───────────────────┘  └─────────────────────────────────────────┘ │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Production vs Development

| Component | Dev Mode | Production (est.) | Savings |
|-----------|----------|-------------------|---------|
| File Watchers | 135 MB | 0 MB | -135 MB |
| Bundle metadata | 12 MB | ~2 MB | -10 MB |
| Source maps | ~50 MB | 0 MB | -50 MB |
| **Estimated Total** | **1,538 MB** | **~1,350 MB** | **~190 MB** |

---

## 5. Recommendations for Reducing Memory

### Quick Wins:
1. **Run with `--no-watch`**: Saves ~135 MB in dev mode
2. **Disable unused plugins**: Each plugin = 0.5-8 MB
3. **Lazy load plugins**: Don't load until needed

### Architecture Changes:
1. **Lazy plugin initialization**: Only load plugin code when first accessed
2. **Code splitting**: Don't bundle everything upfront
3. **Remove legacy plugins**: `visTypeTimelion` (8 MB) is deprecated

### Top Targets for Optimization:
1. `timelines` (8.56 MB) - Can it be lazy loaded?
2. `visTypeTimelion` (8.09 MB) - Should be removed/deprecated
3. `ml` (7.34 MB) - Only load when ML features used
4. Security Solution plugins (9.5 MB combined) - Lazy load?
