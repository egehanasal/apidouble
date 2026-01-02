import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { ApiDouble } from '../../src/index.js';

const TEST_PORT = 4102;
const TEST_DB_PATH = './test-routes/db.json';

describe('Integration: Custom Routes', () => {
  let server: ApiDouble;

  afterEach(async () => {
    if (server?.running()) {
      await server.stop();
    }
    try {
      await rm('./test-routes', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('route registration', () => {
    it('should handle custom GET route', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('GET', '/custom/hello', () => ({
        body: { message: 'Hello, World!' },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/custom/hello`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.message).toBe('Hello, World!');
    });

    it('should handle route with params', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('GET', '/users/:id', (req) => ({
        body: { userId: req.params.id },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/users/42`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.userId).toBe('42');
    });

    it('should handle route with query params', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('GET', '/search', (req) => ({
        body: { query: req.query.q, page: req.query.page },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/search?q=test&page=2`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.query).toBe('test');
      expect(data.page).toBe('2');
    });

    it('should handle POST route with body', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('POST', '/echo', (req) => ({
        status: 201,
        body: { received: req.body },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', value: 123 }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.received).toEqual({ name: 'Test', value: 123 });
    });

    it('should handle custom status codes', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('DELETE', '/resource/:id', () => ({
        status: 204,
        body: null,
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/resource/123`, {
        method: 'DELETE',
      });

      expect(res.status).toBe(204);
    });

    it('should handle custom headers', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('GET', '/with-headers', () => ({
        headers: {
          'X-Custom-Header': 'custom-value',
          'X-Another-Header': 'another-value',
        },
        body: { headers: 'included' },
      }));

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/with-headers`);

      expect(res.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(res.headers.get('X-Another-Header')).toBe('another-value');
    });

    it('should handle async route handlers', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server.route('GET', '/async', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { body: { async: true } };
      });

      await server.start();

      const res = await fetch(`http://localhost:${TEST_PORT}/async`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.async).toBe(true);
    });
  });

  describe('route priority', () => {
    it('should prioritize custom routes over mocks', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      // Custom route
      server.route('GET', '/api/data', () => ({
        body: { source: 'custom-route' },
      }));

      await server.start();

      // Add mock with same path
      const storage = server.getStorage();
      await storage.save(
        { id: '1', method: 'GET', path: '/api/data', url: '/api/data', query: {}, headers: {}, timestamp: Date.now() },
        { status: 200, headers: {}, body: { source: 'mock' }, timestamp: Date.now() }
      );

      const res = await fetch(`http://localhost:${TEST_PORT}/api/data`);
      const data = await res.json();

      // Custom route should take precedence
      expect(data.source).toBe('custom-route');
    });
  });

  describe('method chaining', () => {
    it('should support fluent route registration', async () => {
      server = new ApiDouble({
        port: TEST_PORT,
        mode: 'mock',
        storage: { type: 'lowdb', path: TEST_DB_PATH },
      });

      server
        .route('GET', '/route1', () => ({ body: { route: 1 } }))
        .route('GET', '/route2', () => ({ body: { route: 2 } }))
        .route('GET', '/route3', () => ({ body: { route: 3 } }));

      await server.start();

      const res1 = await fetch(`http://localhost:${TEST_PORT}/route1`);
      const res2 = await fetch(`http://localhost:${TEST_PORT}/route2`);
      const res3 = await fetch(`http://localhost:${TEST_PORT}/route3`);

      expect((await res1.json()).route).toBe(1);
      expect((await res2.json()).route).toBe(2);
      expect((await res3.json()).route).toBe(3);
    });
  });
});
