import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiDouble } from '../../src/core/server.js';

describe('Admin Dashboard', () => {
  let server: ApiDouble;
  const PORT = 4050;
  const BASE_URL = `http://localhost:${PORT}`;

  beforeAll(async () => {
    server = new ApiDouble({
      port: PORT,
      mode: 'mock',
      storage: { type: 'lowdb', path: './test-mocks/dashboard-test.json' },
    });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('/__admin', () => {
    it('should serve the dashboard HTML', async () => {
      const res = await fetch(`${BASE_URL}/__admin`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');

      const html = await res.text();
      expect(html).toContain('ApiDouble Dashboard');
      expect(html).toContain('Server Status');
      expect(html).toContain('Mode Control');
      expect(html).toContain('Chaos Engineering');
    });
  });

  describe('/__chaos', () => {
    it('should return chaos stats', async () => {
      const res = await fetch(`${BASE_URL}/__chaos`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toHaveProperty('enabled');
      expect(data).toHaveProperty('requestsProcessed');
      expect(data).toHaveProperty('errorsInjected');
      expect(data).toHaveProperty('averageLatency');
    });

    it('should enable chaos via POST', async () => {
      const res = await fetch(`${BASE_URL}/__chaos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.enabled).toBe(true);

      // Verify it's enabled
      const getRes = await fetch(`${BASE_URL}/__chaos`);
      const stats = await getRes.json();
      expect(stats.enabled).toBe(true);
    });

    it('should disable chaos via POST', async () => {
      const res = await fetch(`${BASE_URL}/__chaos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.enabled).toBe(false);
    });

    it('should reject invalid enabled value', async () => {
      const res = await fetch(`${BASE_URL}/__chaos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'yes' }),
      });

      expect(res.status).toBe(400);
    });
  });
});
