import type { Request } from 'express';
import type { RequestRecord, ResponseRecord } from '../types/index.js';

/**
 * Intercept rule definition
 */
export interface InterceptRule {
  id: string;
  method: string;
  path: string;
  pathPattern: RegExp;
  handler: InterceptHandler;
  priority: number;
  enabled: boolean;
}

/**
 * Context passed to intercept handlers
 */
export interface InterceptContext {
  request: RequestRecord;
  params: Record<string, string>;
  query: Record<string, string>;
}

/**
 * Handler function for intercepting responses
 */
export type InterceptHandler = (
  response: ResponseRecord,
  context: InterceptContext
) => ResponseRecord | Promise<ResponseRecord>;

/**
 * Interceptor manages response modification rules
 */
export class Interceptor {
  private rules: Map<string, InterceptRule> = new Map();
  private ruleCounter = 0;

  /**
   * Add an intercept rule
   */
  addRule(
    method: string,
    path: string,
    handler: InterceptHandler,
    options: { priority?: number; enabled?: boolean } = {}
  ): string {
    const id = `intercept-${++this.ruleCounter}`;
    const pathPattern = this.pathToRegex(path);

    const rule: InterceptRule = {
      id,
      method: method.toUpperCase(),
      path,
      pathPattern,
      handler,
      priority: options.priority ?? 0,
      enabled: options.enabled ?? true,
    };

    this.rules.set(id, rule);
    return id;
  }

  /**
   * Remove an intercept rule
   */
  removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  /**
   * Enable/disable a rule
   */
  setRuleEnabled(id: string, enabled: boolean): boolean {
    const rule = this.rules.get(id);
    if (rule) {
      rule.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Get all rules
   */
  getRules(): InterceptRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.rules.clear();
  }

  /**
   * Find matching rule for a request
   */
  findMatchingRule(method: string, path: string): InterceptRule | null {
    const matchingRules = Array.from(this.rules.values())
      .filter((rule) => {
        if (!rule.enabled) return false;
        if (rule.method !== '*' && rule.method !== method.toUpperCase()) return false;
        return rule.pathPattern.test(path);
      })
      .sort((a, b) => b.priority - a.priority);

    return matchingRules[0] ?? null;
  }

  /**
   * Apply intercept rule to a response
   */
  async applyRule(
    rule: InterceptRule,
    response: ResponseRecord,
    request: RequestRecord,
    expressReq: Request
  ): Promise<ResponseRecord> {
    const params = this.extractParams(rule.path, request.path);

    const context: InterceptContext = {
      request,
      params,
      query: expressReq.query as Record<string, string>,
    };

    const modifiedResponse = await rule.handler(response, context);

    return {
      ...modifiedResponse,
      timestamp: Date.now(),
    };
  }

  /**
   * Convert Express-style path to regex
   */
  private pathToRegex(path: string): RegExp {
    if (path === '*') {
      return /^.*$/;
    }

    let pattern = path;

    // 1. Escape ALL special regex characters including *
    pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // 2. Replace :param patterns (: is not a special regex char)
    pattern = pattern.replace(/:(\w+)/g, '([^/]+)');

    // 3. Replace escaped /* wildcard at end: \/\* -> /.*
    pattern = pattern.replace(/\/\\\*$/, '/.*');

    return new RegExp(`^${pattern}$`);
  }

  /**
   * Extract path parameters
   */
  private extractParams(pattern: string, actualPath: string): Record<string, string> {
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = actualPath.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        const paramName = patternParts[i].slice(1);
        params[paramName] = pathParts[i] ?? '';
      }
    }

    return params;
  }
}

/**
 * Helper functions for common intercept scenarios
 */
export const InterceptHelpers = {
  /**
   * Delay response by specified milliseconds
   */
  delay(ms: number): InterceptHandler {
    return async (response) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return response;
    };
  },

  /**
   * Replace response body
   */
  replaceBody(newBody: unknown): InterceptHandler {
    return (response) => ({
      ...response,
      body: newBody,
    });
  },

  /**
   * Modify response body with a function
   */
  modifyBody(modifier: (body: unknown) => unknown): InterceptHandler {
    return (response) => ({
      ...response,
      body: modifier(response.body),
    });
  },

  /**
   * Change status code
   */
  setStatus(status: number): InterceptHandler {
    return (response) => ({
      ...response,
      status,
    });
  },

  /**
   * Add or modify headers
   */
  setHeaders(headers: Record<string, string>): InterceptHandler {
    return (response) => ({
      ...response,
      headers: { ...response.headers, ...headers },
    });
  },

  /**
   * Simulate an error response
   */
  simulateError(status: number, message: string): InterceptHandler {
    return () => ({
      status,
      headers: { 'content-type': 'application/json' },
      body: { error: message },
      timestamp: Date.now(),
    });
  },

  /**
   * Chain multiple handlers
   */
  chain(...handlers: InterceptHandler[]): InterceptHandler {
    return async (response, context) => {
      let result = response;
      for (const handler of handlers) {
        result = await handler(result, context);
      }
      return result;
    };
  },
};
