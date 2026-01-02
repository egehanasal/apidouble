import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { ApiDouble } from '../../src/index.js';

const TEST_PORT = 4101;
const TEST_DB_PATH = './test-admin/db.json';

describe('Integration: Admin Endpoints', () => {
  let server: ApiDouble;

  beforeEach(async () => {
    server = new ApiDouble({
      port: TEST_PORT,
      mode: 'mock',
      storage: { type: 'lowdb', path: TEST_DB_PATH },
    });
    await server.start();
  });

  afterEach(async () => {
    if (server.running()) {
      await server.stop();
    }
    try {
      await rm('./test-admin', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('/__health', () => {
    it('should return health status', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__health`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.mode).toBe('mock');
      expect(typeof data.uptime).toBe('number');
    });
  });

  describe('/__status', () => {
    it('should return server status', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__status`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.mode).toBe('mock');
      expect(data.port).toBe(TEST_PORT);
      expect(data.recordedEntries).toBe(0);
    });

    it('should reflect correct entry count', async () => {
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/test', url: '/test', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: {}, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/__status`);
      const data = await res.json();

      expect(data.recordedEntries).toBe(1);
    });
  });

  describe('/__mocks', () => {
    it('should list all mocks', async () => {
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/api/users', url: '/api/users', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: {}, timestamp: Date.now() }
      );
      await storage.save(
        { id: '2', method: 'POST', path: '/api/users', url: '/api/users', query: {}, headers: {}, timestamp: Date.now() },
        { status: 201, headers: {}, body: {}, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.count).toBe(2);
      expect(data.entries).toHaveLength(2);
      expect(data.entries[0]).toHaveProperty('id');
      expect(data.entries[0]).toHaveProperty('method');
      expect(data.entries[0]).toHaveProperty('path');
      expect(data.entries[0]).toHaveProperty('status');
    });

    it('should clear all mocks with DELETE', async () => {
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/test', url: '/test', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: {}, timestamp: Date.now() }
      );

      expect(await storage.count()).toBe(1);

      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks`, {
        method: 'DELETE',
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(await storage.count()).toBe(0);
    });
  });

  describe('/__mocks/:id', () => {
    it('should delete specific mock', async () => {
      const storage = server.getStorage();
      const entry = await storage.save(
        { id: '1', method: 'GET', path: '/test', url: '/test', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: {}, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks/${entry.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(await storage.count()).toBe(0);
    });

    it('should return 404 for non-existent mock', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__mocks/non-existent`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(404);
    });
  });

  describe('/__mode', () => {
    it('should switch to mock mode', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'mock' }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('mock');
    });

    it('should switch to proxy mode with target', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'proxy',
          target: 'https://api.example.com',
        }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.mode).toBe('proxy');
      expect(data.target).toBe('https://api.example.com');
    });

    it('should reject invalid mode', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'invalid' }),
      });

      expect(res.status).toBe(400);
    });

    it('should require target for proxy mode', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/__mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'proxy' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
