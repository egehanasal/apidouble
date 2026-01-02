/**
 * Latency simulation for chaos testing
 */

export interface LatencyConfig {
  /** Minimum delay in milliseconds */
  min: number;
  /** Maximum delay in milliseconds */
  max: number;
}

export interface LatencyRule {
  id: string;
  /** HTTP method pattern ('*' for all) */
  method: string;
  /** URL path pattern (supports wildcards) */
  path: string;
  /** Latency configuration */
  latency: LatencyConfig;
  /** Whether this rule is enabled */
  enabled: boolean;
}

/**
 * Latency simulator for adding artificial delays
 */
export class LatencySimulator {
  private defaultLatency: LatencyConfig | null = null;
  private rules: Map<string, LatencyRule> = new Map();
  private ruleCounter = 0;

  /**
   * Set default latency for all requests
   */
  setDefault(config: LatencyConfig | null): void {
    if (config && config.min > config.max) {
      throw new Error('Latency min must be less than or equal to max');
    }
    this.defaultLatency = config;
  }

  /**
   * Get default latency
   */
  getDefault(): LatencyConfig | null {
    return this.defaultLatency;
  }

  /**
   * Add a latency rule for specific routes
   */
  addRule(method: string, path: string, latency: LatencyConfig): string {
    if (latency.min > latency.max) {
      throw new Error('Latency min must be less than or equal to max');
    }

    const id = `latency-${++this.ruleCounter}`;
    this.rules.set(id, {
      id,
      method: method.toUpperCase(),
      path,
      latency,
      enabled: true,
    });
    return id;
  }

  /**
   * Remove a latency rule
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
  getRules(): LatencyRule[] {
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
  findMatchingRule(method: string, path: string): LatencyRule | null {
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
   * Get latency to apply for a request
   */
  getLatency(method: string, path: string): number {
    // Check for specific rule first
    const rule = this.findMatchingRule(method, path);
    if (rule) {
      return this.calculateDelay(rule.latency);
    }

    // Fall back to default
    if (this.defaultLatency) {
      return this.calculateDelay(this.defaultLatency);
    }

    return 0;
  }

  /**
   * Apply latency delay
   */
  async apply(method: string, path: string): Promise<number> {
    const delay = this.getLatency(method, path);
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    return delay;
  }

  /**
   * Calculate random delay within range
   */
  private calculateDelay(config: LatencyConfig): number {
    if (config.min === config.max) {
      return config.min;
    }
    return Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
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
