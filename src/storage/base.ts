import type { RequestRecord, ResponseRecord, RecordedEntry } from '../types/index.js';

export interface Storage {
  /**
   * Initialize the storage (create files/tables if needed)
   */
  init(): Promise<void>;

  /**
   * Save a request-response pair
   */
  save(request: RequestRecord, response: ResponseRecord): Promise<RecordedEntry>;

  /**
   * Find a matching response for a request
   */
  find(request: RequestRecord): Promise<RecordedEntry | null>;

  /**
   * Find a response by its ID
   */
  findById(id: string): Promise<RecordedEntry | null>;

  /**
   * List all recorded entries
   */
  list(): Promise<RecordedEntry[]>;

  /**
   * Delete a specific entry by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Clear all recorded entries
   */
  clear(): Promise<void>;

  /**
   * Get the total count of entries
   */
  count(): Promise<number>;
}

/**
 * Generate a unique ID for entries
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
