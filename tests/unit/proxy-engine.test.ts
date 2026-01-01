import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { ProxyEngine } from '../../src/core/proxy-engine.js';
import type { Storage } from '../../src/storage/base.js';
import type { RequestRecord, ResponseRecord, RecordedEntry } from '../../src/types/index.js';

// Mock storage
function createMockStorage(entries: RecordedEntry[] = []): Storage {
  const storedEntries = [...entries];

  return {
    init: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockImplementation(async (req: RequestRecord, res: ResponseRecord) => {
      const entry: RecordedEntry = {
        id: `entry-${storedEntries.length + 1}`,
        request: req,
        response: res,
        createdAt: Date.now(),
      };
      storedEntries.push(entry);
      return entry;
    }),
    find: vi.fn().mockImplementation(async (req: RequestRecord) => {
      return storedEntries.find(
        (e) => e.request.method === req.method && e.request.path === req.path
      ) ?? null;
    }),
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockImplementation(async () => [...storedEntries]),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockImplementation(async () => storedEntries.length),
  };
}

// Mock Express request
function createMockRequest(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    originalUrl: '/api/users',
    path: '/api/users',
    query: {},
    headers: { 'content-type': 'application/json' },
    body: undefined,
    ...overrides,
  } as Request;
}

// Mock Express response
function createMockResponse(): Response & { _status: number; _body: unknown; _headers: Record<string, string> } {
  const res = {
    _status: 200,
    _body: null,
    _headers: {} as Record<string, string>,
    status: vi.fn().mockImplementation(function(this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn().mockImplementation(function(this: typeof res, body: unknown) {
      this._body = body;
      return this;
    }),
    send: vi.fn().mockImplementation(function(this: typeof res, body: unknown) {
      this._body = body;
      return this;
    }),
    setHeader: vi.fn().mockImplementation(function(this: typeof res, key: string, value: string) {
      this._headers[key] = value;
      return this;
    }),
    headersSent: false,
  };
  return res as typeof res & Response;
}

describe('ProxyEngine', () => {
  describe('constructor', () => {
    it('should create engine in mock mode without target', () => {
      const storage = createMockStorage();
      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
      });

      expect(engine.getMode()).toBe('mock');
    });

    it('should throw error in proxy mode without target', () => {
      const storage = createMockStorage();

      expect(() => {
        new ProxyEngine({
          mode: 'proxy',
          storage,
        });
      }).toThrow('Target URL is required');
    });

    it('should create engine in proxy mode with target', () => {
      const storage = createMockStorage();
      const engine = new ProxyEngine({
        mode: 'proxy',
        target: 'http://api.example.com',
        storage,
      });

      expect(engine.getMode()).toBe('proxy');
    });
  });

  describe('mock mode', () => {
    it('should return stored response when match found', async () => {
      const entries: RecordedEntry[] = [
        {
          id: 'entry-1',
          request: {
            id: 'req-1',
            method: 'GET',
            url: '/api/users',
            path: '/api/users',
            query: {},
            headers: {},
            timestamp: Date.now(),
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { users: ['Alice', 'Bob'] },
            timestamp: Date.now(),
          },
          createdAt: Date.now(),
        },
      ];

      const storage = createMockStorage(entries);
      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ users: ['Alice', 'Bob'] });
      expect(next).not.toHaveBeenCalled();
    });

    it('should return 404 when no match found', async () => {
      const storage = createMockStorage([]);
      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(res._status).toBe(404);
      expect(res._body).toMatchObject({
        error: 'Not Found',
        message: 'No matching mock found for this request',
      });
    });

    it('should use smart matching for paths with IDs', async () => {
      const entries: RecordedEntry[] = [
        {
          id: 'entry-1',
          request: {
            id: 'req-1',
            method: 'GET',
            url: '/api/users/123',
            path: '/api/users/123',
            query: {},
            headers: {},
            timestamp: Date.now(),
          },
          response: {
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: { id: 123, name: 'Alice' },
            timestamp: Date.now(),
          },
          createdAt: Date.now(),
        },
      ];

      const storage = createMockStorage(entries);
      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
      });

      // Request with different ID should still match
      const req = createMockRequest({
        path: '/api/users/456',
        originalUrl: '/api/users/456',
      });
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(res._status).toBe(200);
      expect(res._body).toEqual({ id: 123, name: 'Alice' });
    });
  });

  describe('setMode', () => {
    it('should update mode at runtime', () => {
      const storage = createMockStorage();
      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
      });

      expect(engine.getMode()).toBe('mock');

      engine.setMode('proxy', 'http://api.example.com');
      expect(engine.getMode()).toBe('proxy');
    });
  });

  describe('callbacks', () => {
    it('should call onRequest callback', async () => {
      const storage = createMockStorage();
      const onRequest = vi.fn();

      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
        onRequest,
      });

      const req = createMockRequest();
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          path: '/api/users',
        })
      );
    });
  });

  describe('createRequestRecord', () => {
    it('should correctly parse request with body', async () => {
      const storage = createMockStorage();
      const onRequest = vi.fn();

      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
        onRequest,
      });

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        body: { name: 'John', email: 'john@example.com' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/api/users',
          body: { name: 'John', email: 'john@example.com' },
        })
      );
    });

    it('should correctly parse request with query params', async () => {
      const storage = createMockStorage();
      const onRequest = vi.fn();

      const engine = new ProxyEngine({
        mode: 'mock',
        storage,
        onRequest,
      });

      const req = createMockRequest({
        path: '/api/users',
        query: { page: '1', limit: '10' },
      });
      const res = createMockResponse();
      const next = vi.fn();

      const middleware = engine.middleware();
      await middleware(req, res, next);

      expect(onRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { page: '1', limit: '10' },
        })
      );
    });
  });
});
