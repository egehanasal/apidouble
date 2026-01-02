import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { SQLiteStorage } from '../../src/storage/sqlite.adapter.js';
import type { RequestRecord, ResponseRecord } from '../../src/types/index.js';

const TEST_DB = './test-sqlite/test.db';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;

  const createRequest = (override: Partial<RequestRecord> = {}): RequestRecord => ({
    id: 'req-1',
    method: 'GET',
    url: '/api/users',
    path: '/api/users',
    query: {},
    headers: {},
    timestamp: Date.now(),
    ...override,
  });

  const createResponse = (override: Partial<ResponseRecord> = {}): ResponseRecord => ({
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { data: 'test' },
    timestamp: Date.now(),
    ...override,
  });

  beforeEach(async () => {
    storage = new SQLiteStorage(TEST_DB);
    await storage.init();
  });

  afterEach(async () => {
    storage.close();
    try {
      await rm('./test-sqlite', { recursive: true, force: true });
    } catch {
      // Ignore
    }
  });

  describe('init', () => {
    it('should create database and tables', async () => {
      const count = await storage.count();
      expect(count).toBe(0);
    });

    it('should handle re-initialization', async () => {
      const newStorage = new SQLiteStorage(TEST_DB);
      await newStorage.init();

      const count = await newStorage.count();
      expect(count).toBe(0);

      newStorage.close();
    });
  });

  describe('save', () => {
    it('should save request/response entry', async () => {
      const request = createRequest();
      const response = createResponse();

      const entry = await storage.save(request, response);

      expect(entry.id).toBeDefined();
      expect(entry.request.method).toBe('GET');
      expect(entry.response.status).toBe(200);
      expect(entry.createdAt).toBeDefined();
    });

    it('should save with body', async () => {
      const request = createRequest({
        method: 'POST',
        body: { name: 'Test User' },
      });
      const response = createResponse({
        status: 201,
        body: { id: 1, name: 'Test User' },
      });

      const entry = await storage.save(request, response);

      expect(entry.request.body).toEqual({ name: 'Test User' });
      expect(entry.response.body).toEqual({ id: 1, name: 'Test User' });
    });

    it('should save with query params', async () => {
      const request = createRequest({
        url: '/api/users?page=1&limit=10',
        query: { page: '1', limit: '10' },
      });
      const response = createResponse();

      const entry = await storage.save(request, response);

      expect(entry.request.query).toEqual({ page: '1', limit: '10' });
    });

    it('should save with headers', async () => {
      const request = createRequest({
        headers: { 'x-api-key': 'secret' },
      });
      const response = createResponse({
        headers: {
          'content-type': 'application/json',
          'x-request-id': '123',
        },
      });

      const entry = await storage.save(request, response);

      expect(entry.request.headers['x-api-key']).toBe('secret');
      expect(entry.response.headers['x-request-id']).toBe('123');
    });
  });

  describe('find', () => {
    it('should find entry by method and path', async () => {
      const request = createRequest();
      const response = createResponse();
      await storage.save(request, response);

      const found = await storage.find(request);

      expect(found).not.toBeNull();
      expect(found!.request.path).toBe('/api/users');
    });

    it('should return null when not found', async () => {
      const request = createRequest({ path: '/nonexistent' });

      const found = await storage.find(request);

      expect(found).toBeNull();
    });

    it('should return most recent match', async () => {
      const request = createRequest();
      await storage.save(request, createResponse({ body: { version: 1 } }));
      await storage.save(request, createResponse({ body: { version: 2 } }));

      const found = await storage.find(request);

      expect((found!.response.body as { version: number }).version).toBe(2);
    });
  });

  describe('findById', () => {
    it('should find entry by ID', async () => {
      const entry = await storage.save(createRequest(), createResponse());

      const found = await storage.findById(entry.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(entry.id);
    });

    it('should return null for non-existent ID', async () => {
      const found = await storage.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    it('should return empty array when no entries', async () => {
      const entries = await storage.list();

      expect(entries).toEqual([]);
    });

    it('should list all entries', async () => {
      await storage.save(createRequest({ path: '/api/users' }), createResponse());
      await storage.save(createRequest({ path: '/api/posts' }), createResponse());

      const entries = await storage.list();

      expect(entries).toHaveLength(2);
    });

    it('should order by created_at descending', async () => {
      await storage.save(createRequest({ path: '/first' }), createResponse());
      await new Promise((r) => setTimeout(r, 10));
      await storage.save(createRequest({ path: '/second' }), createResponse());

      const entries = await storage.list();

      expect(entries[0].request.path).toBe('/second');
      expect(entries[1].request.path).toBe('/first');
    });
  });

  describe('delete', () => {
    it('should delete entry by ID', async () => {
      const entry = await storage.save(createRequest(), createResponse());

      const deleted = await storage.delete(entry.id);

      expect(deleted).toBe(true);
      expect(await storage.count()).toBe(0);
    });

    it('should return false for non-existent ID', async () => {
      const deleted = await storage.delete('non-existent');

      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should delete all entries', async () => {
      await storage.save(createRequest(), createResponse());
      await storage.save(createRequest(), createResponse());

      await storage.clear();

      expect(await storage.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return 0 for empty storage', async () => {
      const count = await storage.count();

      expect(count).toBe(0);
    });

    it('should return correct count', async () => {
      await storage.save(createRequest(), createResponse());
      await storage.save(createRequest(), createResponse());
      await storage.save(createRequest(), createResponse());

      const count = await storage.count();

      expect(count).toBe(3);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await storage.save(
        createRequest({ method: 'GET', path: '/api/users' }),
        createResponse()
      );
      await storage.save(
        createRequest({ method: 'POST', path: '/api/users' }),
        createResponse({ status: 201 })
      );
      await storage.save(
        createRequest({ method: 'GET', path: '/api/posts' }),
        createResponse()
      );
    });

    it('should search by method', async () => {
      const results = await storage.search('POST');

      expect(results).toHaveLength(1);
      expect(results[0].request.method).toBe('POST');
    });

    it('should search by path pattern', async () => {
      const results = await storage.search(undefined, '/api/users');

      expect(results).toHaveLength(2);
    });

    it('should search with wildcard pattern', async () => {
      const results = await storage.search(undefined, '/api/*');

      expect(results).toHaveLength(3);
    });

    it('should search by method and path', async () => {
      const results = await storage.search('GET', '/api/users');

      expect(results).toHaveLength(1);
    });
  });

  describe('getByTimeRange', () => {
    it('should return entries within time range', async () => {
      const before = Date.now();
      await storage.save(createRequest(), createResponse());
      await new Promise((r) => setTimeout(r, 50));
      const middle = Date.now();
      await storage.save(createRequest(), createResponse());
      await new Promise((r) => setTimeout(r, 50));
      const after = Date.now();

      const results = await storage.getByTimeRange(middle - 10, after + 10);

      expect(results).toHaveLength(1);
    });

    it('should return empty for out-of-range', async () => {
      await storage.save(createRequest(), createResponse());

      const farFuture = Date.now() + 100000;
      const results = await storage.getByTimeRange(farFuture, farFuture + 1000);

      expect(results).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('should close database connection', async () => {
      storage.close();

      // Trying to use storage after close should throw
      await expect(storage.count()).rejects.toThrow();
    });
  });
});
