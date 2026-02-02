#!/bin/bash

# Compare Kibana memory usage with and without lazy loading
# This script runs Kibana twice and compares the results

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIBANA_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$KIBANA_ROOT/tmp/lazy_loading_comparison"
WAIT_TIME=${1:-60}  # How long to wait for Kibana to start (default 60s)

mkdir -p "$OUTPUT_DIR"

echo "=============================================="
echo "LAZY LOADING A/B TEST"
echo "=============================================="
echo "Output directory: $OUTPUT_DIR"
echo "Wait time per run: ${WAIT_TIME}s"
echo ""

# Function to get memory stats
get_memory_stats() {
    local pid=$1
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        ps -o rss=,vsz= -p $pid 2>/dev/null | awk '{print $1/1024, $2/1024}'
    else
        # Linux
        ps -o rss=,vsz= -p $pid 2>/dev/null | awk '{print $1/1024, $2/1024}'
    fi
}

# Function to run Kibana and collect stats
run_kibana_test() {
    local mode=$1
    local log_file="$OUTPUT_DIR/${mode}.log"
    local stats_file="$OUTPUT_DIR/${mode}_stats.txt"
    
    echo "----------------------------------------"
    echo "Running: $mode mode"
    echo "Log: $log_file"
    echo "----------------------------------------"
    
    # Set environment based on mode
    if [ "$mode" == "eager" ]; then
        export KIBANA_LAZY_LOAD=false
    else
        export KIBANA_LAZY_LOAD=true
        export KIBANA_LAZY_VERBOSE=true
    fi
    
    # Start Kibana in background
    cd "$KIBANA_ROOT"
    node -r ./scripts/lazy_require_hook.js scripts/kibana --dev > "$log_file" 2>&1 &
    local kibana_pid=$!
    
    echo "Kibana PID: $kibana_pid"
    echo "Waiting for startup (${WAIT_TIME}s)..."
    
    # Collect memory stats during startup
    echo "# Memory stats for $mode mode" > "$stats_file"
    echo "# Time(s) RSS(MB) VSZ(MB)" >> "$stats_file"
    
    for i in $(seq 1 $WAIT_TIME); do
        if ! kill -0 $kibana_pid 2>/dev/null; then
            echo "Kibana exited early!"
            break
        fi
        
        local mem=$(get_memory_stats $kibana_pid)
        if [ -n "$mem" ]; then
            echo "$i $mem" >> "$stats_file"
        fi
        
        # Show progress
        if [ $((i % 10)) -eq 0 ]; then
            echo "  ${i}s - RSS: $(echo $mem | awk '{print $1}')MB"
        fi
        
        sleep 1
    done
    
    # Get final memory
    local final_mem=$(get_memory_stats $kibana_pid)
    local final_rss=$(echo $final_mem | awk '{print $1}')
    
    echo ""
    echo "Final memory (RSS): ${final_rss}MB"
    echo "$final_rss" > "$OUTPUT_DIR/${mode}_final_rss.txt"
    
    # Stop Kibana
    echo "Stopping Kibana..."
    kill $kibana_pid 2>/dev/null
    sleep 2
    kill -9 $kibana_pid 2>/dev/null
    
    # Extract key metrics from log
    echo ""
    echo "Key metrics from log:"
    grep -E "\[MEMORY_PHASE\]|\[LAZY_LOAD\]|\[LAZY_HOOK\]" "$log_file" | head -30
    
    echo ""
}

# Clean up any existing Kibana
echo "Cleaning up existing Kibana processes..."
pkill -f "scripts/kibana" 2>/dev/null
sleep 2

# Run eager (baseline) test
run_kibana_test "eager"

echo ""
echo "Waiting 10s between tests..."
sleep 10

# Run lazy test
run_kibana_test "lazy"

# Compare results
echo ""
echo "=============================================="
echo "COMPARISON RESULTS"
echo "=============================================="

eager_rss=$(cat "$OUTPUT_DIR/eager_final_rss.txt" 2>/dev/null || echo "0")
lazy_rss=$(cat "$OUTPUT_DIR/lazy_final_rss.txt" 2>/dev/null || echo "0")

echo ""
echo "Final RSS Memory:"
echo "  Eager (baseline): ${eager_rss}MB"
echo "  Lazy (optimized): ${lazy_rss}MB"

if [ -n "$eager_rss" ] && [ -n "$lazy_rss" ] && [ "$eager_rss" != "0" ]; then
    savings=$(echo "$eager_rss - $lazy_rss" | bc 2>/dev/null || echo "N/A")
    percent=$(echo "scale=1; ($eager_rss - $lazy_rss) / $eager_rss * 100" | bc 2>/dev/null || echo "N/A")
    echo "  Savings: ${savings}MB (${percent}%)"
fi

echo ""
echo "Detailed logs saved to:"
echo "  $OUTPUT_DIR/eager.log"
echo "  $OUTPUT_DIR/lazy.log"
echo "  $OUTPUT_DIR/eager_stats.txt"
echo "  $OUTPUT_DIR/lazy_stats.txt"

# Create summary
cat > "$OUTPUT_DIR/summary.md" << EOF
# Lazy Loading Comparison Results

**Date:** $(date)
**Wait time:** ${WAIT_TIME}s

## Memory Usage

| Mode | Final RSS (MB) |
|------|----------------|
| Eager (baseline) | ${eager_rss} |
| Lazy (optimized) | ${lazy_rss} |
| **Savings** | ${savings:-N/A} (${percent:-N/A}%) |

## Files

- \`eager.log\` - Full log from eager mode
- \`lazy.log\` - Full log from lazy mode  
- \`eager_stats.txt\` - Memory samples during eager startup
- \`lazy_stats.txt\` - Memory samples during lazy startup

## How to Analyze

\`\`\`bash
# View lazy loading events
grep "LAZY_LOAD" $OUTPUT_DIR/lazy.log

# View memory phases
grep "MEMORY_PHASE" $OUTPUT_DIR/eager.log
grep "MEMORY_PHASE" $OUTPUT_DIR/lazy.log

# Plot memory over time (requires gnuplot)
gnuplot -e "set terminal png; set output '$OUTPUT_DIR/memory_comparison.png'; plot '$OUTPUT_DIR/eager_stats.txt' using 1:2 with lines title 'Eager', '$OUTPUT_DIR/lazy_stats.txt' using 1:2 with lines title 'Lazy'"
\`\`\`
EOF

echo ""
echo "Summary saved to: $OUTPUT_DIR/summary.md"
echo "=============================================="
