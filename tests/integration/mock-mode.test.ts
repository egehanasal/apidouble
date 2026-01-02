import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { ApiDouble } from '../../src/index.js';

const TEST_PORT = 4100;
const TEST_DB_PATH = './test-mock-mode/db.json';

describe('Integration: Mock Mode', () => {
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
      await rm('./test-mock-mode', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('serving mocks', () => {
    it('should serve recorded GET response', async () => {
      // Add mock
      const storage = server.getStorage();
      await storage.save(
        {
          id: 'req-1',
          method: 'GET',
          url: '/api/users',
          path: '/api/users',
          query: {},
          headers: {},
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
          body: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
          timestamp: Date.now(),
        }
      );

      // Request
      const res = await fetch(`http://localhost:${TEST_PORT}/api/users`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.users).toHaveLength(2);
      expect(data.users[0].name).toBe('Alice');
    });

    it('should serve recorded POST response', async () => {
      const storage = server.getStorage();
      await storage.save(
        {
          id: 'req-1',
          method: 'POST',
          url: '/api/users',
          path: '/api/users',
          query: {},
          headers: {},
          body: { name: 'Charlie' },
          timestamp: Date.now(),
        },
        {
          status: 201,
          headers: { 'content-type': 'application/json' },
          body: { id: 3, name: 'Charlie', created: true },
          timestamp: Date.now(),
        }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Charlie' }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.name).toBe('Charlie');
      expect(data.created).toBe(true);
    });

    it('should return 404 for unrecorded endpoints', async () => {
      const res = await fetch(`http://localhost:${TEST_PORT}/api/unknown`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.error).toBe('Not Found');
    });

    it('should match different IDs with smart matching', async () => {
      const storage = server.getStorage();
      await storage.save(
        {
          id: 'req-1',
          method: 'GET',
          url: '/api/users/123',
          path: '/api/users/123',
          query: {},
          headers: {},
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {},
          body: { id: 123, name: 'Original' },
          timestamp: Date.now(),
        }
      );

      // Request with different ID
      const res = await fetch(`http://localhost:${TEST_PORT}/api/users/999`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.name).toBe('Original');
    });

    it('should match UUIDs with smart matching', async () => {
      const storage = server.getStorage();
      await storage.save(
        {
          id: 'req-1',
          method: 'GET',
          url: '/api/items/550e8400-e29b-41d4-a716-446655440000',
          path: '/api/items/550e8400-e29b-41d4-a716-446655440000',
          query: {},
          headers: {},
          timestamp: Date.now(),
        },
        {
          status: 200,
          headers: {},
          body: { uuid: 'matched' },
          timestamp: Date.now(),
        }
      );

      // Request with different UUID
      const res = await fetch(
        `http://localhost:${TEST_PORT}/api/items/123e4567-e89b-12d3-a456-426614174000`
      );
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.uuid).toBe('matched');
    });
  });

  describe('multiple mocks', () => {
    it('should serve correct mock based on method', async () => {
      const storage = server.getStorage();

      // GET /api/posts
      await storage.save(
        { id: '1', method: 'GET', url: '/api/posts', path: '/api/posts', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { action: 'list' }, timestamp: Date.now() }
      );

      // POST /api/posts
      await storage.save(
        { id: '2', method: 'POST', url: '/api/posts', path: '/api/posts', query: {}, headers: {}, timestamp: Date.now() },
        { status: 201, headers: {}, body: { action: 'create' }, timestamp: Date.now() }
      );

      // DELETE /api/posts
      await storage.save(
        { id: '3', method: 'DELETE', url: '/api/posts', path: '/api/posts', query: {}, headers: {}, timestamp: Date.now() },
        { status: 204, headers: {}, body: null, timestamp: Date.now() }
      );

      // Test GET
      let res = await fetch(`http://localhost:${TEST_PORT}/api/posts`);
      let data = await res.json();
      expect(data.action).toBe('list');

      // Test POST
      res = await fetch(`http://localhost:${TEST_PORT}/api/posts`, { method: 'POST' });
      data = await res.json();
      expect(data.action).toBe('create');

      // Test DELETE
      res = await fetch(`http://localhost:${TEST_PORT}/api/posts`, { method: 'DELETE' });
      expect(res.status).toBe(204);
    });

    it('should serve correct mock based on path', async () => {
      const storage = server.getStorage();

      await storage.save(
        { id: '1', method: 'GET', url: '/api/users', path: '/api/users', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { type: 'users' }, timestamp: Date.now() }
      );

      await storage.save(
        { id: '2', method: 'GET', url: '/api/posts', path: '/api/posts', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { type: 'posts' }, timestamp: Date.now() }
      );

      let res = await fetch(`http://localhost:${TEST_PORT}/api/users`);
      let data = await res.json();
      expect(data.type).toBe('users');

      res = await fetch(`http://localhost:${TEST_PORT}/api/posts`);
      data = await res.json();
      expect(data.type).toBe('posts');
    });
  });

  describe('response headers', () => {
    it('should include custom headers from mock', async () => {
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', url: '/api/data', path: '/api/data', query: {}, headers: {}, timestamp: Date.now() },
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-custom-header': 'custom-value',
          },
          body: { data: true },
          timestamp: Date.now(),
        }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/api/data`);

      expect(res.headers.get('x-custom-header')).toBe('custom-value');
    });
  });
});
