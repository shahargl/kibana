#!/usr/bin/env node

/**
 * A/B Test: Compare Kibana memory with and without lazy loading
 * 
 * This script:
 * 1. Runs Kibana in EAGER mode (baseline), collects memory stats
 * 2. Runs Kibana in LAZY mode (optimized), collects memory stats
 * 3. Compares and reports the difference
 * 
 * Usage:
 *   node scripts/compare_lazy_loading.js [--wait=60] [--skip-eager] [--skip-lazy]
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const KIBANA_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(KIBANA_ROOT, 'tmp', 'lazy_loading_comparison');

// Parse args
const args = process.argv.slice(2);
const waitTime = parseInt(args.find(a => a.startsWith('--wait='))?.split('=')[1] || '90');
const skipEager = args.includes('--skip-eager');
const skipLazy = args.includes('--skip-lazy');

// Ensure output directory exists
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function getMemoryUsage(pid) {
  try {
    if (process.platform === 'darwin') {
      const { execSync } = require('child_process');
      const output = execSync(`ps -o rss=,vsz= -p ${pid}`, { encoding: 'utf-8' });
      const [rss, vsz] = output.trim().split(/\s+/).map(Number);
      return { rss: rss / 1024, vsz: vsz / 1024 }; // Convert to MB
    } else {
      // Linux - read from /proc
      const status = fs.readFileSync(`/proc/${pid}/status`, 'utf-8');
      const rss = parseInt(status.match(/VmRSS:\s+(\d+)/)?.[1] || 0) / 1024;
      const vsz = parseInt(status.match(/VmSize:\s+(\d+)/)?.[1] || 0) / 1024;
      return { rss, vsz };
    }
  } catch {
    return null;
  }
}

async function runKibanaTest(mode) {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running ${mode.toUpperCase()} mode test`);
    console.log(`${'='.repeat(60)}\n`);

    const logFile = path.join(OUTPUT_DIR, `${mode}.log`);
    const statsFile = path.join(OUTPUT_DIR, `${mode}_stats.json`);
    const logStream = fs.createWriteStream(logFile);

    const env = {
      ...process.env,
      KIBANA_LAZY_LOAD: mode === 'lazy' ? 'true' : 'false',
      KIBANA_LAZY_VERBOSE: mode === 'lazy' ? 'true' : 'false',
    };

    // Start Kibana with the lazy hook
    const kibana = spawn('node', [
      '-r', './scripts/lazy_require_hook.js',
      'scripts/kibana',
      '--dev'
    ], {
      cwd: KIBANA_ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const stats = {
      mode,
      startTime: Date.now(),
      samples: [],
      lazyLoadEvents: [],
      memoryPhases: [],
      finalRss: 0,
      finalHeap: 0,
    };

    // Collect stdout/stderr
    kibana.stdout.pipe(logStream);
    kibana.stderr.pipe(logStream);

    // Also parse for interesting events
    let outputBuffer = '';
    const processOutput = (data) => {
      outputBuffer += data.toString();
      const lines = outputBuffer.split('\n');
      outputBuffer = lines.pop(); // Keep incomplete line

      for (const line of lines) {
        // Capture lazy load events
        if (line.includes('[LAZY_LOAD]')) {
          const match = line.match(/\[LAZY_LOAD\] ([^:]+): ([\d.]+)MB/);
          if (match) {
            stats.lazyLoadEvents.push({
              plugin: match[1],
              memory: parseFloat(match[2]),
              time: Date.now() - stats.startTime,
            });
          }
        }

        // Capture memory phases
        if (line.includes('[MEMORY_PHASE]')) {
          const match = line.match(/\[MEMORY_PHASE\] (\w+).*?heap=([\d.]+)MB/);
          if (match) {
            stats.memoryPhases.push({
              phase: match[1],
              heap: parseFloat(match[2]),
              time: Date.now() - stats.startTime,
            });
          }
        }

        // Check if Kibana is ready
        if (line.includes('http server running at')) {
          console.log('  Kibana is ready!');
        }
      }
    };

    kibana.stdout.on('data', processOutput);
    kibana.stderr.on('data', processOutput);

    // Sample memory periodically
    const sampleInterval = setInterval(() => {
      const mem = getMemoryUsage(kibana.pid);
      if (mem) {
        const elapsed = Math.round((Date.now() - stats.startTime) / 1000);
        stats.samples.push({
          time: elapsed,
          rss: mem.rss,
          vsz: mem.vsz,
        });

        if (elapsed % 10 === 0) {
          console.log(`  ${elapsed}s - RSS: ${mem.rss.toFixed(0)}MB`);
        }
      }
    }, 1000);

    // Stop after wait time
    setTimeout(() => {
      clearInterval(sampleInterval);

      // Get final stats
      const finalMem = getMemoryUsage(kibana.pid);
      if (finalMem) {
        stats.finalRss = finalMem.rss;
      }

      // Get heap from last memory phase if available
      if (stats.memoryPhases.length > 0) {
        stats.finalHeap = stats.memoryPhases[stats.memoryPhases.length - 1].heap;
      }

      console.log(`\n  Final RSS: ${stats.finalRss.toFixed(0)}MB`);
      console.log(`  Lazy load events: ${stats.lazyLoadEvents.length}`);
      console.log(`  Memory phases captured: ${stats.memoryPhases.length}`);

      // Save stats
      fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));

      // Kill Kibana
      console.log('  Stopping Kibana...');
      kibana.kill('SIGTERM');
      setTimeout(() => {
        kibana.kill('SIGKILL');
        logStream.end();
        resolve(stats);
      }, 3000);
    }, waitTime * 1000);

    kibana.on('error', (err) => {
      console.error(`  Error: ${err.message}`);
      clearInterval(sampleInterval);
      resolve(stats);
    });

    kibana.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.log(`  Kibana exited with code ${code}`);
      }
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('LAZY LOADING A/B COMPARISON TEST');
  console.log('='.repeat(60));
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Wait time: ${waitTime}s per run`);
  console.log('');

  // Kill any existing Kibana
  try {
    require('child_process').execSync('pkill -f "scripts/kibana"', { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 2000));
  } catch {}

  let eagerStats = null;
  let lazyStats = null;

  // Run eager test
  if (!skipEager) {
    eagerStats = await runKibanaTest('eager');
    console.log('\nWaiting 10s before next test...');
    await new Promise(r => setTimeout(r, 10000));
  } else {
    // Load from file
    const statsFile = path.join(OUTPUT_DIR, 'eager_stats.json');
    if (fs.existsSync(statsFile)) {
      eagerStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
      console.log('Loaded eager stats from previous run');
    }
  }

  // Run lazy test
  if (!skipLazy) {
    lazyStats = await runKibanaTest('lazy');
  } else {
    // Load from file
    const statsFile = path.join(OUTPUT_DIR, 'lazy_stats.json');
    if (fs.existsSync(statsFile)) {
      lazyStats = JSON.parse(fs.readFileSync(statsFile, 'utf-8'));
      console.log('Loaded lazy stats from previous run');
    }
  }

  // Compare
  console.log('\n' + '='.repeat(60));
  console.log('COMPARISON RESULTS');
  console.log('='.repeat(60) + '\n');

  if (eagerStats && lazyStats) {
    const rssSavings = eagerStats.finalRss - lazyStats.finalRss;
    const rssPercent = (rssSavings / eagerStats.finalRss * 100).toFixed(1);

    console.log('Final Memory (RSS):');
    console.log(`  Eager (baseline):  ${eagerStats.finalRss.toFixed(0)}MB`);
    console.log(`  Lazy (optimized):  ${lazyStats.finalRss.toFixed(0)}MB`);
    console.log(`  Savings:           ${rssSavings.toFixed(0)}MB (${rssPercent}%)`);
    console.log('');

    if (lazyStats.lazyLoadEvents.length > 0) {
      console.log('Lazy Load Events (modules loaded on demand):');
      const sorted = [...lazyStats.lazyLoadEvents].sort((a, b) => b.memory - a.memory);
      for (const evt of sorted.slice(0, 10)) {
        console.log(`  ${evt.plugin.padEnd(40)} ${evt.memory.toFixed(2)}MB at ${evt.time}ms`);
      }
      console.log(`  ... and ${Math.max(0, sorted.length - 10)} more`);
      console.log('');
    }

    // Memory over time comparison
    console.log('Memory Over Time (RSS):');
    console.log('  Time(s)  Eager(MB)  Lazy(MB)  Diff(MB)');
    console.log('  ------  ---------  --------  --------');

    const times = [10, 20, 30, 45, 60, 75, 90].filter(t => t <= waitTime);
    for (const t of times) {
      const eagerSample = eagerStats.samples.find(s => s.time === t);
      const lazySample = lazyStats.samples.find(s => s.time === t);
      if (eagerSample && lazySample) {
        const diff = eagerSample.rss - lazySample.rss;
        console.log(`  ${t.toString().padStart(6)}  ${eagerSample.rss.toFixed(0).padStart(9)}  ${lazySample.rss.toFixed(0).padStart(8)}  ${diff.toFixed(0).padStart(8)}`);
      }
    }

    // Save comparison report
    const report = {
      timestamp: new Date().toISOString(),
      waitTime,
      eager: {
        finalRss: eagerStats.finalRss,
        finalHeap: eagerStats.finalHeap,
        phases: eagerStats.memoryPhases,
      },
      lazy: {
        finalRss: lazyStats.finalRss,
        finalHeap: lazyStats.finalHeap,
        phases: lazyStats.memoryPhases,
        lazyLoadEvents: lazyStats.lazyLoadEvents,
      },
      savings: {
        rss: rssSavings,
        percent: parseFloat(rssPercent),
      },
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'comparison_report.json'),
      JSON.stringify(report, null, 2)
    );

    // Generate markdown report
    const markdown = `# Lazy Loading Comparison Report

**Generated:** ${new Date().toISOString()}
**Wait Time:** ${waitTime}s

## Summary

| Metric | Eager | Lazy | Savings |
|--------|-------|------|---------|
| Final RSS | ${eagerStats.finalRss.toFixed(0)}MB | ${lazyStats.finalRss.toFixed(0)}MB | ${rssSavings.toFixed(0)}MB (${rssPercent}%) |

## Lazy Load Events

${lazyStats.lazyLoadEvents.length} modules were loaded on-demand:

| Plugin | Memory | Time |
|--------|--------|------|
${sorted.slice(0, 20).map(e => `| ${e.plugin} | ${e.memory.toFixed(2)}MB | ${e.time}ms |`).join('\n')}

## Files

- \`eager.log\` - Full output from eager run
- \`lazy.log\` - Full output from lazy run
- \`eager_stats.json\` - Memory samples from eager run
- \`lazy_stats.json\` - Memory samples from lazy run
- \`comparison_report.json\` - Structured comparison data
`;

    fs.writeFileSync(path.join(OUTPUT_DIR, 'comparison_report.md'), markdown);
    console.log(`\nReports saved to: ${OUTPUT_DIR}`);

  } else {
    console.log('Could not compare - missing data from one or both runs');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
