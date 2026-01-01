import type { ApiDoubleConfig } from '../types/index.js';

export class ApiDouble {
  private config: ApiDoubleConfig;

  constructor(config: Partial<ApiDoubleConfig> = {}) {
    this.config = {
      port: config.port ?? 3001,
      mode: config.mode ?? 'proxy',
      target: config.target,
      storage: config.storage ?? { type: 'lowdb', path: './mocks' },
      cors: config.cors ?? { enabled: true },
      chaos: config.chaos ?? { enabled: false },
      matching: config.matching ?? { strategy: 'smart' },
    };
  }

  async start(): Promise<void> {
    console.log(`ApiDouble starting on port ${this.config.port}...`);
    // TODO: Implement server startup
  }

  async stop(): Promise<void> {
    console.log('ApiDouble stopping...');
    // TODO: Implement server shutdown
  }

  getConfig(): ApiDoubleConfig {
    return this.config;
  }
}
