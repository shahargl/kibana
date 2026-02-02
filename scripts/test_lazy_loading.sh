#!/bin/bash
# ============================================================
# Test Lazy Loading PoC - Two Kibana Instances
# ============================================================
#
# This script helps you run the lazy loading test setup:
# - Instance 1 (port 5601): Background tasks with lazy loading
# - Instance 2 (port 5602): UI only (for creating rules/alerts)
#
# Usage:
#   ./scripts/test_lazy_loading.sh background   # Run background tasks node
#   ./scripts/test_lazy_loading.sh ui           # Run UI-only node
#   ./scripts/test_lazy_loading.sh stop         # Stop all instances
#
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIBANA_DIR="$(dirname "$SCRIPT_DIR")"

case "$1" in
  background)
    echo "============================================================"
    echo "Starting BACKGROUND TASKS node (port 5601) with lazy loading"
    echo "============================================================"
    echo ""
    echo "Watch for these log lines when tasks execute:"
    echo "  [LAZY_POC] Loading plugin \"alerting\" for task \"alerting:...\""
    echo ""
    cd "$KIBANA_DIR"
    pkill -f "node scripts/kibana" || true
    sleep 2
    LAZY_TASK_MANAGER_POC=true node scripts/kibana --dev 2>&1 | tee kibana_lazy.log
    ;;
    
  ui)
    echo "============================================================"
    echo "Starting UI-ONLY node (port 5610)"
    echo "============================================================"
    echo ""
    echo "Access the UI at: http://localhost:5610/xxx  (xxx is the random basepath)"
    echo "Create rules/alerts to trigger tasks on the background node"
    echo ""
    cd "$KIBANA_DIR"
    # Increase file descriptor limit for this process
    ulimit -n 65536 2>/dev/null || true
    # Use --dev mode (required for elastic superuser) with separate config
    # kibana.ui.yml sets dev.basePathProxyTarget to 5613 to avoid conflict with 5603
    KBN_OPTIMIZER_NO_WATCH=1 \
    node scripts/kibana --dev --no-watch \
      --config config/kibana.ui.yml \
      2>&1 | tee kibana_ui.log
    ;;
    
  stop)
    echo "Stopping all Kibana instances..."
    pkill -f "node scripts/kibana" || true
    echo "Done."
    ;;
    
  *)
    echo "Usage: $0 {background|ui|stop}"
    echo ""
    echo "  background  - Start background tasks node with lazy loading (port 5601)"
    echo "  ui          - Start UI-only node (port 5602)"  
    echo "  stop        - Stop all Kibana instances"
    echo ""
    echo "Test procedure:"
    echo "  1. Terminal 1: $0 background"
    echo "  2. Terminal 2: $0 ui"
    echo "  3. Open http://localhost:5602"
    echo "  4. Create a rule in Stack Management > Rules"
    echo "  5. Watch Terminal 1 for [LAZY_POC] logs"
    exit 1
    ;;
esac
