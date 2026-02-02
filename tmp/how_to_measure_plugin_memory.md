# How to Measure Actual Plugin Memory

## Option 1: Chrome DevTools Heap Snapshot (MOST ACCURATE)

### Steps:

1. **Start Kibana with inspector:**
   ```bash
   node --inspect scripts/kibana --dev
   ```

2. **Open Chrome DevTools:**
   - Go to `chrome://inspect` in Chrome
   - Click "Open dedicated DevTools for Node"

3. **Take a heap snapshot:**
   - Go to "Memory" tab
   - Select "Heap snapshot"
   - Click "Take snapshot"

4. **Analyze by plugin:**
   - In the snapshot view, use the search box
   - Search for plugin names like "transform", "alerting", "data"
   - Look at "Retained Size" column for true memory cost

5. **Group by constructor:**
   - Switch view to "Statistics" 
   - Shows memory by object type (Object, Function, Array, etc.)

6. **Use Containment view:**
   - Shows object hierarchy
   - Find plugin modules under `(closure)` → `require.cache`

### Automated Analysis:
```bash
# After taking a snapshot, save it as .heapsnapshot file
# Then run:
node scripts/analyze_heap_by_plugin.js
```

---

## Option 2: Instrumented Plugin Loading (WHAT WE HAVE)

The current instrumentation in `plugins_service.ts` measures heap delta during `getConfigDescriptor()`:

```typescript
const memBeforeConfig = process.memoryUsage();
const configDescriptor = plugin.getConfigDescriptor();
const memAfterConfig = process.memoryUsage();
const delta = (memAfterConfig.heapUsed - memBeforeConfig.heapUsed) / 1024 / 1024;
```

**Limitation:** GC can run between measurements, causing negative or incorrect deltas.

**To see this output:**
```bash
node --inspect scripts/kibana --dev 2>&1 | tee kibana_memory.log
grep "MEMORY_ANALYSIS" kibana_memory.log
```

---

## Option 3: Isolated Plugin Measurement (NEW)

```bash
node --expose-gc scripts/measure_plugin_memory.js
```

This loads each plugin in isolation with forced GC, giving more accurate per-plugin numbers.

**Limitation:** Doesn't account for shared dependencies (real memory is lower).

---

## Option 4: V8 Heap Statistics

During Kibana run, we log V8 heap breakdown:

```bash
grep "MEMORY_ANALYSIS.*old_space\|code_space" kibana_memory.log
```

Shows:
- `old_space`: Long-lived objects (schemas, functions) - ~450MB
- `code_space`: Compiled JavaScript - ~35MB
- `new_space`: Temporary allocations - ~8MB

---

## What Each Measurement Tells You

| Method | Measures | Accuracy | Use For |
|--------|----------|----------|---------|
| Heap Snapshot | Actual objects in memory | HIGH | Detailed analysis |
| Instrumented Loading | Delta during load | MEDIUM | Quick comparison |
| Isolated Measurement | Per-plugin in isolation | MEDIUM | Upper bound estimate |
| V8 Statistics | Heap space breakdown | HIGH | Understanding memory types |

---

## Getting Precise "Lazy-Loadable" Memory

To calculate exactly what could be lazy:

1. **Take heap snapshot BEFORE plugins load** (after Node.js starts)
2. **Take heap snapshot AFTER discovery** (before setup)
3. **Take heap snapshot AFTER setup** (before start)
4. **Take heap snapshot AFTER start** (final state)

Compare snapshots to see:
- What was added at each phase
- Which objects belong to which plugins
- What could be deferred

### In Chrome DevTools:
- Use "Comparison" view between two snapshots
- Shows objects that were added/removed
- Filter by plugin name to see per-plugin delta

---

## Quick Command Reference

```bash
# Start Kibana with inspector
node --inspect scripts/kibana --dev

# Connect to inspector and take snapshots
# (Use Chrome DevTools at chrome://inspect)

# Analyze existing snapshot
node scripts/analyze_heap_by_plugin.js

# Measure plugins in isolation
node --expose-gc scripts/measure_plugin_memory.js

# See memory phases during startup
grep "MEMORY_PHASE" kibana_memory.log

# See per-plugin memory during discovery
grep "MEMORY_ANALYSIS" kibana_memory.log

# See lazy loading analysis
grep "LAZY_ANALYSIS" kibana_memory.log
```
