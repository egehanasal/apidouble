import { createProxyMiddleware, type Options } from 'http-proxy-middleware';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type {
  ServerMode,
  RequestRecord,
  ResponseRecord,
  ApiDoubleConfig,
} from '../types/index.js';
import type { Storage } from '../storage/base.js';
import { RequestMatcher } from './matcher.js';
import { generateId } from '../storage/base.js';
import { Interceptor, type InterceptHandler } from './interceptor.js';

export interface ProxyEngineConfig {
  mode: ServerMode;
  target?: string;
  storage: Storage;
  matchingConfig?: ApiDoubleConfig['matching'];
  onRequest?: (req: RequestRecord) => void;
  onResponse?: (req: RequestRecord, res: ResponseRecord) => void;
  onError?: (error: Error, req: Request) => void;
}

export class ProxyEngine {
  private config: ProxyEngineConfig;
  private matcher: RequestMatcher;
  private proxyMiddleware: RequestHandler | null = null;
  private interceptor: Interceptor;
  private pendingRequests: Map<string, Request> = new Map();

  constructor(config: ProxyEngineConfig) {
    this.config = config;
    this.matcher = new RequestMatcher(config.matchingConfig);
    this.interceptor = new Interceptor();

    if (config.mode === 'proxy' || config.mode === 'intercept') {
      if (!config.target) {
        throw new Error('Target URL is required for proxy/intercept mode');
      }
      this.proxyMiddleware = this.createProxy(config.target);
    }
  }

  /**
   * Add an intercept rule for modifying responses
   */
  intercept(method: string, path: string, handler: InterceptHandler): string {
    return this.interceptor.addRule(method, path, handler);
  }

  /**
   * Remove an intercept rule
   */
  removeIntercept(id: string): boolean {
    return this.interceptor.removeRule(id);
  }

  /**
   * Get the interceptor instance
   */
  getInterceptor(): Interceptor {
    return this.interceptor;
  }

  /**
   * Create the proxy middleware for forwarding requests
   */
  private createProxy(target: string): RequestHandler {
    const proxyOptions: Options = {
      target,
      changeOrigin: true,
      selfHandleResponse: true, // We'll handle response ourselves to record it
      on: {
        proxyReq: (proxyReq, req) => {
          // Re-stream the body since Express already consumed it
          const expressReq = req as Request;

          // Store request for intercept mode
          const requestId = generateId();
          (expressReq as Request & { _interceptId?: string })._interceptId = requestId;
          this.pendingRequests.set(requestId, expressReq);

          if (expressReq.body && Object.keys(expressReq.body).length > 0) {
            const bodyData = JSON.stringify(expressReq.body);
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        },
        proxyRes: (proxyRes, req, res) => {
          this.handleProxyResponse(proxyRes, req as Request, res as Response);
        },
        error: (err, req, res) => {
          this.handleProxyError(err, req as Request, res as Response);
        },
      },
    };

    return createProxyMiddleware(proxyOptions);
  }

  /**
   * Handle response from target server
   */
  private handleProxyResponse(
    proxyRes: import('http').IncomingMessage,
    req: Request,
    res: Response
  ): void {
    const chunks: Buffer[] = [];

    proxyRes.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    proxyRes.on('end', async () => {
      const body = Buffer.concat(chunks);
      const bodyString = body.toString('utf-8');

      // Parse body if JSON
      let parsedBody: unknown;
      try {
        parsedBody = JSON.parse(bodyString);
      } catch {
        parsedBody = bodyString;
      }

      // Create request/response records
      const requestRecord = this.createRequestRecord(req);
      let responseRecord: ResponseRecord = {
        status: proxyRes.statusCode ?? 200,
        headers: this.flattenHeaders(proxyRes.headers),
        body: parsedBody,
        timestamp: Date.now(),
      };

      // Get original Express request for intercept context
      const interceptId = (req as Request & { _interceptId?: string })._interceptId;
      const originalReq = interceptId ? this.pendingRequests.get(interceptId) : req;
      if (interceptId) {
        this.pendingRequests.delete(interceptId);
      }

      // Apply intercept rules in intercept mode
      if (this.config.mode === 'intercept') {
        const rule = this.interceptor.findMatchingRule(req.method, req.path);
        if (rule && originalReq) {
          try {
            responseRecord = await this.interceptor.applyRule(
              rule,
              responseRecord,
              requestRecord,
              originalReq
            );
          } catch (error) {
            console.error('Intercept rule error:', error);
          }
        }
      }

      // Save to storage
      try {
        await this.config.storage.save(requestRecord, responseRecord);
        this.config.onResponse?.(requestRecord, responseRecord);
      } catch (error) {
        console.error('Failed to save response:', error);
      }

      // Forward response to client
      res.status(responseRecord.status);

      // Set headers (excluding problematic ones)
      for (const [key, value] of Object.entries(responseRecord.headers)) {
        if (!['transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }

      // Send the (possibly modified) body
      if (typeof responseRecord.body === 'string') {
        res.send(responseRecord.body);
      } else {
        res.json(responseRecord.body);
      }
    });
  }

  /**
   * Handle proxy errors
   */
  private handleProxyError(err: Error, req: Request, res: Response): void {
    console.error('Proxy error:', err.message);
    this.config.onError?.(err, req);

    if (!res.headersSent) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Failed to connect to target server',
        details: err.message,
      });
    }
  }

  /**
   * Create a RequestRecord from Express Request
   */
  private createRequestRecord(req: Request): RequestRecord {
    return {
      id: generateId(),
      method: req.method,
      url: req.originalUrl,
      path: req.path,
      query: req.query as Record<string, string>,
      headers: this.flattenHeaders(req.headers),
      body: req.body,
      timestamp: Date.now(),
    };
  }

  /**
   * Flatten headers object (handle arrays)
   */
  private flattenHeaders(
    headers: import('http').IncomingHttpHeaders | Record<string, string>
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined) {
        result[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }
    return result;
  }

  /**
   * Get Express middleware for handling requests
   */
  middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const mode = this.config.mode;

      // Create request record for matching/logging
      const requestRecord = this.createRequestRecord(req);
      this.config.onRequest?.(requestRecord);

      if (mode === 'mock') {
        // Mock mode: return stored response
        await this.handleMockMode(requestRecord, res);
      } else if (mode === 'proxy') {
        // Proxy mode: forward to target and record
        this.handleProxyMode(req, res, next);
      } else if (mode === 'intercept') {
        // Intercept mode: forward but allow modification
        this.handleProxyMode(req, res, next);
      } else {
        next();
      }
    };
  }

  /**
   * Handle mock mode - return stored response
   */
  private async handleMockMode(
    requestRecord: RequestRecord,
    res: Response
  ): Promise<void> {
    try {
      // Get all entries and find best match
      const entries = await this.config.storage.list();
      const match = this.matcher.findMatch(requestRecord, entries);

      if (match) {
        const response = match.response;

        res.status(response.status);

        // Set headers
        for (const [key, value] of Object.entries(response.headers)) {
          if (!['transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        }

        res.json(response.body);
      } else {
        res.status(404).json({
          error: 'Not Found',
          message: 'No matching mock found for this request',
          request: {
            method: requestRecord.method,
            path: requestRecord.path,
          },
        });
      }
    } catch (error) {
      console.error('Mock mode error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve mock response',
      });
    }
  }

  /**
   * Handle proxy mode - forward to target
   */
  private handleProxyMode(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (this.proxyMiddleware) {
      this.proxyMiddleware(req, res, next);
    } else {
      res.status(500).json({
        error: 'Configuration Error',
        message: 'Proxy middleware not initialized',
      });
    }
  }

  /**
   * Get current mode
   */
  getMode(): ServerMode {
    return this.config.mode;
  }

  /**
   * Update mode at runtime
   */
  setMode(mode: ServerMode, target?: string): void {
    this.config.mode = mode;

    if ((mode === 'proxy' || mode === 'intercept') && target) {
      this.config.target = target;
      this.proxyMiddleware = this.createProxy(target);
    }
  }
}
