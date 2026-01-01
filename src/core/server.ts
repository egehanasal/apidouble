import express, { type Express, type Request, type Response, type RequestHandler } from 'express';
import cors from 'cors';
import type { Server } from 'http';
import type {
  ApiDoubleConfig,
  ServerMode,
  RequestRecord,
  ResponseRecord,
} from '../types/index.js';
import type { Storage } from '../storage/base.js';
import { LowDBStorage } from '../storage/lowdb.adapter.js';
import { ProxyEngine } from './proxy-engine.js';

export type RouteHandler = (req: {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
}) => { status?: number; headers?: Record<string, string>; body: unknown } | Promise<{ status?: number; headers?: Record<string, string>; body: unknown }>;

export interface ApiDoubleEvents {
  onRequest?: (req: RequestRecord) => void;
  onResponse?: (req: RequestRecord, res: ResponseRecord) => void;
  onError?: (error: Error, req: Request) => void;
  onStart?: (port: number) => void;
  onStop?: () => void;
}

export class ApiDouble {
  private config: ApiDoubleConfig;
  private app: Express;
  private server: Server | null = null;
  private storage: Storage;
  private engine: ProxyEngine | null = null;
  private events: ApiDoubleEvents;
  private customRoutes: Map<string, { method: string; path: string; handler: RouteHandler }> = new Map();
  private isRunning = false;

  constructor(config: Partial<ApiDoubleConfig> = {}, events: ApiDoubleEvents = {}) {
    this.config = {
      port: config.port ?? 3001,
      mode: config.mode ?? 'proxy',
      target: config.target,
      storage: config.storage ?? { type: 'lowdb', path: './mocks/db.json' },
      cors: config.cors ?? { enabled: true },
      chaos: config.chaos ?? { enabled: false },
      matching: config.matching ?? { strategy: 'smart' },
    };

    this.events = events;
    this.app = express();
    this.storage = this.createStorage();

    this.setupMiddleware();
  }

  /**
   * Create storage adapter based on config
   */
  private createStorage(): Storage {
    const { type, path } = this.config.storage;

    if (type === 'lowdb') {
      return new LowDBStorage(path);
    }

    // SQLite will be added in v1.1
    throw new Error(`Unsupported storage type: ${type}`);
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // CORS
    if (this.config.cors?.enabled) {
      const corsOptions: cors.CorsOptions = {
        origin: this.config.cors.origins ?? true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      };
      this.app.use(cors(corsOptions));
    }

    // Health check endpoint
    this.app.get('/__health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        mode: this.config.mode,
        uptime: process.uptime(),
      });
    });

    // Status endpoint
    this.app.get('/__status', async (_req: Request, res: Response) => {
      try {
        const count = await this.storage.count();
        res.json({
          mode: this.config.mode,
          target: this.config.target,
          recordedEntries: count,
          port: this.config.port,
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to get status' });
      }
    });

    // List mocks endpoint
    this.app.get('/__mocks', async (_req: Request, res: Response) => {
      try {
        const entries = await this.storage.list();
        res.json({
          count: entries.length,
          entries: entries.map((e) => ({
            id: e.id,
            method: e.request.method,
            path: e.request.path,
            status: e.response.status,
            createdAt: e.createdAt,
          })),
        });
      } catch (error) {
        res.status(500).json({ error: 'Failed to list mocks' });
      }
    });

    // Clear mocks endpoint
    this.app.delete('/__mocks', async (_req: Request, res: Response) => {
      try {
        await this.storage.clear();
        res.json({ success: true, message: 'All mocks cleared' });
      } catch (error) {
        res.status(500).json({ error: 'Failed to clear mocks' });
      }
    });

    // Delete specific mock
    this.app.delete('/__mocks/:id', async (req: Request, res: Response) => {
      try {
        const deleted = await this.storage.delete(req.params.id);
        if (deleted) {
          res.json({ success: true, message: 'Mock deleted' });
        } else {
          res.status(404).json({ error: 'Mock not found' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to delete mock' });
      }
    });

    // Mode switching endpoint
    this.app.post('/__mode', (req: Request, res: Response) => {
      const { mode, target } = req.body as { mode?: ServerMode; target?: string };

      if (!mode || !['proxy', 'mock', 'intercept'].includes(mode)) {
        res.status(400).json({ error: 'Invalid mode. Use: proxy, mock, or intercept' });
        return;
      }

      if ((mode === 'proxy' || mode === 'intercept') && !target && !this.config.target) {
        res.status(400).json({ error: 'Target URL required for proxy/intercept mode' });
        return;
      }

      this.config.mode = mode;
      if (target) {
        this.config.target = target;
      }

      if (this.engine) {
        this.engine.setMode(mode, target ?? this.config.target);
      }

      res.json({
        success: true,
        mode: this.config.mode,
        target: this.config.target,
      });
    });
  }

  /**
   * Register a custom route handler
   */
  route(method: string, path: string, handler: RouteHandler): this {
    const key = `${method.toUpperCase()}:${path}`;
    this.customRoutes.set(key, { method: method.toUpperCase(), path, handler });

    // If server is already running, add the route dynamically
    if (this.isRunning) {
      this.addRoute(method, path, handler);
    }

    return this;
  }

  /**
   * Add route to Express app
   */
  private addRoute(method: string, path: string, handler: RouteHandler): void {
    const expressHandler: RequestHandler = async (req, res) => {
      try {
        const result = await handler({
          params: req.params as Record<string, string>,
          query: req.query as Record<string, string>,
          body: req.body,
          headers: req.headers as Record<string, string>,
        });

        res.status(result.status ?? 200);

        if (result.headers) {
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value);
          }
        }

        res.json(result.body);
      } catch (error) {
        res.status(500).json({
          error: 'Route handler error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    };

    const methodLower = method.toLowerCase();
    if (methodLower === 'get') this.app.get(path, expressHandler);
    else if (methodLower === 'post') this.app.post(path, expressHandler);
    else if (methodLower === 'put') this.app.put(path, expressHandler);
    else if (methodLower === 'patch') this.app.patch(path, expressHandler);
    else if (methodLower === 'delete') this.app.delete(path, expressHandler);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    // Initialize storage
    await this.storage.init();

    // Add custom routes
    for (const { method, path, handler } of this.customRoutes.values()) {
      this.addRoute(method, path, handler);
    }

    // Create and setup proxy engine
    this.engine = new ProxyEngine({
      mode: this.config.mode,
      target: this.config.target,
      storage: this.storage,
      matchingConfig: this.config.matching,
      onRequest: this.events.onRequest,
      onResponse: this.events.onResponse,
      onError: this.events.onError,
    });

    // Add proxy engine middleware (must be last to catch all unhandled routes)
    this.app.use(this.engine.middleware());

    // Start listening
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          this.isRunning = true;
          this.events.onStart?.(this.config.port);
          resolve();
        });

        this.server.on('error', (error) => {
          this.isRunning = false;
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          reject(error);
        } else {
          this.isRunning = false;
          this.server = null;
          this.events.onStop?.();
          resolve();
        }
      });
    });
  }

  /**
   * Get current configuration
   */
  getConfig(): ApiDoubleConfig {
    return { ...this.config };
  }

  /**
   * Get storage instance
   */
  getStorage(): Storage {
    return this.storage;
  }

  /**
   * Get current mode
   */
  getMode(): ServerMode {
    return this.config.mode;
  }

  /**
   * Set mode at runtime
   */
  setMode(mode: ServerMode, target?: string): void {
    this.config.mode = mode;
    if (target) {
      this.config.target = target;
    }
    if (this.engine) {
      this.engine.setMode(mode, target ?? this.config.target);
    }
  }

  /**
   * Check if server is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Get the Express app instance (for advanced usage)
   */
  getApp(): Express {
    return this.app;
  }
}
