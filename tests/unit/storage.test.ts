import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'node:fs/promises';
import { LowDBStorage, generateId } from '../../src/storage/index.js';
import type { RequestRecord, ResponseRecord } from '../../src/types/index.js';

const TEST_DB_PATH = './test-mocks/test-db.json';

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it('should generate IDs with timestamp prefix', () => {
    const before = Date.now();
    const id = generateId();
    const after = Date.now();

    const timestamp = parseInt(id.split('-')[0], 10);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });
});

describe('LowDBStorage', () => {
  let storage: LowDBStorage;

  const mockRequest: RequestRecord = {
    id: 'req-1',
    method: 'GET',
    url: 'http://localhost:3001/api/users',
    path: '/api/users',
    query: {},
    headers: { 'content-type': 'application/json' },
    timestamp: Date.now(),
  };

  const mockResponse: ResponseRecord = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { users: [{ id: 1, name: 'John' }] },
    timestamp: Date.now(),
  };

  beforeEach(async () => {
    storage = new LowDBStorage(TEST_DB_PATH);
    await storage.init();
  });

  afterEach(async () => {
    // Cleanup test database
    try {
      await rm('./test-mocks', { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('init', () => {
    it('should initialize storage and create directory', async () => {
      const newStorage = new LowDBStorage('./test-mocks/nested/dir/db.json');
      await expect(newStorage.init()).resolves.not.toThrow();
    });
  });

  describe('save', () => {
    it('should save a request-response pair', async () => {
      const entry = await storage.save(mockRequest, mockResponse);

      expect(entry.id).toBeTruthy();
      expect(entry.request).toEqual(mockRequest);
      expect(entry.response).toEqual(mockResponse);
      expect(entry.createdAt).toBeTruthy();
    });

    it('should persist data across instances', async () => {
      await storage.save(mockRequest, mockResponse);

      // Create new storage instance pointing to same file
      const newStorage = new LowDBStorage(TEST_DB_PATH);
      await newStorage.init();

      const entries = await newStorage.list();
      expect(entries).toHaveLength(1);
      expect(entries[0].request.path).toBe('/api/users');
    });
  });

  describe('find', () => {
    it('should find entry by method and path', async () => {
      await storage.save(mockRequest, mockResponse);

      const found = await storage.find({
        ...mockRequest,
        id: 'different-id',
        timestamp: Date.now(),
      });

      expect(found).not.toBeNull();
      expect(found?.request.path).toBe('/api/users');
    });

    it('should return null when no match found', async () => {
      const found = await storage.find({
        ...mockRequest,
        path: '/api/nonexistent',
      });

      expect(found).toBeNull();
    });

    it('should match by method', async () => {
      await storage.save(mockRequest, mockResponse);

      const found = await storage.find({
        ...mockRequest,
        method: 'POST',
      });

      expect(found).toBeNull();
    });
  });

  describe('findById', () => {
    it('should find entry by ID', async () => {
      const entry = await storage.save(mockRequest, mockResponse);

      const found = await storage.findById(entry.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(entry.id);
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

    it('should return all entries', async () => {
      await storage.save(mockRequest, mockResponse);
      await storage.save(
        { ...mockRequest, path: '/api/posts', url: 'http://localhost:3001/api/posts' },
        mockResponse
      );

      const entries = await storage.list();
      expect(entries).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete entry by ID', async () => {
      const entry = await storage.save(mockRequest, mockResponse);

      const deleted = await storage.delete(entry.id);

      expect(deleted).toBe(true);
      expect(await storage.count()).toBe(0);
    });

    it('should return false for non-existent ID', async () => {
      const deleted = await storage.delete('non-existent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', async () => {
      await storage.save(mockRequest, mockResponse);
      await storage.save(
        { ...mockRequest, path: '/api/posts' },
        mockResponse
      );

      await storage.clear();

      expect(await storage.count()).toBe(0);
    });
  });

  describe('count', () => {
    it('should return correct count', async () => {
      expect(await storage.count()).toBe(0);

      await storage.save(mockRequest, mockResponse);
      expect(await storage.count()).toBe(1);

      await storage.save(
        { ...mockRequest, path: '/api/posts' },
        mockResponse
      );
      expect(await storage.count()).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should throw error if used before init', async () => {
      const uninitializedStorage = new LowDBStorage('./some/path.json');

      await expect(uninitializedStorage.list()).rejects.toThrow(
        'Storage not initialized'
      );
    });
  });
});
