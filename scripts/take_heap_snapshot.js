#!/usr/bin/env node

/**
 * Take a heap snapshot from a running Node.js process via inspector
 * and save it to a file for analysis.
 * 
 * Usage:
 *   node scripts/take_heap_snapshot.js [output-file]
 * 
 * Example:
 *   node scripts/take_heap_snapshot.js heap.heapsnapshot
 * 
 * Prerequisites:
 *   - Kibana must be running with --inspect flag
 *   - node --inspect scripts/kibana --dev
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const INSPECTOR_HOST = process.env.INSPECTOR_HOST || '127.0.0.1';
const INSPECTOR_PORT = process.env.INSPECTOR_PORT || 9229;

const outputFile = process.argv[2] || `heap_${Date.now()}.heapsnapshot`;
const outputPath = path.resolve(outputFile);

async function getWebSocketUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${INSPECTOR_HOST}:${INSPECTOR_PORT}/json`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const target = targets.find(t => t.type === 'node');
          if (target) {
            resolve(target.webSocketDebuggerUrl);
          } else {
            reject(new Error('No Node.js target found'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Connection timeout - is Kibana running with --inspect?'));
    });
  });
}

async function takeSnapshot(wsUrl) {
  // Dynamic import for ws (may need to install)
  let WebSocket;
  try {
    WebSocket = require('ws');
  } catch {
    console.log('Installing ws package...');
    require('child_process').execSync('npm install ws', { stdio: 'inherit' });
    WebSocket = require('ws');
  }

  return new Promise((resolve, reject) => {
    console.log('Connecting to inspector...');
    const ws = new WebSocket(wsUrl);
    let msgId = 1;
    const chunks = [];
    
    ws.on('open', () => {
      console.log('Connected. Taking heap snapshot...');
      console.log('(This may take 30-60 seconds for a large heap)');
      console.log('');
      
      ws.send(JSON.stringify({
        id: msgId++,
        method: 'HeapProfiler.takeHeapSnapshot',
        params: { reportProgress: true }
      }));
    });
    
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      
      if (msg.method === 'HeapProfiler.addHeapSnapshotChunk') {
        chunks.push(msg.params.chunk);
        process.stdout.write(`\rReceived ${chunks.length} chunks (${(chunks.join('').length / 1024 / 1024).toFixed(1)}MB)...`);
      } else if (msg.method === 'HeapProfiler.reportHeapSnapshotProgress') {
        const { done, total } = msg.params;
        const pct = Math.round(done / total * 100);
        process.stdout.write(`\rProgress: ${pct}% (${done}/${total})...`);
      } else if (msg.id && !msg.error) {
        console.log('\n\nSnapshot complete!');
        ws.close();
        resolve(chunks.join(''));
      } else if (msg.error) {
        reject(new Error(msg.error.message));
      }
    });
    
    ws.on('error', reject);
    ws.on('close', () => {
      if (chunks.length === 0) {
        reject(new Error('Connection closed before snapshot completed'));
      }
    });
  });
}

async function main() {
  console.log('='.repeat(60));
  console.log('HEAP SNAPSHOT CAPTURE');
  console.log('='.repeat(60));
  console.log('');
  
  try {
    console.log(`Looking for inspector at ${INSPECTOR_HOST}:${INSPECTOR_PORT}...`);
    const wsUrl = await getWebSocketUrl();
    console.log('Found inspector!');
    console.log('');
    
    const snapshotData = await takeSnapshot(wsUrl);
    
    console.log(`Saving to ${outputPath}...`);
    fs.writeFileSync(outputPath, snapshotData);
    
    const sizeMB = (snapshotData.length / 1024 / 1024).toFixed(1);
    console.log(`Saved! (${sizeMB}MB)`);
    console.log('');
    console.log('To analyze:');
    console.log(`  node scripts/parse_heap_snapshot.js ${outputFile}`);
    console.log('');
    console.log('Or open in Chrome DevTools:');
    console.log('  1. Open chrome://inspect');
    console.log('  2. Click "Open dedicated DevTools for Node"');
    console.log('  3. Memory tab → Load button → select the .heapsnapshot file');
    
  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    console.error('Make sure Kibana is running with --inspect:');
    console.error('  node --inspect scripts/kibana --dev');
    process.exit(1);
  }
}

main();
