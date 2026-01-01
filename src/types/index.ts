export type ServerMode = 'proxy' | 'mock' | 'intercept';
export type MatchingStrategy = 'exact' | 'smart' | 'fuzzy';
export type StorageType = 'lowdb' | 'sqlite';

export interface ApiDoubleConfig {
  port: number;
  mode: ServerMode;
  target?: string;
  storage: StorageConfig;
  cors?: CorsConfig;
  chaos?: ChaosConfig;
  matching?: MatchingConfig;
}

export interface StorageConfig {
  type: StorageType;
  path: string;
}

export interface CorsConfig {
  enabled: boolean;
  origins?: string[];
}

export interface ChaosConfig {
  enabled: boolean;
  latency?: LatencyConfig;
  errorRate?: number;
}

export interface LatencyConfig {
  min: number;
  max: number;
}

export interface MatchingConfig {
  strategy: MatchingStrategy;
  ignoreHeaders?: string[];
  ignoreQueryParams?: string[];
}

export interface RequestRecord {
  id: string;
  method: string;
  url: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body?: unknown;
  timestamp: number;
}

export interface ResponseRecord {
  status: number;
  headers: Record<string, string>;
  body?: unknown;
  timestamp: number;
}

export interface RecordedEntry {
  id: string;
  request: RequestRecord;
  response: ResponseRecord;
  createdAt: number;
}
