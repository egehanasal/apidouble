import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { ApiDouble } from '../../src/core/server.js';

const TEST_PORT = 3999;
const TEST_DB_PATH = './test-server-mocks/db.json';

describe('ApiDouble Server', () => {
  let server: ApiDouble;

  beforeEach(() => {
    server = new ApiDouble({
      port: TEST_PORT,
      mode: 'mock',
      storage: { type: 'lowdb', path: TEST_DB_PATH },
    });
  });

  afterEach(async () => {
    if (server.running()) {
      await server.stop();
    }
    try {
      await rm('./test-server-mocks', { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('constructor', () => {
    it('should create server with default config', () => {
      const defaultServer = new ApiDouble();
      const config = defaultServer.getConfig();

      expect(config.port).toBe(3001);
      expect(config.mode).toBe('proxy');
      expect(config.storage.type).toBe('lowdb');
      expect(config.cors?.enabled).toBe(true);
    });

    it('should accept custom config', () => {
      const config = server.getConfig();

      expect(config.port).toBe(TEST_PORT);
      expect(config.mode).toBe('mock');
    });
  });

  describe('start/stop', () => {
    it('should start and stop server', async () => {
      expect(server.running()).toBe(false);

      await server.start();
      expect(server.running()).toBe(true);

      await server.stop();
      expect(server.running()).toBe(false);
    });

    it('should throw if started twice', async () => {
      await server.start();

      await expect(server.start()).rejects.toThrow('Server is already running');

      await server.stop();
    });

    it('should call onStart callback', async () => {
      let startedPort: number | null = null;

      const serverWithCallback = new ApiDouble(
        {
          port: TEST_PORT,
          mode: 'mock',
          storage: { type: 'lowdb', path: TEST_DB_PATH },
        },
        {
          onStart: (port) => {
            startedPort = port;
          },
        }
      );

      await serverWithCallback.start();
      expect(startedPort).toBe(TEST_PORT);

      await serverWithCallback.stop();
    });

    it('should call onStop callback', async () => {
      let stopped = false;

      const serverWithCallback = new ApiDouble(
        {
          port: TEST_PORT,
          mode: 'mock',
          storage: { type: 'lowdb', path: TEST_DB_PATH },
        },
        {
          onStop: () => {
            stopped = true;
          },
        }
      );

      await serverWithCallback.start();
      await serverWithCallback.stop();

      expect(stopped).toBe(true);
    });
  });

  describe('health endpoint', () => {
    it('should respond to /__health', async () => {
      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/__health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('mock');

      await server.stop();
    });
  });

  describe('status endpoint', () => {
    it('should respond to /__status', async () => {
      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/__status`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.mode).toBe('mock');
      expect(data.port).toBe(TEST_PORT);
      expect(data.recordedEntries).toBe(0);

      await server.stop();
    });
  });

  describe('mocks endpoint', () => {
    it('should list mocks via /__mocks', async () => {
      await server.start();

      // Add a mock entry
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/test', url: '/test', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { test: true }, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBe(1);
      expect(data.entries[0].method).toBe('GET');
      expect(data.entries[0].path).toBe('/test');

      await server.stop();
    });

    it('should clear mocks via DELETE /__mocks', async () => {
      await server.start();

      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/test', url: '/test', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { test: true }, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks`, {
        method: 'DELETE',
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(await storage.count()).toBe(0);

      await server.stop();
    });
  });

  describe('mode switching', () => {
    it('should switch mode via POST /__mode', async () => {
      await server.start();

      expect(server.getMode()).toBe('mock');

      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'proxy', target: 'http://example.com' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('proxy');
      expect(server.getMode()).toBe('proxy');

      await server.stop();
    });

    it('should reject invalid mode', async () => {
      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'invalid' }),
      });

      expect(res.status).toBe(400);

      await server.stop();
    });
  });

  describe('custom routes', () => {
    it('should handle custom routes', async () => {
      server.route('GET', '/custom/:id', (req) => ({
        body: { customId: req.params.id, query: req.query },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/custom/123?foo=bar`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.customId).toBe('123');
      expect(data.query.foo).toBe('bar');

      await server.stop();
    });

    it('should support custom status codes', async () => {
      server.route('POST', '/create', () => ({
        status: 201,
        body: { created: true },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/create`, {
        method: 'POST',
      });

      expect(res.status).toBe(201);

      await server.stop();
    });
  });

  describe('mock mode', () => {
    it('should return stored mock responses', async () => {
      await server.start();

      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/api/users', url: '/api/users', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: { 'content-type': 'application/json' }, body: { users: ['Alice'] }, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/api/users`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.users).toContain('Alice');

      await server.stop();
    });

    it('should return 404 for unmatched requests', async () => {
      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/nonexistent`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not Found');

      await server.stop();
    });
  });

  describe('setMode', () => {
    it('should change mode programmatically', async () => {
      await server.start();

      expect(server.getMode()).toBe('mock');

      server.setMode('proxy', 'http://example.com');

      expect(server.getMode()).toBe('proxy');

      await server.stop();
    });
  });

  describe('getStorage', () => {
    it('should return storage instance', () => {
      const storage = server.getStorage();
      expect(storage).toBeDefined();
      expect(typeof storage.save).toBe('function');
      expect(typeof storage.list).toBe('function');
    });
  });
});
