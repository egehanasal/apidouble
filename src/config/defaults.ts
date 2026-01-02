import type { ApiDoubleConfig } from '../types/index.js';

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: ApiDoubleConfig = {
  port: 3001,
  mode: 'mock',
  target: undefined,
  storage: {
    type: 'lowdb',
    path: './mocks/db.json',
  },
  cors: {
    enabled: true,
    origins: undefined,
  },
  chaos: {
    enabled: false,
    latency: {
      min: 0,
      max: 0,
    },
    errorRate: 0,
  },
  matching: {
    strategy: 'smart',
    ignoreHeaders: [
      'authorization',
      'cookie',
      'x-request-id',
      'x-correlation-id',
      'date',
      'user-agent',
    ],
    ignoreQueryParams: [],
  },
};

/**
 * Default config file names to search for
 */
export const CONFIG_FILE_NAMES = [
  'apidouble.config.yml',
  'apidouble.config.yaml',
  'apidouble.yml',
  'apidouble.yaml',
  '.apidoublerc.yml',
  '.apidoublerc.yaml',
];
