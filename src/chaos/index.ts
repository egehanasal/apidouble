/**
 * Chaos Engine - Simulate network conditions and failures
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { LatencySimulator, type LatencyConfig } from './latency.js';
import { ErrorInjector, type ErrorConfig, type InjectedError } from './error-injector.js';

export { LatencySimulator, type LatencyConfig, type LatencyRule } from './latency.js';
export { ErrorInjector, ErrorPresets, type ErrorConfig, type ErrorRule, type InjectedError } from './error-injector.js';

export interface ChaosConfig {
  /** Enable chaos features */
  enabled: boolean;
  /** Default latency settings */
  latency?: LatencyConfig;
  /** Default error rate (0-100) */
  errorRate?: number;
}

export interface ChaosStats {
  enabled: boolean;
  requestsProcessed: number;
  errorsInjected: number;
  totalLatencyAdded: number;
  averageLatency: number;
}

/**
 * Chaos Engine combines latency simulation and error injection
 */
export class ChaosEngine {
  private enabled: boolean;
  private latency: LatencySimulator;
  private errors: ErrorInjector;
  private stats: {
    requestsProcessed: number;
    errorsInjected: number;
    totalLatencyAdded: number;
  };

  constructor(config: ChaosConfig = { enabled: false }) {
    this.enabled = config.enabled;
    this.latency = new LatencySimulator();
    this.errors = new ErrorInjector();
    this.stats = {
      requestsProcessed: 0,
      errorsInjected: 0,
      totalLatencyAdded: 0,
    };

    // Apply default configs
    if (config.latency) {
      this.latency.setDefault(config.latency);
    }

    if (config.errorRate !== undefined && config.errorRate > 0) {
      this.errors.setDefault({
        rate: config.errorRate,
        status: 500,
        message: 'Chaos-induced server error',
      });
    }
  }

  /**
   * Enable chaos features
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable chaos features
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Check if chaos is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get latency simulator
   */
  getLatencySimulator(): LatencySimulator {
    return this.latency;
  }

  /**
   * Get error injector
   */
  getErrorInjector(): ErrorInjector {
    return this.errors;
  }

  /**
   * Set default latency
   */
  setLatency(config: LatencyConfig | null): void {
    this.latency.setDefault(config);
  }

  /**
   * Add a latency rule
   */
  addLatencyRule(method: string, path: string, config: LatencyConfig): string {
    return this.latency.addRule(method, path, config);
  }

  /**
   * Set default error rate
   */
  setErrorRate(rate: number, status: number = 500, message: string = 'Chaos-induced error'): void {
    if (rate === 0) {
      this.errors.setDefault(null);
    } else {
      this.errors.setDefault({ rate, status, message });
    }
  }

  /**
   * Add an error injection rule
   */
  addErrorRule(method: string, path: string, config: ErrorConfig): string {
    return this.errors.addRule(method, path, config);
  }

  /**
   * Get chaos statistics
   */
  getStats(): ChaosStats {
    return {
      enabled: this.enabled,
      requestsProcessed: this.stats.requestsProcessed,
      errorsInjected: this.stats.errorsInjected,
      totalLatencyAdded: this.stats.totalLatencyAdded,
      averageLatency:
        this.stats.requestsProcessed > 0
          ? Math.round(this.stats.totalLatencyAdded / this.stats.requestsProcessed)
          : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      requestsProcessed: 0,
      errorsInjected: 0,
      totalLatencyAdded: 0,
    };
  }

  /**
   * Clear all rules
   */
  clearRules(): void {
    this.latency.clearRules();
    this.errors.clearRules();
  }

  /**
   * Apply chaos to a request (for programmatic use)
   */
  async apply(
    method: string,
    path: string
  ): Promise<{ delayed: number; error: InjectedError | null }> {
    if (!this.enabled) {
      return { delayed: 0, error: null };
    }

    this.stats.requestsProcessed++;

    // Apply latency
    const delayed = await this.latency.apply(method, path);
    this.stats.totalLatencyAdded += delayed;

    // Check for error injection
    const error = this.errors.shouldInjectError(method, path);
    if (error) {
      this.stats.errorsInjected++;
    }

    return { delayed, error };
  }

  /**
   * Get Express middleware for chaos injection
   */
  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      if (!this.enabled) {
        return next();
      }

      this.stats.requestsProcessed++;

      // Apply latency
      const delayed = await this.latency.apply(req.method, req.path);
      this.stats.totalLatencyAdded += delayed;

      // Check for error injection
      const error = this.errors.shouldInjectError(req.method, req.path);
      if (error) {
        this.stats.errorsInjected++;
        res.status(error.status).json(error.body);
        return;
      }

      next();
    };
  }
}

/**
 * Quick setup helper for common chaos scenarios
 */
export const ChaosPresets = {
  /**
   * Slow network simulation (100-500ms latency)
   */
  slowNetwork(): ChaosConfig {
    return {
      enabled: true,
      latency: { min: 100, max: 500 },
    };
  },

  /**
   * Very slow network (500-2000ms latency)
   */
  verySlowNetwork(): ChaosConfig {
    return {
      enabled: true,
      latency: { min: 500, max: 2000 },
    };
  },

  /**
   * Unreliable service (10% error rate)
   */
  unreliable(): ChaosConfig {
    return {
      enabled: true,
      errorRate: 10,
    };
  },

  /**
   * Flaky service (5% errors + 100-300ms latency)
   */
  flaky(): ChaosConfig {
    return {
      enabled: true,
      latency: { min: 100, max: 300 },
      errorRate: 5,
    };
  },

  /**
   * Stress test scenario (high errors + high latency)
   */
  stress(): ChaosConfig {
    return {
      enabled: true,
      latency: { min: 200, max: 1000 },
      errorRate: 20,
    };
  },
};
