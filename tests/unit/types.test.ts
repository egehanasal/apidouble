import { describe, it, expect } from 'vitest';
import { ApiDouble } from '../../src/index.js';

describe('ApiDouble', () => {
  it('should create instance with default config', () => {
    const api = new ApiDouble();
    const config = api.getConfig();

    expect(config.port).toBe(3001);
    expect(config.mode).toBe('proxy');
    expect(config.storage.type).toBe('lowdb');
    expect(config.cors?.enabled).toBe(true);
  });

  it('should accept custom config', () => {
    const api = new ApiDouble({
      port: 4000,
      mode: 'mock',
      target: 'https://api.example.com',
    });
    const config = api.getConfig();

    expect(config.port).toBe(4000);
    expect(config.mode).toBe('mock');
    expect(config.target).toBe('https://api.example.com');
  });
});
