#!/bin/bash

# Simple script to run Kibana and save memory logs
# Usage:
#   ./scripts/run_memory_test.sh eager    # Saves to kibana_memory_eager.log
#   ./scripts/run_memory_test.sh lazy     # Saves to kibana_memory_lazy.log
#   ./scripts/run_memory_test.sh baseline # Saves to kibana_memory_baseline.log

MODE=${1:-"test"}
LOG_FILE="kibana_memory_${MODE}.log"

echo "Starting Kibana in ${MODE} mode..."
echo "Output will be saved to: ${LOG_FILE}"
echo ""
echo "Press Ctrl+C to stop when ready"
echo ""

node --inspect scripts/kibana --dev 2>&1 | tee "${LOG_FILE}"
