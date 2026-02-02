# Runtime Memory Analysis for Kibana Plugins

## Your Goal
Analyze **runtime memory usage** by plugin/module - understand which plugins and their dependencies consume the most memory at runtime.

## Available Tools in Kibana

### 1. V8 Heap Profiler (Built-in Example Plugin)

Start Kibana with examples enabled:
```bash
yarn start --run-examples
```

Then capture a heap profile:
```bash
# Capture a 10-second heap profile
curl -OJ "http://elastic:changeme@localhost:5601/_dev/heap_profile?duration=10"
```

This generates a `.heapprofile` file you can analyze in:
- Chrome DevTools → Memory tab
- VS Code (direct file support)

### 2. @kbn/profiler-cli (Recommended)

```bash
# CPU profile while running a command
node scripts/profile.js -- curl http://localhost:5601/api/...

# Heap profile with timeout
node scripts/profile.js --heap --timeout=10000

# Profile a specific process
node scripts/profile.js --heap --pid <kibana_pid>
```

### 3. Node.js Inspector + Heap Snapshot

```bash
# Start Kibana with inspector
node --inspect scripts/kibana --dev

# Then in Chrome: chrome://inspect
# → Take heap snapshot
# → Analyze by constructor/retainer
```

## Analyzing Memory by Plugin/Module

### Method 1: Heap Snapshot Comparison

1. Start Kibana, let it stabilize
2. Take Heap Snapshot #1 (baseline)
3. Trigger the plugin functionality you want to analyze
4. Take Heap Snapshot #2
5. Compare snapshots in Chrome DevTools:
   - Select "Comparison" view
   - Sort by "Size Delta" or "Alloc. Size"
   - Group by "Containment" to see module hierarchy

### Method 2: process.memoryUsage() Instrumentation

Add to your plugin's setup/start:
```typescript
// In plugin.ts
public setup(core) {
  const before = process.memoryUsage();
  // ... plugin setup code ...
  const after = process.memoryUsage();
  console.log(`[${PLUGIN_ID}] Memory delta:`, {
    heapUsed: (after.heapUsed - before.heapUsed) / 1024 / 1024, // MB
    external: (after.external - before.external) / 1024 / 1024,
  });
}
```

### Method 3: Using --expose-gc for Precise Measurements

```bash
node --expose-gc scripts/kibana --dev
```

Then in code:
```typescript
global.gc?.(); // Force GC
const baseline = process.memoryUsage().heapUsed;
// ... load plugin ...
global.gc?.();
const afterLoad = process.memoryUsage().heapUsed;
console.log(`Plugin memory: ${(afterLoad - baseline) / 1024 / 1024} MB`);
```

## Recommended Workflow for task_manager Analysis

### Step 1: Create a Memory Measurement Script

```typescript
// scripts/measure_plugin_memory.ts
import { execSync } from 'child_process';

// This would need to be run inside Kibana context
// to measure specific plugin memory footprint
```

### Step 2: Analyze Heap Snapshot

1. Start Kibana: `node --inspect scripts/kibana --dev`
2. Open `chrome://inspect`
3. Click "Open dedicated DevTools for Node"
4. Go to "Memory" tab
5. Take heap snapshot
6. In the snapshot, search for:
   - `TaskManager` (class instances)
   - `task_manager` (in file paths)
   - Key classes: `TaskPollingLifecycle`, `TaskStore`, etc.

### Step 3: Key Metrics to Look For

| Metric | What It Means |
|--------|---------------|
| Shallow Size | Memory directly held by object |
| Retained Size | Memory that would be freed if object is GC'd |
| # Objects | Number of instances |
| Distance | Distance from GC root |

## External Tools

### clinic.js (Not in Kibana, but useful)
```bash
npm install -g clinic
clinic heapprofiler -- node scripts/kibana --dev
```

### memwatch-next
For detecting memory leaks at runtime.

## What You'll Typically Find

For **task_manager** specifically, memory hotspots are usually:
1. **Task queue** - In-memory task representations
2. **Observables/Subjects** - RxJS subscriptions (103 rxjs imports!)
3. **Elasticsearch responses** - Cached query results
4. **Polling buffers** - Data held between poll cycles

## Quick Memory Check

To get a rough idea of memory by loaded modules:
```bash
# Start Kibana, then in another terminal:
kill -USR2 <kibana_pid>  # Triggers heap dump if configured

# Or use built-in:
curl http://elastic:changeme@localhost:5601/_dev/heap_profile?duration=5 -OJ
```
