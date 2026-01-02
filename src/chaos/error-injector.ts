/**
 * Error injection for chaos testing
 */

export interface ErrorConfig {
  /** Error rate as percentage (0-100) */
  rate: number;
  /** HTTP status code to return */
  status: number;
  /** Error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
}

export interface ErrorRule {
  id: string;
  /** HTTP method pattern ('*' for all) */
  method: string;
  /** URL path pattern (supports wildcards) */
  path: string;
  /** Error configuration */
  error: ErrorConfig;
  /** Whether this rule is enabled */
  enabled: boolean;
}

export interface InjectedError {
  status: number;
  body: {
    error: string;
    message: string;
    injected: true;
    details?: Record<string, unknown>;
  };
}

/**
 * Error injector for simulating failures
 */
export class ErrorInjector {
  private defaultError: ErrorConfig | null = null;
  private rules: Map<string, ErrorRule> = new Map();
  private ruleCounter = 0;

  /**
   * Set default error injection for all requests
   */
  setDefault(config: ErrorConfig | null): void {
    if (config) {
      this.defaultError = this.validateConfig(config);
    } else {
      this.defaultError = null;
    }
  }

  /**
   * Get default error config
   */
  getDefault(): ErrorConfig | null {
    return this.defaultError;
  }

  /**
   * Add an error injection rule for specific routes
   */
  addRule(method: string, path: string, error: ErrorConfig): string {
    const normalizedError = this.validateConfig(error);

    const id = `error-${++this.ruleCounter}`;
    this.rules.set(id, {
      id,
      method: method.toUpperCase(),
      path,
      error: normalizedError,
      enabled: true,
    });
    return id;
  }

  /**
   * Remove an error injection rule
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
  getRules(): ErrorRule[] {
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
  findMatchingRule(method: string, path: string): ErrorRule | null {
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      if (rule.method !== '*' && rule.method !== method.toUpperCase()) continue;
      if (this.matchPath(rule.path, path)) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Check if error should be injected for a request
   */
  shouldInjectError(method: string, path: string): InjectedError | null {
    // Check for specific rule first
    const rule = this.findMatchingRule(method, path);
    if (rule && this.shouldTrigger(rule.error.rate)) {
      return this.createError(rule.error);
    }

    // Fall back to default
    if (this.defaultError && this.shouldTrigger(this.defaultError.rate)) {
      return this.createError(this.defaultError);
    }

    return null;
  }

  /**
   * Validate and normalize error configuration
   */
  private validateConfig(config: ErrorConfig): ErrorConfig {
    // Provide defaults for missing fields
    const normalized: ErrorConfig = {
      rate: config.rate ?? 10,
      status: config.status ?? 500,
      message: config.message ?? 'Chaos-induced error',
      details: config.details,
    };

    if (normalized.rate < 0 || normalized.rate > 100) {
      throw new Error('Error rate must be between 0 and 100');
    }
    if (normalized.status < 400 || normalized.status > 599) {
      throw new Error('Error status must be between 400 and 599');
    }

    return normalized;
  }

  /**
   * Determine if error should trigger based on rate
   */
  private shouldTrigger(rate: number): boolean {
    if (rate === 0) return false;
    if (rate === 100) return true;
    return Math.random() * 100 < rate;
  }

  /**
   * Create error response
   */
  private createError(config: ErrorConfig): InjectedError {
    return {
      status: config.status,
      body: {
        error: this.getStatusText(config.status),
        message: config.message,
        injected: true,
        details: config.details,
      },
    };
  }

  /**
   * Get standard HTTP status text
   */
  private getStatusText(status: number): string {
    const statusTexts: Record<number, string> = {
      400: 'Bad Request',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'Not Found',
      408: 'Request Timeout',
      429: 'Too Many Requests',
      500: 'Internal Server Error',
      502: 'Bad Gateway',
      503: 'Service Unavailable',
      504: 'Gateway Timeout',
    };
    return statusTexts[status] ?? 'Error';
  }

  /**
   * Match path pattern (supports wildcards)
   */
  private matchPath(pattern: string, path: string): boolean {
    if (pattern === '*') return true;
    if (pattern === path) return true;

    // Simple wildcard matching
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*')
      .replace(/\\:\w+/g, '[^/]+');

    return new RegExp(`^${regexPattern}$`).test(path);
  }
}

/**
 * Common error presets
 */
export const ErrorPresets = {
  /** 500 Internal Server Error */
  serverError: (rate: number = 10): ErrorConfig => ({
    rate,
    status: 500,
    message: 'Simulated server error',
  }),

  /** 503 Service Unavailable */
  serviceUnavailable: (rate: number = 10): ErrorConfig => ({
    rate,
    status: 503,
    message: 'Service temporarily unavailable',
  }),

  /** 504 Gateway Timeout */
  timeout: (rate: number = 5): ErrorConfig => ({
    rate,
    status: 504,
    message: 'Gateway timeout',
  }),

  /** 429 Too Many Requests */
  rateLimited: (rate: number = 20): ErrorConfig => ({
    rate,
    status: 429,
    message: 'Rate limit exceeded',
    details: { retryAfter: 60 },
  }),

  /** 401 Unauthorized */
  unauthorized: (rate: number = 10): ErrorConfig => ({
    rate,
    status: 401,
    message: 'Authentication required',
  }),

  /** 403 Forbidden */
  forbidden: (rate: number = 10): ErrorConfig => ({
    rate,
    status: 403,
    message: 'Access denied',
  }),
};
