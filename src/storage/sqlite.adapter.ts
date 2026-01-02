import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RequestRecord, ResponseRecord, RecordedEntry } from '../types/index.js';
import { type Storage, generateId } from './base.js';

/**
 * SQLite-based storage adapter
 * Better for large datasets and concurrent access
 */
export class SQLiteStorage implements Storage {
  private db: DatabaseType | null = null;
  private path: string;

  constructor(path: string = './mocks/apidouble.db') {
    this.path = resolve(path);
  }

  async init(): Promise<void> {
    // Ensure directory exists
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });

    // Initialize SQLite database
    this.db = new Database(this.path);

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        request_method TEXT NOT NULL,
        request_url TEXT NOT NULL,
        request_path TEXT NOT NULL,
        request_query TEXT,
        request_headers TEXT,
        request_body TEXT,
        request_timestamp INTEGER NOT NULL,
        response_status INTEGER NOT NULL,
        response_headers TEXT,
        response_body TEXT,
        response_timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_method_path ON entries(request_method, request_path);
      CREATE INDEX IF NOT EXISTS idx_created_at ON entries(created_at);
    `);
  }

  private getDb(): DatabaseType {
    if (!this.db) {
      throw new Error('Storage not initialized. Call init() first.');
    }
    return this.db;
  }

  async save(request: RequestRecord, response: ResponseRecord): Promise<RecordedEntry> {
    const db = this.getDb();

    const entry: RecordedEntry = {
      id: generateId(),
      request,
      response,
      createdAt: Date.now(),
    };

    const stmt = db.prepare(`
      INSERT INTO entries (
        id, request_method, request_url, request_path, request_query,
        request_headers, request_body, request_timestamp,
        response_status, response_headers, response_body, response_timestamp,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      request.method,
      request.url,
      request.path,
      JSON.stringify(request.query),
      JSON.stringify(request.headers),
      request.body !== undefined ? JSON.stringify(request.body) : null,
      request.timestamp,
      response.status,
      JSON.stringify(response.headers),
      response.body !== undefined ? JSON.stringify(response.body) : null,
      response.timestamp,
      entry.createdAt
    );

    return entry;
  }

  async find(request: RequestRecord): Promise<RecordedEntry | null> {
    const db = this.getDb();

    const stmt = db.prepare(`
      SELECT * FROM entries
      WHERE request_method = ? AND request_path = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `);

    const row = stmt.get(request.method, request.path) as SQLiteRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEntry(row);
  }

  async findById(id: string): Promise<RecordedEntry | null> {
    const db = this.getDb();

    const stmt = db.prepare('SELECT * FROM entries WHERE id = ?');
    const row = stmt.get(id) as SQLiteRow | undefined;

    if (!row) {
      return null;
    }

    return this.rowToEntry(row);
  }

  async list(): Promise<RecordedEntry[]> {
    const db = this.getDb();

    const stmt = db.prepare('SELECT * FROM entries ORDER BY created_at DESC');
    const rows = stmt.all() as SQLiteRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  async delete(id: string): Promise<boolean> {
    const db = this.getDb();

    const stmt = db.prepare('DELETE FROM entries WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
  }

  async clear(): Promise<void> {
    const db = this.getDb();
    db.exec('DELETE FROM entries');
  }

  async count(): Promise<number> {
    const db = this.getDb();

    const stmt = db.prepare('SELECT COUNT(*) as count FROM entries');
    const result = stmt.get() as { count: number };

    return result.count;
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Search entries by method and path pattern
   */
  async search(method?: string, pathPattern?: string): Promise<RecordedEntry[]> {
    const db = this.getDb();

    let sql = 'SELECT * FROM entries WHERE 1=1';
    const params: string[] = [];

    if (method) {
      sql += ' AND request_method = ?';
      params.push(method);
    }

    if (pathPattern) {
      sql += ' AND request_path LIKE ?';
      params.push(pathPattern.replace(/\*/g, '%'));
    }

    sql += ' ORDER BY created_at DESC';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as SQLiteRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Get entries within a time range
   */
  async getByTimeRange(startTime: number, endTime: number): Promise<RecordedEntry[]> {
    const db = this.getDb();

    const stmt = db.prepare(`
      SELECT * FROM entries
      WHERE created_at >= ? AND created_at <= ?
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(startTime, endTime) as SQLiteRow[];

    return rows.map((row) => this.rowToEntry(row));
  }

  /**
   * Convert SQLite row to RecordedEntry
   */
  private rowToEntry(row: SQLiteRow): RecordedEntry {
    return {
      id: row.id,
      request: {
        id: row.id,
        method: row.request_method,
        url: row.request_url,
        path: row.request_path,
        query: JSON.parse(row.request_query || '{}'),
        headers: JSON.parse(row.request_headers || '{}'),
        body: row.request_body ? JSON.parse(row.request_body) : undefined,
        timestamp: row.request_timestamp,
      },
      response: {
        status: row.response_status,
        headers: JSON.parse(row.response_headers || '{}'),
        body: row.response_body ? JSON.parse(row.response_body) : undefined,
        timestamp: row.response_timestamp,
      },
      createdAt: row.created_at,
    };
  }
}

interface SQLiteRow {
  id: string;
  request_method: string;
  request_url: string;
  request_path: string;
  request_query: string | null;
  request_headers: string | null;
  request_body: string | null;
  request_timestamp: number;
  response_status: number;
  response_headers: string | null;
  response_body: string | null;
  response_timestamp: number;
  created_at: number;
}
