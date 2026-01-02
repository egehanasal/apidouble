#!/usr/bin/env node
/**
 * ApiDouble Demo Script
 *
 * This script demonstrates all features of ApiDouble:
 * 1. Programmatic usage with custom routes
 * 2. Proxy mode (recording requests)
 * 3. Mock mode (playback)
 * 4. Admin endpoints
 * 5. Storage operations
 * 6. Mode switching
 *
 * Run with: node scripts/demo.js
 */

import { ApiDouble } from '../dist/index.js';
import { rm } from 'node:fs/promises';

const DEMO_PORT = 3500;
const DEMO_DB = './demo-mocks.json';

// Helper to make fetch requests and log results
async function request(method, path, options = {}) {
  const url = `http://localhost:${DEMO_PORT}${path}`;
  console.log(`\n→ ${method} ${path}`);

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const contentType = res.headers.get('content-type');
    let data;
    if (contentType?.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    console.log(`← ${res.status} ${res.statusText}`);
    console.log(JSON.stringify(data, null, 2));
    return { status: res.status, data };
  } catch (error) {
    console.log(`✗ Error: ${error.message}`);
    return { error };
  }
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function subsection(title) {
  console.log('\n' + '-'.repeat(40));
  console.log(`  ${title}`);
  console.log('-'.repeat(40));
}

async function cleanup() {
  try {
    await rm(DEMO_DB, { force: true });
    await rm('./demo-mocks', { recursive: true, force: true });
  } catch {
    // Ignore
  }
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                   ApiDouble Demo Script                   ║
║                                                           ║
║  This script demonstrates all features of ApiDouble       ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  await cleanup();

  // ============================================================
  // PART 1: Custom Routes (Programmatic API)
  // ============================================================
  section('PART 1: Custom Routes (Programmatic API)');

  console.log('\nCreating ApiDouble server with custom routes...');

  const server = new ApiDouble({
    port: DEMO_PORT,
    mode: 'mock',
    storage: { type: 'lowdb', path: DEMO_DB },
  });

  // Register custom routes
  server
    .route('GET', '/api/hello', () => ({
      body: { message: 'Hello from ApiDouble!' },
    }))
    .route('GET', '/api/users', () => ({
      body: {
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' },
          { id: 3, name: 'Charlie', email: 'charlie@example.com' },
        ],
      },
    }))
    .route('GET', '/api/users/:id', (req) => ({
      body: {
        id: parseInt(req.params.id),
        name: `User ${req.params.id}`,
        email: `user${req.params.id}@example.com`,
      },
    }))
    .route('POST', '/api/users', (req) => ({
      status: 201,
      body: {
        id: 100,
        ...req.body,
        createdAt: new Date().toISOString(),
      },
    }))
    .route('PUT', '/api/users/:id', (req) => ({
      body: {
        id: parseInt(req.params.id),
        ...req.body,
        updatedAt: new Date().toISOString(),
      },
    }))
    .route('DELETE', '/api/users/:id', () => ({
      status: 204,
      body: null,
    }))
    .route('GET', '/api/search', (req) => ({
      body: {
        query: req.query.q,
        page: req.query.page || '1',
        results: [`Result for "${req.query.q}" - item 1`, `Result for "${req.query.q}" - item 2`],
      },
    }))
    .route('GET', '/api/error', () => ({
      status: 500,
      body: { error: 'Internal Server Error', message: 'Something went wrong' },
    }))
    .route('GET', '/api/headers', () => ({
      headers: {
        'X-Custom-Header': 'custom-value',
        'X-Request-Id': 'req-12345',
      },
      body: { message: 'Check the response headers!' },
    }));

  await server.start();
  console.log(`✓ Server started on port ${DEMO_PORT}`);

  subsection('Testing Custom Routes');

  await request('GET', '/api/hello');
  await request('GET', '/api/users');
  await request('GET', '/api/users/42');
  await request('POST', '/api/users', { body: { name: 'David', email: 'david@example.com' } });
  await request('PUT', '/api/users/1', { body: { name: 'Alice Updated' } });
  await request('DELETE', '/api/users/1');
  await request('GET', '/api/search?q=apidouble&page=2');
  await request('GET', '/api/error');
  await request('GET', '/api/headers');

  // ============================================================
  // PART 2: Admin Endpoints
  // ============================================================
  section('PART 2: Admin Endpoints');

  subsection('Health Check');
  await request('GET', '/__health');

  subsection('Server Status');
  await request('GET', '/__status');

  subsection('List Mocks (empty initially)');
  await request('GET', '/__mocks');

  // ============================================================
  // PART 3: Storage Operations
  // ============================================================
  section('PART 3: Storage Operations');

  subsection('Adding mocks via storage');
  const storage = server.getStorage();

  // Add some mocks directly to storage
  const mock1 = await storage.save(
    {
      id: 'req-1',
      method: 'GET',
      url: '/api/products',
      path: '/api/products',
      query: {},
      headers: {},
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { products: [{ id: 1, name: 'Widget', price: 9.99 }] },
      timestamp: Date.now(),
    }
  );
  console.log(`✓ Added mock: ${mock1.id}`);

  const mock2 = await storage.save(
    {
      id: 'req-2',
      method: 'GET',
      url: '/api/products/123',
      path: '/api/products/123',
      query: {},
      headers: {},
      timestamp: Date.now(),
    },
    {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { id: 123, name: 'Gadget', price: 19.99 },
      timestamp: Date.now(),
    }
  );
  console.log(`✓ Added mock: ${mock2.id}`);

  subsection('List Mocks (now has entries)');
  await request('GET', '/__mocks');

  subsection('Testing stored mocks (smart matching)');
  console.log('\nNote: /api/products/999 matches /api/products/123 via smart matching!');
  await request('GET', '/api/products');
  await request('GET', '/api/products/999'); // Smart matching with different ID

  subsection('Deleting a specific mock');
  await request('DELETE', `/__mocks/${mock1.id}`);
  await request('GET', '/__mocks');

  // ============================================================
  // PART 4: Mode Switching
  // ============================================================
  section('PART 4: Mode Switching');

  subsection('Current mode (mock)');
  await request('GET', '/__status');

  subsection('Unmatched request in mock mode returns 404');
  await request('GET', '/api/unknown-endpoint');

  // ============================================================
  // PART 5: Programmatic Mode Control
  // ============================================================
  section('PART 5: Programmatic Mode Control');

  subsection('Get current mode');
  console.log(`Current mode: ${server.getMode()}`);

  subsection('Set mode via API');
  await request('POST', '/__mode', { body: { mode: 'mock' } });

  subsection('Check running status');
  console.log(`Server running: ${server.running()}`);

  // ============================================================
  // PART 6: Clear All Mocks
  // ============================================================
  section('PART 6: Clear All Mocks');

  subsection('Clear all mocks via admin endpoint');
  await request('DELETE', '/__mocks');
  await request('GET', '/__mocks');

  // ============================================================
  // PART 7: Event Callbacks
  // ============================================================
  section('PART 7: Event Callbacks Demo');

  console.log('\nStopping server to reconfigure with callbacks...');
  await server.stop();

  const serverWithCallbacks = new ApiDouble({
    port: DEMO_PORT,
    mode: 'mock',
    storage: { type: 'lowdb', path: DEMO_DB },
    callbacks: {
      onStart: () => console.log('📢 [Callback] Server started!'),
      onStop: () => console.log('📢 [Callback] Server stopped!'),
      onRequest: (req) => console.log(`📢 [Callback] Request: ${req.method} ${req.path}`),
      onResponse: (req, res) => console.log(`📢 [Callback] Response: ${res.status} for ${req.path}`),
    },
  });

  serverWithCallbacks.route('GET', '/api/callback-test', () => ({
    body: { message: 'Testing callbacks!' },
  }));

  await serverWithCallbacks.start();

  subsection('Making request (watch for callback logs)');
  await request('GET', '/api/callback-test');

  // ============================================================
  // CLEANUP
  // ============================================================
  section('CLEANUP');

  console.log('\nStopping server...');
  await serverWithCallbacks.stop();
  console.log('✓ Server stopped');

  await cleanup();
  console.log('✓ Demo files cleaned up');

  // ============================================================
  // SUMMARY
  // ============================================================
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║                    Demo Complete! ✓                       ║
║                                                           ║
║  Features demonstrated:                                   ║
║  • Custom route registration (GET, POST, PUT, DELETE)     ║
║  • Route parameters (/users/:id)                          ║
║  • Query parameters (/search?q=...)                       ║
║  • Custom status codes and headers                        ║
║  • Admin endpoints (health, status, mocks, mode)          ║
║  • Storage operations (save, list, delete, clear)         ║
║  • Smart request matching                                 ║
║  • Mode switching                                         ║
║  • Event callbacks                                        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
}

main().catch(console.error);
