/**
 * Hot Reload - Watch config files and reload on changes
 */

import { watch, type FSWatcher } from 'chokidar';
import { loadConfigFile, configFileToApiConfig } from './loader.js';
import type { ApiDoubleConfig } from '../types/index.js';

export interface HotReloadConfig {
  /** Config file paths to watch */
  configPaths: string[];
  /** Debounce delay in milliseconds */
  debounceMs?: number;
  /** Callback when config is reloaded */
  onReload?: (config: Partial<ApiDoubleConfig>) => void;
  /** Callback when reload fails */
  onError?: (error: Error) => void;
  /** Callback when file changes are detected */
  onChange?: (path: string) => void;
}

export interface HotReloadStats {
  watching: boolean;
  reloadCount: number;
  lastReloadAt: number | null;
  lastError: Error | null;
  watchedPaths: string[];
}

/**
 * Hot reload service for watching config file changes
 */
export class HotReloadService {
  private watcher: FSWatcher | null = null;
  private config: HotReloadConfig;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private stats: HotReloadStats = {
    watching: false,
    reloadCount: 0,
    lastReloadAt: null,
    lastError: null,
    watchedPaths: [],
  };

  constructor(config: HotReloadConfig) {
    this.config = {
      debounceMs: 300,
      ...config,
    };
  }

  /**
   * Start watching config files
   */
  start(): void {
    if (this.watcher) {
      return;
    }

    this.watcher = watch(this.config.configPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    this.watcher.on('change', (path) => this.handleChange(path));
    this.watcher.on('add', (path) => this.handleChange(path));
    this.watcher.on('error', (error) => this.handleError(error instanceof Error ? error : new Error(String(error))));

    this.stats.watching = true;
    this.stats.watchedPaths = [...this.config.configPaths];
  }

  /**
   * Stop watching config files
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.stats.watching = false;
  }

  /**
   * Handle file change event
   */
  private handleChange(path: string): void {
    this.config.onChange?.(path);

    // Debounce reload
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.reload();
    }, this.config.debounceMs);
  }

  /**
   * Reload configuration
   */
  private async reload(): Promise<void> {
    try {
      // Try to load from each config path
      let loadedConfig: Partial<ApiDoubleConfig> | null = null;

      for (const configPath of this.config.configPaths) {
        try {
          const configFile = await loadConfigFile(configPath);
          loadedConfig = configFileToApiConfig(configFile);
          if (loadedConfig) break;
        } catch {
          // Try next path
        }
      }

      if (loadedConfig) {
        this.stats.reloadCount++;
        this.stats.lastReloadAt = Date.now();
        this.stats.lastError = null;
        this.config.onReload?.(loadedConfig);
      }
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    this.stats.lastError = error;
    this.config.onError?.(error);
  }

  /**
   * Get current stats
   */
  getStats(): HotReloadStats {
    return { ...this.stats };
  }

  /**
   * Check if watching
   */
  isWatching(): boolean {
    return this.stats.watching;
  }

  /**
   * Add a path to watch
   */
  addPath(path: string): void {
    if (this.watcher) {
      this.watcher.add(path);
      this.stats.watchedPaths.push(path);
    }
  }

  /**
   * Remove a path from watching
   */
  removePath(path: string): void {
    if (this.watcher) {
      this.watcher.unwatch(path);
      this.stats.watchedPaths = this.stats.watchedPaths.filter((p) => p !== path);
    }
  }
}

/**
 * Create a hot reload service for a server instance
 */
export function createHotReload(
  configPaths: string[],
  onReload: (config: Partial<ApiDoubleConfig>) => void,
  options: { debounceMs?: number; onError?: (error: Error) => void; onChange?: (path: string) => void } = {}
): HotReloadService {
  return new HotReloadService({
    configPaths,
    onReload,
    ...options,
  });
}
