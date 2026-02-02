# Measuring Memory Per Plugin

## Quick Approach: Disable Plugins & Compare

Run Kibana multiple times, disabling different plugins:

```bash
# Baseline - all plugins
node scripts/kibana --dev --no-watch
# Check memory: curl http://localhost:5601/api/status | jq '.metrics.process.memory'

# Without fleet (biggest plugin by code)
node scripts/kibana --dev --no-watch --plugin.fleet.enabled=false

# Without alerting
node scripts/kibana --dev --no-watch --plugin.alerting.enabled=false

# Without ML
node scripts/kibana --dev --no-watch --plugin.ml.enabled=false

# Minimal - disable heavy plugins
node scripts/kibana --dev --no-watch \
  --plugin.fleet.enabled=false \
  --plugin.alerting.enabled=false \
  --plugin.ml.enabled=false \
  --plugin.cases.enabled=false \
  --plugin.maps.enabled=false
```

## Automated Memory Comparison Script

Save this and run it to compare plugin memory impact:

```bash
#!/bin/bash
# measure_plugins.sh

BASEPATH="wxz"  # your basePath
AUTH="elastic:changeme"

get_memory() {
  sleep 30  # wait for startup
  curl -s -u $AUTH "http://localhost:5601/$BASEPATH/api/status" | \
    node -pe "JSON.parse(require('fs').readFileSync('/dev/stdin')).metrics?.process?.memory?.heap?.used_in_bytes / 1024 / 1024"
}

echo "Starting baseline measurement..."
# Would need to start/stop Kibana for each test
```

## Alternative: Instrumented Plugin Loading

Add to `src/core/server/plugins/plugins_service.ts` temporarily:

```typescript
// Before plugin.setup()
const before = process.memoryUsage().heapUsed;
await plugin.setup(/* ... */);
global.gc?.();  // if --expose-gc
const after = process.memoryUsage().heapUsed;
console.log(`[MEMORY] ${plugin.name}: ${((after - before) / 1024 / 1024).toFixed(2)} MB`);
```

This logs memory delta as each plugin loads.
