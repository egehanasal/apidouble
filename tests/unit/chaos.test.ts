import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChaosEngine,
  ChaosPresets,
  LatencySimulator,
  ErrorInjector,
  ErrorPresets,
} from '../../src/chaos/index.js';

describe('LatencySimulator', () => {
  let simulator: LatencySimulator;

  beforeEach(() => {
    simulator = new LatencySimulator();
  });

  describe('setDefault', () => {
    it('should set default latency', () => {
      simulator.setDefault({ min: 100, max: 200 });

      expect(simulator.getDefault()).toEqual({ min: 100, max: 200 });
    });

    it('should throw for invalid config (min > max)', () => {
      expect(() => {
        simulator.setDefault({ min: 200, max: 100 });
      }).toThrow('min must be less than or equal to max');
    });

    it('should accept null to disable', () => {
      simulator.setDefault({ min: 100, max: 200 });
      simulator.setDefault(null);

      expect(simulator.getDefault()).toBeNull();
    });
  });

  describe('addRule', () => {
    it('should add a latency rule', () => {
      const id = simulator.addRule('GET', '/api/slow', { min: 500, max: 1000 });

      expect(id).toMatch(/^latency-\d+$/);
      expect(simulator.getRules()).toHaveLength(1);
    });

    it('should throw for invalid latency config', () => {
      expect(() => {
        simulator.addRule('GET', '/test', { min: 200, max: 100 });
      }).toThrow();
    });
  });

  describe('getLatency', () => {
    it('should return 0 when no config', () => {
      const latency = simulator.getLatency('GET', '/api/test');
      expect(latency).toBe(0);
    });

    it('should use default latency', () => {
      simulator.setDefault({ min: 100, max: 100 });

      const latency = simulator.getLatency('GET', '/api/test');
      expect(latency).toBe(100);
    });

    it('should use rule latency over default', () => {
      simulator.setDefault({ min: 100, max: 100 });
      simulator.addRule('GET', '/api/slow', { min: 500, max: 500 });

      const latency = simulator.getLatency('GET', '/api/slow');
      expect(latency).toBe(500);
    });

    it('should return random value within range', () => {
      simulator.setDefault({ min: 100, max: 200 });

      const latencies = new Set<number>();
      for (let i = 0; i < 100; i++) {
        const latency = simulator.getLatency('GET', '/test');
        latencies.add(latency);
        expect(latency).toBeGreaterThanOrEqual(100);
        expect(latency).toBeLessThanOrEqual(200);
      }

      // Should have some variation
      expect(latencies.size).toBeGreaterThan(1);
    });
  });

  describe('apply', () => {
    it('should delay by latency amount', async () => {
      simulator.setDefault({ min: 50, max: 50 });

      const start = Date.now();
      const delayed = await simulator.apply('GET', '/test');
      const elapsed = Date.now() - start;

      expect(delayed).toBe(50);
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should not delay when latency is 0', async () => {
      const start = Date.now();
      const delayed = await simulator.apply('GET', '/test');
      const elapsed = Date.now() - start;

      expect(delayed).toBe(0);
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('rules', () => {
    it('should match wildcard method', () => {
      simulator.addRule('*', '/api/*', { min: 100, max: 100 });

      expect(simulator.getLatency('GET', '/api/test')).toBe(100);
      expect(simulator.getLatency('POST', '/api/test')).toBe(100);
    });

    it('should enable/disable rules', () => {
      const id = simulator.addRule('GET', '/test', { min: 100, max: 100 });

      simulator.setRuleEnabled(id, false);
      expect(simulator.getLatency('GET', '/test')).toBe(0);

      simulator.setRuleEnabled(id, true);
      expect(simulator.getLatency('GET', '/test')).toBe(100);
    });

    it('should remove rules', () => {
      const id = simulator.addRule('GET', '/test', { min: 100, max: 100 });

      simulator.removeRule(id);
      expect(simulator.getRules()).toHaveLength(0);
    });

    it('should clear all rules', () => {
      simulator.addRule('GET', '/test1', { min: 100, max: 100 });
      simulator.addRule('GET', '/test2', { min: 100, max: 100 });

      simulator.clearRules();
      expect(simulator.getRules()).toHaveLength(0);
    });
  });
});

describe('ErrorInjector', () => {
  let injector: ErrorInjector;

  beforeEach(() => {
    injector = new ErrorInjector();
  });

  describe('setDefault', () => {
    it('should set default error config', () => {
      injector.setDefault({ rate: 10, status: 500, message: 'Error' });

      expect(injector.getDefault()).toEqual({
        rate: 10,
        status: 500,
        message: 'Error',
      });
    });

    it('should throw for invalid rate', () => {
      expect(() => {
        injector.setDefault({ rate: 150, status: 500, message: 'Error' });
      }).toThrow('rate must be between 0 and 100');
    });

    it('should throw for invalid status', () => {
      expect(() => {
        injector.setDefault({ rate: 10, status: 200, message: 'Error' });
      }).toThrow('status must be between 400 and 599');
    });
  });

  describe('addRule', () => {
    it('should add an error rule', () => {
      const id = injector.addRule('GET', '/api/error', {
        rate: 100,
        status: 500,
        message: 'Test error',
      });

      expect(id).toMatch(/^error-\d+$/);
      expect(injector.getRules()).toHaveLength(1);
    });
  });

  describe('shouldInjectError', () => {
    it('should return null when no config', () => {
      const error = injector.shouldInjectError('GET', '/test');
      expect(error).toBeNull();
    });

    it('should always inject at 100% rate', () => {
      injector.setDefault({ rate: 100, status: 500, message: 'Error' });

      for (let i = 0; i < 10; i++) {
        const error = injector.shouldInjectError('GET', '/test');
        expect(error).not.toBeNull();
        expect(error!.status).toBe(500);
      }
    });

    it('should never inject at 0% rate', () => {
      injector.setDefault({ rate: 0, status: 500, message: 'Error' });

      for (let i = 0; i < 10; i++) {
        const error = injector.shouldInjectError('GET', '/test');
        expect(error).toBeNull();
      }
    });

    it('should use rule over default', () => {
      injector.setDefault({ rate: 100, status: 500, message: 'Default error' });
      injector.addRule('GET', '/api/special', {
        rate: 100,
        status: 503,
        message: 'Special error',
      });

      const error = injector.shouldInjectError('GET', '/api/special');
      expect(error!.status).toBe(503);
    });

    it('should include error details', () => {
      injector.setDefault({
        rate: 100,
        status: 429,
        message: 'Rate limited',
        details: { retryAfter: 60 },
      });

      const error = injector.shouldInjectError('GET', '/test');
      expect(error!.body.details).toEqual({ retryAfter: 60 });
    });
  });

  describe('rules', () => {
    it('should enable/disable rules', () => {
      const id = injector.addRule('GET', '/test', {
        rate: 100,
        status: 500,
        message: 'Error',
      });

      injector.setRuleEnabled(id, false);
      expect(injector.shouldInjectError('GET', '/test')).toBeNull();

      injector.setRuleEnabled(id, true);
      expect(injector.shouldInjectError('GET', '/test')).not.toBeNull();
    });
  });
});

describe('ErrorPresets', () => {
  it('should create serverError preset', () => {
    const config = ErrorPresets.serverError(15);

    expect(config.rate).toBe(15);
    expect(config.status).toBe(500);
  });

  it('should create serviceUnavailable preset', () => {
    const config = ErrorPresets.serviceUnavailable();

    expect(config.status).toBe(503);
  });

  it('should create timeout preset', () => {
    const config = ErrorPresets.timeout();

    expect(config.status).toBe(504);
  });

  it('should create rateLimited preset with details', () => {
    const config = ErrorPresets.rateLimited();

    expect(config.status).toBe(429);
    expect(config.details).toEqual({ retryAfter: 60 });
  });
});

describe('ChaosEngine', () => {
  describe('constructor', () => {
    it('should create disabled engine by default', () => {
      const engine = new ChaosEngine();

      expect(engine.isEnabled()).toBe(false);
    });

    it('should create enabled engine with config', () => {
      const engine = new ChaosEngine({ enabled: true });

      expect(engine.isEnabled()).toBe(true);
    });

    it('should apply default latency from config', () => {
      const engine = new ChaosEngine({
        enabled: true,
        latency: { min: 100, max: 200 },
      });

      const simulator = engine.getLatencySimulator();
      expect(simulator.getDefault()).toEqual({ min: 100, max: 200 });
    });

    it('should apply default error rate from config', () => {
      const engine = new ChaosEngine({
        enabled: true,
        errorRate: 10,
      });

      const injector = engine.getErrorInjector();
      expect(injector.getDefault()?.rate).toBe(10);
    });
  });

  describe('enable/disable', () => {
    it('should enable chaos', () => {
      const engine = new ChaosEngine();

      engine.enable();
      expect(engine.isEnabled()).toBe(true);
    });

    it('should disable chaos', () => {
      const engine = new ChaosEngine({ enabled: true });

      engine.disable();
      expect(engine.isEnabled()).toBe(false);
    });
  });

  describe('apply', () => {
    it('should not apply when disabled', async () => {
      const engine = new ChaosEngine({
        enabled: false,
        latency: { min: 100, max: 100 },
      });

      const start = Date.now();
      const result = await engine.apply('GET', '/test');
      const elapsed = Date.now() - start;

      expect(result.delayed).toBe(0);
      expect(result.error).toBeNull();
      expect(elapsed).toBeLessThan(50);
    });

    it('should apply latency when enabled', async () => {
      const engine = new ChaosEngine({
        enabled: true,
        latency: { min: 50, max: 50 },
      });

      const start = Date.now();
      const result = await engine.apply('GET', '/test');
      const elapsed = Date.now() - start;

      expect(result.delayed).toBe(50);
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('should return error when triggered', async () => {
      const engine = new ChaosEngine({
        enabled: true,
        errorRate: 100,
      });

      const result = await engine.apply('GET', '/test');

      expect(result.error).not.toBeNull();
      expect(result.error!.status).toBe(500);
    });
  });

  describe('stats', () => {
    it('should track requests processed', async () => {
      const engine = new ChaosEngine({ enabled: true });

      await engine.apply('GET', '/test1');
      await engine.apply('GET', '/test2');

      const stats = engine.getStats();
      expect(stats.requestsProcessed).toBe(2);
    });

    it('should track errors injected', async () => {
      const engine = new ChaosEngine({
        enabled: true,
        errorRate: 100,
      });

      await engine.apply('GET', '/test');

      const stats = engine.getStats();
      expect(stats.errorsInjected).toBe(1);
    });

    it('should track total latency', async () => {
      const engine = new ChaosEngine({
        enabled: true,
        latency: { min: 10, max: 10 },
      });

      await engine.apply('GET', '/test1');
      await engine.apply('GET', '/test2');

      const stats = engine.getStats();
      expect(stats.totalLatencyAdded).toBe(20);
      expect(stats.averageLatency).toBe(10);
    });

    it('should reset stats', async () => {
      const engine = new ChaosEngine({ enabled: true });

      await engine.apply('GET', '/test');
      engine.resetStats();

      const stats = engine.getStats();
      expect(stats.requestsProcessed).toBe(0);
    });
  });

  describe('rules', () => {
    it('should add latency rule', () => {
      const engine = new ChaosEngine({ enabled: true });

      engine.addLatencyRule('GET', '/slow', { min: 500, max: 1000 });

      const simulator = engine.getLatencySimulator();
      expect(simulator.getRules()).toHaveLength(1);
    });

    it('should add error rule', () => {
      const engine = new ChaosEngine({ enabled: true });

      engine.addErrorRule('GET', '/fail', {
        rate: 100,
        status: 503,
        message: 'Service unavailable',
      });

      const injector = engine.getErrorInjector();
      expect(injector.getRules()).toHaveLength(1);
    });

    it('should clear all rules', () => {
      const engine = new ChaosEngine({ enabled: true });

      engine.addLatencyRule('GET', '/slow', { min: 500, max: 1000 });
      engine.addErrorRule('GET', '/fail', { rate: 100, status: 500, message: 'Error' });

      engine.clearRules();

      expect(engine.getLatencySimulator().getRules()).toHaveLength(0);
      expect(engine.getErrorInjector().getRules()).toHaveLength(0);
    });
  });
});

describe('ChaosPresets', () => {
  it('should create slowNetwork preset', () => {
    const config = ChaosPresets.slowNetwork();

    expect(config.enabled).toBe(true);
    expect(config.latency).toEqual({ min: 100, max: 500 });
  });

  it('should create verySlowNetwork preset', () => {
    const config = ChaosPresets.verySlowNetwork();

    expect(config.latency?.min).toBe(500);
  });

  it('should create unreliable preset', () => {
    const config = ChaosPresets.unreliable();

    expect(config.errorRate).toBe(10);
  });

  it('should create flaky preset', () => {
    const config = ChaosPresets.flaky();

    expect(config.latency).toBeDefined();
    expect(config.errorRate).toBe(5);
  });

  it('should create stress preset', () => {
    const config = ChaosPresets.stress();

    expect(config.latency?.max).toBe(1000);
    expect(config.errorRate).toBe(20);
  });
});
