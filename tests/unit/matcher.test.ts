import { describe, it, expect, beforeEach } from 'vitest';
import { RequestMatcher } from '../../src/core/matcher.js';
import type { RequestRecord, RecordedEntry } from '../../src/types/index.js';

function createRequest(overrides: Partial<RequestRecord> = {}): RequestRecord {
  return {
    id: 'req-1',
    method: 'GET',
    url: 'http://localhost:3001/api/users',
    path: '/api/users',
    query: {},
    headers: { 'content-type': 'application/json' },
    timestamp: Date.now(),
    ...overrides,
  };
}

function createEntry(
  requestOverrides: Partial<RequestRecord> = {},
  id: string = 'entry-1'
): RecordedEntry {
  return {
    id,
    request: createRequest(requestOverrides),
    response: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { data: 'test' },
      timestamp: Date.now(),
    },
    createdAt: Date.now(),
  };
}

describe('RequestMatcher', () => {
  let matcher: RequestMatcher;

  beforeEach(() => {
    matcher = new RequestMatcher();
  });

  describe('constructor', () => {
    it('should use default config', () => {
      const config = matcher.getConfig();
      expect(config.strategy).toBe('smart');
      expect(config.ignoreHeaders).toContain('authorization');
    });

    it('should accept custom config', () => {
      const customMatcher = new RequestMatcher({
        strategy: 'exact',
        ignoreHeaders: ['x-custom-header'],
      });
      const config = customMatcher.getConfig();
      expect(config.strategy).toBe('exact');
      expect(config.ignoreHeaders).toContain('x-custom-header');
    });
  });

  describe('findMatch', () => {
    it('should return null for empty entries', () => {
      const request = createRequest();
      const result = matcher.findMatch(request, []);
      expect(result).toBeNull();
    });

    it('should match exact method and path', () => {
      const request = createRequest();
      const entries = [createEntry()];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
      expect(result?.id).toBe('entry-1');
    });

    it('should not match different methods', () => {
      const request = createRequest({ method: 'POST' });
      const entries = [createEntry({ method: 'GET' })];

      const result = matcher.findMatch(request, entries);
      expect(result).toBeNull();
    });

    it('should not match different paths', () => {
      const request = createRequest({ path: '/api/posts' });
      const entries = [createEntry({ path: '/api/users' })];

      const result = matcher.findMatch(request, entries);
      expect(result).toBeNull();
    });

    it('should return best match when multiple entries match', () => {
      const request = createRequest({
        path: '/api/users',
        query: { page: '1' },
      });

      const entries = [
        createEntry({ path: '/api/users', query: {} }, 'entry-1'),
        createEntry({ path: '/api/users', query: { page: '1' } }, 'entry-2'),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result?.id).toBe('entry-2'); // Better query match
    });
  });

  describe('smart matching - path with IDs', () => {
    it('should match paths with numeric IDs', () => {
      const request = createRequest({ path: '/api/users/123' });
      const entries = [createEntry({ path: '/api/users/456' })];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
    });

    it('should match paths with UUIDs', () => {
      const request = createRequest({
        path: '/api/users/550e8400-e29b-41d4-a716-446655440000',
      });
      const entries = [
        createEntry({
          path: '/api/users/123e4567-e89b-12d3-a456-426614174000',
        }),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
    });

    it('should not match paths with different structure', () => {
      const request = createRequest({ path: '/api/users/123/posts' });
      const entries = [createEntry({ path: '/api/users/456' })];

      const result = matcher.findMatch(request, entries);
      expect(result).toBeNull();
    });

    it('should not match paths with different non-ID segments', () => {
      const request = createRequest({ path: '/api/users/123' });
      const entries = [createEntry({ path: '/api/posts/456' })];

      const result = matcher.findMatch(request, entries);
      expect(result).toBeNull();
    });
  });

  describe('exact strategy', () => {
    beforeEach(() => {
      matcher = new RequestMatcher({ strategy: 'exact' });
    });

    it('should require exact path match', () => {
      const request = createRequest({ path: '/api/users/123' });
      const entries = [createEntry({ path: '/api/users/456' })];

      const result = matcher.findMatch(request, entries);
      expect(result).toBeNull();
    });

    it('should match identical paths', () => {
      const request = createRequest({ path: '/api/users/123' });
      const entries = [createEntry({ path: '/api/users/123' })];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
    });
  });

  describe('query parameter matching', () => {
    it('should prefer entries with matching query params', () => {
      const request = createRequest({
        query: { page: '1', limit: '10' },
      });

      const entries = [
        createEntry({ query: { page: '2', limit: '10' } }, 'entry-1'),
        createEntry({ query: { page: '1', limit: '10' } }, 'entry-2'),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result?.id).toBe('entry-2');
    });

    it('should match entries without query params', () => {
      const request = createRequest({ query: {} });
      const entries = [createEntry({ query: {} })];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
    });
  });

  describe('header matching', () => {
    it('should ignore authorization header by default', () => {
      const request = createRequest({
        headers: { authorization: 'Bearer token1', 'content-type': 'application/json' },
      });
      const entries = [
        createEntry({
          headers: { authorization: 'Bearer token2', 'content-type': 'application/json' },
        }),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result).not.toBeNull();
    });

    it('should match headers that are not ignored', () => {
      const request = createRequest({
        headers: { 'x-custom': 'value1', 'content-type': 'application/json' },
      });

      const entries = [
        createEntry({ headers: { 'x-custom': 'value2' } }, 'entry-1'),
        createEntry({ headers: { 'x-custom': 'value1' } }, 'entry-2'),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result?.id).toBe('entry-2');
    });
  });

  describe('body matching', () => {
    it('should match identical request bodies', () => {
      const request = createRequest({
        method: 'POST',
        body: { name: 'John', email: 'john@example.com' },
      });

      const entries = [
        createEntry({
          method: 'POST',
          body: { name: 'Jane', email: 'jane@example.com' },
        }, 'entry-1'),
        createEntry({
          method: 'POST',
          body: { name: 'John', email: 'john@example.com' },
        }, 'entry-2'),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result?.id).toBe('entry-2');
    });

    it('should prefer entries with more matching body fields', () => {
      const request = createRequest({
        method: 'POST',
        body: { name: 'John', email: 'john@example.com', age: 30 },
      });

      const entries = [
        createEntry({
          method: 'POST',
          body: { name: 'John' },
        }, 'entry-1'),
        createEntry({
          method: 'POST',
          body: { name: 'John', email: 'john@example.com' },
        }, 'entry-2'),
      ];

      const result = matcher.findMatch(request, entries);
      expect(result?.id).toBe('entry-2');
    });
  });

  describe('findAllMatches', () => {
    it('should return all matching entries sorted by score', () => {
      const request = createRequest({ query: { page: '1' } });

      const entries = [
        createEntry({ query: {} }, 'entry-1'),
        createEntry({ query: { page: '1' } }, 'entry-2'),
        createEntry({ query: { page: '1', limit: '10' } }, 'entry-3'),
      ];

      const results = matcher.findAllMatches(request, entries);

      expect(results).toHaveLength(3);
      expect(results[0].entry.id).toBe('entry-2'); // Exact query match
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('should return empty array when no matches', () => {
      const request = createRequest({ method: 'DELETE' });
      const entries = [createEntry({ method: 'GET' })];

      const results = matcher.findAllMatches(request, entries);
      expect(results).toHaveLength(0);
    });
  });
});
