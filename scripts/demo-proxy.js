#!/usr/bin/env node
/**
 * ApiDouble Proxy Mode Demo
 *
 * This script demonstrates:
 * 1. Setting up a mock backend server
 * 2. Running ApiDouble in proxy mode to record requests
 * 3. Switching to mock mode for playback
 * 4. Verifying recorded responses work offline
 *
 * Run with: node scripts/demo-proxy.js
 */

import { ApiDouble } from '../dist/index.js';
import express from 'express';
import { rm } from 'node:fs/promises';

const BACKEND_PORT = 3600;
const PROXY_PORT = 3601;
const DEMO_DB = './demo-proxy-mocks.json';

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

async function request(port, method, path, options = {}) {
  const url = `http://localhost:${port}${path}`;
  console.log(`\n→ ${method} ${url}`);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();
    console.log(`← ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
    return { error };
  }
}

async function cleanup() {
  try {
    await rm(DEMO_DB, { force: true });
    await rm('./demo-proxy', { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║              ApiDouble Proxy Mode Demo                    ║
║                                                           ║
║  Demonstrates recording and playback of API responses     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  await cleanup();

  // ============================================================
  // STEP 1: Create a Mock Backend Server
  // ============================================================
  section('STEP 1: Create Mock Backend Server');

  const backendApp = express();
  backendApp.use(express.json());

  // Simulated backend endpoints
  let userIdCounter = 3;
  const users = [
    { id: 1, name: 'Alice', email: 'alice@backend.com', role: 'admin' },
    { id: 2, name: 'Bob', email: 'bob@backend.com', role: 'user' },
  ];

  backendApp.get('/api/users', (_req, res) => {
    console.log('  [Backend] GET /api/users');
    res.json({ users, total: users.length, source: 'live-backend' });
  });

  backendApp.get('/api/users/:id', (req, res) => {
    console.log(`  [Backend] GET /api/users/${req.params.id}`);
    const user = users.find((u) => u.id === parseInt(req.params.id));
    if (user) {
      res.json({ ...user, source: 'live-backend' });
    } else {
      res.status(404).json({ error: 'User not found', source: 'live-backend' });
    }
  });

  backendApp.post('/api/users', (req, res) => {
    console.log('  [Backend] POST /api/users');
    const newUser = {
      id: userIdCounter++,
      ...req.body,
      createdAt: new Date().toISOString(),
      source: 'live-backend',
    };
    users.push(newUser);
    res.status(201).json(newUser);
  });

  backendApp.get('/api/config', (_req, res) => {
    console.log('  [Backend] GET /api/config');
    res.json({
      version: '1.0.0',
      features: ['auth', 'payments', 'notifications'],
      timestamp: Date.now(),
      source: 'live-backend',
    });
  });

  const backendServer = await new Promise((resolve) => {
    const server = backendApp.listen(BACKEND_PORT, () => {
      console.log(`✓ Backend server running on port ${BACKEND_PORT}`);
      resolve(server);
    });
  });

  // ============================================================
  // STEP 2: Test Backend Directly
  // ============================================================
  section('STEP 2: Test Backend Directly');

  console.log('Making requests directly to backend...');
  await request(BACKEND_PORT, 'GET', '/api/users');
  await request(BACKEND_PORT, 'GET', '/api/users/1');

  // ============================================================
  // STEP 3: Start ApiDouble in Proxy Mode
  // ============================================================
  section('STEP 3: Start ApiDouble in Proxy Mode');

  const proxy = new ApiDouble({
    port: PROXY_PORT,
    mode: 'proxy',
    target: `http://localhost:${BACKEND_PORT}`,
    storage: { type: 'lowdb', path: DEMO_DB },
  });

  await proxy.start();
  console.log(`✓ ApiDouble proxy running on port ${PROXY_PORT}`);
  console.log(`  Proxying to: http://localhost:${BACKEND_PORT}`);

  // ============================================================
  // STEP 4: Make Requests Through Proxy (Recording)
  // ============================================================
  section('STEP 4: Make Requests Through Proxy (Recording)');

  console.log('Requests go through ApiDouble → Backend, responses are recorded\n');

  await request(PROXY_PORT, 'GET', '/api/users');
  await request(PROXY_PORT, 'GET', '/api/users/1');
  await request(PROXY_PORT, 'GET', '/api/users/2');
  await request(PROXY_PORT, 'GET', '/api/config');
  await request(PROXY_PORT, 'POST', '/api/users', {
    body: { name: 'Charlie', email: 'charlie@test.com' },
  });

  // Check what was recorded
  console.log('\n--- Checking recorded mocks ---');
  await request(PROXY_PORT, 'GET', '/__mocks');

  // ============================================================
  // STEP 5: Stop Backend (Simulate Offline)
  // ============================================================
  section('STEP 5: Stop Backend (Simulate Offline)');

  await new Promise((resolve, reject) => {
    backendServer.close((err) => (err ? reject(err) : resolve()));
  });
  console.log('✓ Backend server stopped (simulating offline/unavailable)');

  // ============================================================
  // STEP 6: Switch to Mock Mode
  // ============================================================
  section('STEP 6: Switch to Mock Mode');

  proxy.setMode('mock');
  console.log(`✓ Switched to mock mode`);

  const status = await request(PROXY_PORT, 'GET', '/__status');
  console.log(`\nCurrent mode: ${status.data.mode}`);

  // ============================================================
  // STEP 7: Replay Recorded Responses (Offline!)
  // ============================================================
  section('STEP 7: Replay Recorded Responses (No Backend!)');

  console.log('Backend is DOWN, but we can still get responses from recorded mocks!\n');

  await request(PROXY_PORT, 'GET', '/api/users');
  await request(PROXY_PORT, 'GET', '/api/users/1');
  await request(PROXY_PORT, 'GET', '/api/config');

  // ============================================================
  // STEP 8: Smart Matching Demo
  // ============================================================
  section('STEP 8: Smart Matching Demo');

  console.log('We recorded /api/users/1 and /api/users/2');
  console.log('Smart matching allows /api/users/999 to match!\n');

  await request(PROXY_PORT, 'GET', '/api/users/999');
  await request(PROXY_PORT, 'GET', '/api/users/12345');

  // ============================================================
  // STEP 9: Unrecorded Endpoint Returns 404
  // ============================================================
  section('STEP 9: Unrecorded Endpoint Returns 404');

  console.log('Endpoints that were never recorded return 404 in mock mode\n');

  await request(PROXY_PORT, 'GET', '/api/never-recorded');

  // ============================================================
  // CLEANUP
  // ============================================================
  section('CLEANUP');

  await proxy.stop();
  console.log('✓ ApiDouble stopped');

  await cleanup();
  console.log('✓ Demo files cleaned up');

  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                 Proxy Demo Complete! ✓                    ║
║                                                           ║
║  What we demonstrated:                                    ║
║                                                           ║
║  1. Created a mock backend server                         ║
║  2. Started ApiDouble in PROXY mode                       ║
║  3. Made requests through proxy (recorded automatically)  ║
║  4. Stopped backend (simulated offline)                   ║
║  5. Switched to MOCK mode                                 ║
║  6. Replayed recorded responses (no backend needed!)      ║
║  7. Smart matching worked for different IDs               ║
║                                                           ║
║  Use cases:                                               ║
║  • Record real API responses for offline development      ║
║  • Create test fixtures from production data              ║
║  • Speed up tests by avoiding network calls               ║
║  • Develop frontend when backend is unavailable           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
