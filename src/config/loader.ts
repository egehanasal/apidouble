import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ApiDoubleConfig, ServerMode, MatchingStrategy, StorageType } from '../types/index.js';
import { DEFAULT_CONFIG, CONFIG_FILE_NAMES } from './defaults.js';

/**
 * Configuration file structure (YAML format)
 */
export interface ConfigFile {
  server?: {
    port?: number;
    mode?: ServerMode;
  };
  target?: {
    url?: string;
    timeout?: number;
  };
  storage?: {
    type?: StorageType;
    path?: string;
  };
  cors?: {
    enabled?: boolean;
    origins?: string[];
  };
  chaos?: {
    enabled?: boolean;
    latency?: {
      min?: number;
      max?: number;
    };
    errorRate?: number;
  };
  matching?: {
    strategy?: MatchingStrategy;
    ignoreHeaders?: string[];
    ignoreQueryParams?: string[];
  };
}

/**
 * CLI options that can override config file
 */
export interface CliOptions {
  port?: string;
  mode?: string;
  target?: string;
  storage?: string;
  config?: string;
  cors?: boolean;
  matching?: string;
}

/**
 * Find config file in current directory or parent directories
 */
export async function findConfigFile(startDir: string = process.cwd()): Promise<string | null> {
  let currentDir = resolve(startDir);
  const root = dirname(currentDir);

  while (currentDir !== root) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const filePath = resolve(currentDir, fileName);
      if (existsSync(filePath)) {
        return filePath;
      }
    }
    currentDir = dirname(currentDir);
  }

  // Check root directory too
  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = resolve(currentDir, fileName);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Load and parse a YAML config file
 */
export async function loadConfigFile(filePath: string): Promise<ConfigFile> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = parseYaml(content) as ConfigFile;
    return parsed ?? {};
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config file not found: ${filePath}`);
    }
    throw new Error(`Failed to parse config file: ${(error as Error).message}`);
  }
}

/**
 * Convert config file structure to ApiDoubleConfig
 */
export function configFileToApiConfig(file: ConfigFile): Partial<ApiDoubleConfig> {
  const config: Partial<ApiDoubleConfig> = {};

  if (file.server?.port !== undefined) {
    config.port = file.server.port;
  }

  if (file.server?.mode !== undefined) {
    config.mode = file.server.mode;
  }

  if (file.target?.url !== undefined) {
    config.target = file.target.url;
  }

  if (file.storage !== undefined) {
    config.storage = {
      type: file.storage.type ?? DEFAULT_CONFIG.storage.type,
      path: file.storage.path ?? DEFAULT_CONFIG.storage.path,
    };
  }

  if (file.cors !== undefined) {
    config.cors = {
      enabled: file.cors.enabled ?? DEFAULT_CONFIG.cors!.enabled,
      origins: file.cors.origins,
    };
  }

  if (file.chaos !== undefined) {
    config.chaos = {
      enabled: file.chaos.enabled ?? DEFAULT_CONFIG.chaos!.enabled,
      latency: file.chaos.latency
        ? {
            min: file.chaos.latency.min ?? DEFAULT_CONFIG.chaos!.latency!.min,
            max: file.chaos.latency.max ?? DEFAULT_CONFIG.chaos!.latency!.max,
          }
        : DEFAULT_CONFIG.chaos!.latency,
      errorRate: file.chaos.errorRate ?? DEFAULT_CONFIG.chaos!.errorRate,
    };
  }

  if (file.matching !== undefined) {
    config.matching = {
      strategy: file.matching.strategy ?? DEFAULT_CONFIG.matching!.strategy,
      ignoreHeaders: file.matching.ignoreHeaders ?? DEFAULT_CONFIG.matching!.ignoreHeaders,
      ignoreQueryParams: file.matching.ignoreQueryParams ?? DEFAULT_CONFIG.matching!.ignoreQueryParams,
    };
  }

  return config;
}

/**
 * Convert CLI options to ApiDoubleConfig
 */
function cliOptionsToApiConfig(cli: CliOptions): Partial<ApiDoubleConfig> {
  const config: Partial<ApiDoubleConfig> = {};

  if (cli.port !== undefined) {
    const port = parseInt(cli.port, 10);
    if (!isNaN(port)) {
      config.port = port;
    }
  }

  if (cli.mode !== undefined) {
    config.mode = cli.mode as ServerMode;
  }

  if (cli.target !== undefined) {
    config.target = cli.target;
  }

  if (cli.storage !== undefined) {
    config.storage = {
      type: 'lowdb',
      path: cli.storage,
    };
  }

  if (cli.cors !== undefined) {
    config.cors = {
      enabled: cli.cors,
    };
  }

  if (cli.matching !== undefined) {
    config.matching = {
      strategy: cli.matching as MatchingStrategy,
    };
  }

  return config;
}

/**
 * Merge config objects (source overrides target)
 */
function mergeConfig(
  target: ApiDoubleConfig,
  source: Partial<ApiDoubleConfig>
): ApiDoubleConfig {
  return {
    port: source.port ?? target.port,
    mode: source.mode ?? target.mode,
    target: source.target ?? target.target,
    storage: source.storage
      ? { ...target.storage, ...source.storage }
      : target.storage,
    cors: source.cors
      ? { ...target.cors, ...source.cors }
      : target.cors,
    chaos: source.chaos
      ? { ...target.chaos, ...source.chaos }
      : target.chaos,
    matching: source.matching
      ? { ...target.matching, ...source.matching }
      : target.matching,
  };
}

/**
 * Load configuration from file and CLI options
 * Priority: CLI options > Config file > Defaults
 */
export async function loadConfig(cliOptions: CliOptions = {}): Promise<ApiDoubleConfig> {
  let fileConfig: Partial<ApiDoubleConfig> = {};

  // Load from specified config file or auto-discover
  const configPath = cliOptions.config ?? await findConfigFile();

  if (configPath) {
    try {
      const configFile = await loadConfigFile(configPath);
      fileConfig = configFileToApiConfig(configFile);
    } catch (error) {
      // If config was explicitly specified, throw error
      if (cliOptions.config) {
        throw error;
      }
      // Otherwise, just ignore missing auto-discovered config
    }
  }

  // Convert CLI options
  const cliConfig = cliOptionsToApiConfig(cliOptions);

  // Merge: defaults <- file <- cli
  const merged = mergeConfig(DEFAULT_CONFIG, fileConfig);
  const final = mergeConfig(merged, cliConfig);

  return final;
}

/**
 * Validate configuration
 */
export function validateConfig(config: ApiDoubleConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate port
  if (config.port < 1 || config.port > 65535) {
    errors.push(`Invalid port: ${config.port}. Must be between 1 and 65535.`);
  }

  // Validate mode
  if (!['proxy', 'mock', 'intercept'].includes(config.mode)) {
    errors.push(`Invalid mode: ${config.mode}. Must be: proxy, mock, or intercept.`);
  }

  // Validate target for proxy/intercept mode
  if ((config.mode === 'proxy' || config.mode === 'intercept') && !config.target) {
    errors.push(`Target URL is required for ${config.mode} mode.`);
  }

  // Validate target URL format
  if (config.target) {
    try {
      new URL(config.target);
    } catch {
      errors.push(`Invalid target URL: ${config.target}`);
    }
  }

  // Validate storage type
  if (!['lowdb', 'sqlite'].includes(config.storage.type)) {
    errors.push(`Invalid storage type: ${config.storage.type}. Must be: lowdb or sqlite.`);
  }

  // Validate matching strategy
  if (config.matching && !['exact', 'smart', 'fuzzy'].includes(config.matching.strategy)) {
    errors.push(`Invalid matching strategy: ${config.matching.strategy}. Must be: exact, smart, or fuzzy.`);
  }

  // Validate chaos settings
  if (config.chaos?.enabled) {
    if (config.chaos.latency) {
      if (config.chaos.latency.min < 0) {
        errors.push('Chaos latency min must be >= 0');
      }
      if (config.chaos.latency.max < config.chaos.latency.min) {
        errors.push('Chaos latency max must be >= min');
      }
    }
    if (config.chaos.errorRate !== undefined) {
      if (config.chaos.errorRate < 0 || config.chaos.errorRate > 100) {
        errors.push('Chaos error rate must be between 0 and 100');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
