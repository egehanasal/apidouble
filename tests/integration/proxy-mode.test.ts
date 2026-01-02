import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import express from 'express';
import type { Server } from 'http';
import { ApiDouble } from '../../src/index.js';

const BACKEND_PORT = 4200;
const PROXY_PORT = 4201;
const TEST_DB_PATH = './test-proxy/db.json';

describe('Integration: Proxy Mode', () => {
  let backendServer: Server;
  let proxyServer: ApiDouble;

  // Create a simple backend server to proxy to
  beforeAll(async () => {
    const app = express();
    app.use(express.json());

    app.get('/api/users', (_req, res) => {
      res.json({ users: [{ id: 1, name: 'Backend User' }] });
    });

    app.get('/api/users/:id', (req, res) => {
      res.json({ id: parseInt(req.params.id), name: 'User ' + req.params.id });
    });

    app.post('/api/users', (req, res) => {
      res.status(201).json({ id: 999, ...req.body, created: true });
    });

    app.get('/api/slow', async (_req, res) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      res.json({ slow: true });
    });

    app.get('/api/error', (_req, res) => {
      res.status(500).json({ error: 'Internal Server Error' });
    });

    await new Promise<void>((resolve) => {
      backendServer = app.listen(BACKEND_PORT, resolve);
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      backendServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(async () => {
    proxyServer = new ApiDouble({
      port: PROXY_PORT,
      mode: 'proxy',
      target: `http://localhost:${BACKEND_PORT}`,
      storage: { type: 'lowdb', path: TEST_DB_PATH },
    });
    await proxyServer.start();
  });

  afterEach(async () => {
    if (proxyServer?.running()) {
      await proxyServer.stop();
    }
    try {
      await rm('./test-proxy', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('proxying requests', () => {
    it('should proxy GET request to backend', async () => {
      const res = await fetch(`http://localhost:${PROXY_PORT}/api/users`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.users).toHaveLength(1);
      expect(data.users[0].name).toBe('Backend User');
    });

    it('should proxy GET request with params', async () => {
      const res = await fetch(`http://localhost:${PROXY_PORT}/api/users/42`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.id).toBe(42);
      expect(data.name).toBe('User 42');
    });

    it('should proxy POST request with body', async () => {
      const res = await fetch(`http://localhost:${PROXY_PORT}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New User' }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.name).toBe('New User');
      expect(data.created).toBe(true);
    });

    it('should proxy error responses', async () => {
      const res = await fetch(`http://localhost:${PROXY_PORT}/api/error`);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('recording responses', () => {
    it('should record proxied GET response', async () => {
      // Make request through proxy
      await fetch(`http://localhost:${PROXY_PORT}/api/users`);

      // Check storage
      const storage = proxyServer.getStorage();
      const count = await storage.count();

      expect(count).toBe(1);

      const entries = await storage.list();
      expect(entries[0].request.method).toBe('GET');
      expect(entries[0].request.path).toBe('/api/users');
      expect(entries[0].response.status).toBe(200);
    });

    it('should record multiple requests', async () => {
      await fetch(`http://localhost:${PROXY_PORT}/api/users`);
      await fetch(`http://localhost:${PROXY_PORT}/api/users/1`);
      await fetch(`http://localhost:${PROXY_PORT}/api/users/2`);

      const storage = proxyServer.getStorage();
      const count = await storage.count();

      expect(count).toBe(3);
    });

    it('should record POST request body', async () => {
      await fetch(`http://localhost:${PROXY_PORT}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test User' }),
      });

      const storage = proxyServer.getStorage();
      const entries = await storage.list();

      expect(entries[0].request.method).toBe('POST');
      expect(entries[0].response.status).toBe(201);
    });
  });

  describe('mode switching', () => {
    it('should switch from proxy to mock mode', async () => {
      // First, record a response in proxy mode
      await fetch(`http://localhost:${PROXY_PORT}/api/users`);

      // Switch to mock mode
      proxyServer.setMode('mock');

      // Request should now use recorded mock
      const res = await fetch(`http://localhost:${PROXY_PORT}/api/users`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.users[0].name).toBe('Backend User');
    });

    it('should allow mode switch via API endpoint', async () => {
      // Record in proxy mode
      await fetch(`http://localhost:${PROXY_PORT}/api/users`);

      // Switch via API
      await fetch(`http://localhost:${PROXY_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mock' }),
      });

      // Verify mode changed
      const statusRes = await fetch(`http://localhost:${PROXY_PORT}/__status`);
      const status = await statusRes.json();

      expect(status.mode).toBe('mock');
    });
  });
});
