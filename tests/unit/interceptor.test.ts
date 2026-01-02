import { describe, it, expect, beforeEach } from 'vitest';
import { Interceptor, InterceptHelpers } from '../../src/core/interceptor.js';
import type { RequestRecord, ResponseRecord } from '../../src/types/index.js';
import type { Request } from 'express';

describe('Interceptor', () => {
  let interceptor: Interceptor;

  beforeEach(() => {
    interceptor = new Interceptor();
  });

  describe('addRule', () => {
    it('should add an intercept rule', () => {
      const id = interceptor.addRule('GET', '/api/users', (res) => res);

      expect(id).toMatch(/^intercept-\d+$/);
      expect(interceptor.getRules()).toHaveLength(1);
    });

    it('should support wildcard method', () => {
      interceptor.addRule('*', '/api/*', (res) => res);

      const rule = interceptor.findMatchingRule('POST', '/api/test');
      expect(rule).not.toBeNull();
    });

    it('should return unique IDs', () => {
      const id1 = interceptor.addRule('GET', '/test1', (res) => res);
      const id2 = interceptor.addRule('GET', '/test2', (res) => res);

      expect(id1).not.toBe(id2);
    });
  });

  describe('removeRule', () => {
    it('should remove an existing rule', () => {
      const id = interceptor.addRule('GET', '/test', (res) => res);

      expect(interceptor.removeRule(id)).toBe(true);
      expect(interceptor.getRules()).toHaveLength(0);
    });

    it('should return false for non-existent rule', () => {
      expect(interceptor.removeRule('non-existent')).toBe(false);
    });
  });

  describe('setRuleEnabled', () => {
    it('should disable a rule', () => {
      const id = interceptor.addRule('GET', '/test', (res) => res);

      interceptor.setRuleEnabled(id, false);

      const rule = interceptor.findMatchingRule('GET', '/test');
      expect(rule).toBeNull();
    });

    it('should re-enable a rule', () => {
      const id = interceptor.addRule('GET', '/test', (res) => res);
      interceptor.setRuleEnabled(id, false);
      interceptor.setRuleEnabled(id, true);

      const rule = interceptor.findMatchingRule('GET', '/test');
      expect(rule).not.toBeNull();
    });
  });

  describe('findMatchingRule', () => {
    it('should find exact path match', () => {
      interceptor.addRule('GET', '/api/users', (res) => res);

      const rule = interceptor.findMatchingRule('GET', '/api/users');
      expect(rule).not.toBeNull();
      expect(rule!.path).toBe('/api/users');
    });

    it('should match path with params', () => {
      interceptor.addRule('GET', '/api/users/:id', (res) => res);

      const rule = interceptor.findMatchingRule('GET', '/api/users/123');
      expect(rule).not.toBeNull();
    });

    it('should not match different method', () => {
      interceptor.addRule('GET', '/api/users', (res) => res);

      const rule = interceptor.findMatchingRule('POST', '/api/users');
      expect(rule).toBeNull();
    });

    it('should return null when no rules match', () => {
      interceptor.addRule('GET', '/api/users', (res) => res);

      const rule = interceptor.findMatchingRule('GET', '/api/posts');
      expect(rule).toBeNull();
    });

    it('should prioritize higher priority rules', () => {
      interceptor.addRule('GET', '/api/*', (res) => ({ ...res, body: 'low' }), {
        priority: 1,
      });
      interceptor.addRule('GET', '/api/users', (res) => ({ ...res, body: 'high' }), {
        priority: 10,
      });

      const rule = interceptor.findMatchingRule('GET', '/api/users');
      expect(rule!.priority).toBe(10);
    });
  });

  describe('applyRule', () => {
    const mockRequest: RequestRecord = {
      id: 'req-1',
      method: 'GET',
      url: '/api/users/123',
      path: '/api/users/123',
      query: {},
      headers: {},
      timestamp: Date.now(),
    };

    const mockResponse: ResponseRecord = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { name: 'Test User' },
      timestamp: Date.now(),
    };

    const mockExpressReq = {
      query: { page: '1' },
    } as unknown as Request;

    it('should apply intercept handler', async () => {
      interceptor.addRule('GET', '/api/users/:id', (res) => ({
        ...res,
        status: 201,
      }));

      const rule = interceptor.findMatchingRule('GET', '/api/users/123');
      const result = await interceptor.applyRule(
        rule!,
        mockResponse,
        mockRequest,
        mockExpressReq
      );

      expect(result.status).toBe(201);
    });

    it('should pass params to handler', async () => {
      let capturedParams: Record<string, string> = {};

      interceptor.addRule('GET', '/api/users/:id', (res, ctx) => {
        capturedParams = ctx.params;
        return res;
      });

      const rule = interceptor.findMatchingRule('GET', '/api/users/123');
      await interceptor.applyRule(rule!, mockResponse, mockRequest, mockExpressReq);

      expect(capturedParams.id).toBe('123');
    });

    it('should handle async handlers', async () => {
      interceptor.addRule('GET', '/api/users/:id', async (res) => {
        await new Promise((r) => setTimeout(r, 10));
        return { ...res, body: 'async' };
      });

      const rule = interceptor.findMatchingRule('GET', '/api/users/123');
      const result = await interceptor.applyRule(
        rule!,
        mockResponse,
        mockRequest,
        mockExpressReq
      );

      expect(result.body).toBe('async');
    });
  });

  describe('clearRules', () => {
    it('should clear all rules', () => {
      interceptor.addRule('GET', '/test1', (res) => res);
      interceptor.addRule('GET', '/test2', (res) => res);

      interceptor.clearRules();

      expect(interceptor.getRules()).toHaveLength(0);
    });
  });
});

describe('InterceptHelpers', () => {
  const mockResponse: ResponseRecord = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: { name: 'Test' },
    timestamp: Date.now(),
  };

  const mockContext = {
    request: {} as RequestRecord,
    params: {},
    query: {},
  };

  describe('delay', () => {
    it('should delay response', async () => {
      const handler = InterceptHelpers.delay(50);
      const start = Date.now();

      await handler(mockResponse, mockContext);

      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('replaceBody', () => {
    it('should replace response body', async () => {
      const handler = InterceptHelpers.replaceBody({ replaced: true });
      const result = await handler(mockResponse, mockContext);

      expect(result.body).toEqual({ replaced: true });
    });
  });

  describe('modifyBody', () => {
    it('should modify response body', async () => {
      const handler = InterceptHelpers.modifyBody((body) => ({
        ...(body as object),
        modified: true,
      }));
      const result = await handler(mockResponse, mockContext);

      expect(result.body).toEqual({ name: 'Test', modified: true });
    });
  });

  describe('setStatus', () => {
    it('should change status code', async () => {
      const handler = InterceptHelpers.setStatus(404);
      const result = await handler(mockResponse, mockContext);

      expect(result.status).toBe(404);
    });
  });

  describe('setHeaders', () => {
    it('should add headers', async () => {
      const handler = InterceptHelpers.setHeaders({ 'X-Custom': 'value' });
      const result = await handler(mockResponse, mockContext);

      expect(result.headers['X-Custom']).toBe('value');
      expect(result.headers['content-type']).toBe('application/json');
    });
  });

  describe('simulateError', () => {
    it('should return error response', async () => {
      const handler = InterceptHelpers.simulateError(500, 'Server error');
      const result = await handler(mockResponse, mockContext);

      expect(result.status).toBe(500);
      expect(result.body).toEqual({ error: 'Server error' });
    });
  });

  describe('chain', () => {
    it('should chain multiple handlers', async () => {
      const handler = InterceptHelpers.chain(
        InterceptHelpers.setStatus(201),
        InterceptHelpers.setHeaders({ 'X-Test': 'yes' }),
        InterceptHelpers.modifyBody((b) => ({ ...(b as object), chained: true }))
      );

      const result = await handler(mockResponse, mockContext);

      expect(result.status).toBe(201);
      expect(result.headers['X-Test']).toBe('yes');
      expect((result.body as Record<string, unknown>).chained).toBe(true);
    });
  });
});
