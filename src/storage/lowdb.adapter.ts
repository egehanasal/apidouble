import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { RequestRecord, ResponseRecord, RecordedEntry } from '../types/index.js';
import { type Storage, generateId } from './base.js';

interface LowDBData {
  entries: RecordedEntry[];
}

export class LowDBStorage implements Storage {
  private db: Low<LowDBData> | null = null;
  private path: string;

  constructor(path: string = './mocks/db.json') {
    // Use absolute path to avoid issues with temp file paths
    this.path = resolve(path);
  }

  async init(): Promise<void> {
    // Ensure directory exists
    const dir = dirname(this.path);
    await mkdir(dir, { recursive: true });

    // Initialize LowDB
    const adapter = new JSONFile<LowDBData>(this.path);
    this.db = new Low<LowDBData>(adapter, { entries: [] });

    // Read existing data
    await this.db.read();
  }

  private getDb(): Low<LowDBData> {
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

    db.data.entries.push(entry);
    await db.write();

    return entry;
  }

  async find(request: RequestRecord): Promise<RecordedEntry | null> {
    const db = this.getDb();

    // Basic matching: method + path
    const entry = db.data.entries.find(
      (e) => e.request.method === request.method && e.request.path === request.path
    );

    return entry ?? null;
  }

  async findById(id: string): Promise<RecordedEntry | null> {
    const db = this.getDb();
    const entry = db.data.entries.find((e) => e.id === id);
    return entry ?? null;
  }

  async list(): Promise<RecordedEntry[]> {
    const db = this.getDb();
    return [...db.data.entries];
  }

  async delete(id: string): Promise<boolean> {
    const db = this.getDb();
    const index = db.data.entries.findIndex((e) => e.id === id);

    if (index === -1) {
      return false;
    }

    db.data.entries.splice(index, 1);
    await db.write();
    return true;
  }

  async clear(): Promise<void> {
    const db = this.getDb();
    db.data.entries = [];
    await db.write();
  }

  async count(): Promise<number> {
    const db = this.getDb();
    return db.data.entries.length;
  }
}
