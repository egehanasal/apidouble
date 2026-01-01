import type {
  RequestRecord,
  RecordedEntry,
  MatchingStrategy,
  MatchingConfig,
} from '../types/index.js';

const DEFAULT_IGNORED_HEADERS = [
  'authorization',
  'cookie',
  'x-request-id',
  'x-correlation-id',
  'date',
  'user-agent',
  'host',
  'content-length',
  'connection',
  'accept-encoding',
];

export interface MatchResult {
  entry: RecordedEntry;
  score: number;
  matchedBy: string[];
}

export class RequestMatcher {
  private config: MatchingConfig;
  private ignoredHeaders: Set<string>;
  private ignoredQueryParams: Set<string>;

  constructor(config: Partial<MatchingConfig> = {}) {
    this.config = {
      strategy: config.strategy ?? 'smart',
      ignoreHeaders: config.ignoreHeaders ?? DEFAULT_IGNORED_HEADERS,
      ignoreQueryParams: config.ignoreQueryParams ?? [],
    };

    this.ignoredHeaders = new Set(
      this.config.ignoreHeaders!.map((h) => h.toLowerCase())
    );
    this.ignoredQueryParams = new Set(this.config.ignoreQueryParams!);
  }

  /**
   * Find the best matching entry for a request
   */
  findMatch(
    request: RequestRecord,
    entries: RecordedEntry[]
  ): RecordedEntry | null {
    if (entries.length === 0) return null;

    const matches = this.findAllMatches(request, entries);
    if (matches.length === 0) return null;

    // Return the highest scoring match
    return matches[0].entry;
  }

  /**
   * Find all matching entries, sorted by score (highest first)
   */
  findAllMatches(
    request: RequestRecord,
    entries: RecordedEntry[]
  ): MatchResult[] {
    const results: MatchResult[] = [];

    for (const entry of entries) {
      const result = this.calculateMatch(request, entry);
      if (result !== null) {
        results.push(result);
      }
    }

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score);
  }

  /**
   * Calculate match score between request and entry
   * Returns null if no match, or MatchResult with score
   */
  private calculateMatch(
    request: RequestRecord,
    entry: RecordedEntry
  ): MatchResult | null {
    const strategy = this.config.strategy;
    const recorded = entry.request;
    const matchedBy: string[] = [];
    let score = 0;

    // Method must always match exactly
    if (request.method !== recorded.method) {
      return null;
    }
    matchedBy.push('method');
    score += 100;

    // Path matching based on strategy
    if (strategy === 'exact') {
      if (request.path !== recorded.path) {
        return null;
      }
      matchedBy.push('path');
      score += 100;
    } else if (strategy === 'smart' || strategy === 'fuzzy') {
      const pathMatch = this.matchPath(request.path, recorded.path, strategy);
      if (!pathMatch.matches) {
        return null;
      }
      matchedBy.push('path');
      score += pathMatch.score;
    }

    // Query parameter matching
    const queryScore = this.matchQueryParams(request.query, recorded.query);
    if (queryScore > 0) {
      matchedBy.push('query');
      score += queryScore;
    }

    // Header matching (optional, adds to score)
    if (strategy === 'smart' || strategy === 'fuzzy') {
      const headerScore = this.matchHeaders(request.headers, recorded.headers);
      if (headerScore > 0) {
        matchedBy.push('headers');
        score += headerScore;
      }
    }

    // Body matching for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const bodyScore = this.matchBody(request.body, recorded.body);
      if (bodyScore > 0) {
        matchedBy.push('body');
        score += bodyScore;
      }
    }

    return { entry, score, matchedBy };
  }

  /**
   * Match URL paths
   */
  private matchPath(
    requestPath: string,
    recordedPath: string,
    strategy: MatchingStrategy
  ): { matches: boolean; score: number } {
    // Exact match
    if (requestPath === recordedPath) {
      return { matches: true, score: 100 };
    }

    if (strategy === 'fuzzy') {
      // Fuzzy: match path segments, allowing wildcards
      const reqSegments = requestPath.split('/').filter(Boolean);
      const recSegments = recordedPath.split('/').filter(Boolean);

      if (reqSegments.length !== recSegments.length) {
        return { matches: false, score: 0 };
      }

      let matchedSegments = 0;
      for (let i = 0; i < reqSegments.length; i++) {
        if (
          reqSegments[i] === recSegments[i] ||
          this.looksLikeId(reqSegments[i])
        ) {
          matchedSegments++;
        }
      }

      const score = (matchedSegments / reqSegments.length) * 80;
      return { matches: matchedSegments === reqSegments.length, score };
    }

    // Smart: match structure, treating numeric/UUID segments as wildcards
    const reqSegments = requestPath.split('/').filter(Boolean);
    const recSegments = recordedPath.split('/').filter(Boolean);

    if (reqSegments.length !== recSegments.length) {
      return { matches: false, score: 0 };
    }

    for (let i = 0; i < reqSegments.length; i++) {
      const reqSeg = reqSegments[i];
      const recSeg = recSegments[i];

      // Exact match or both look like IDs
      if (reqSeg === recSeg) continue;
      if (this.looksLikeId(reqSeg) && this.looksLikeId(recSeg)) continue;

      return { matches: false, score: 0 };
    }

    return { matches: true, score: 90 };
  }

  /**
   * Check if a string looks like an ID (numeric, UUID, etc.)
   */
  private looksLikeId(value: string): boolean {
    // Numeric ID
    if (/^\d+$/.test(value)) return true;

    // UUID
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      )
    )
      return true;

    // Short alphanumeric ID (like MongoDB ObjectId or nanoid)
    if (/^[0-9a-f]{24}$/i.test(value)) return true;
    if (/^[a-zA-Z0-9_-]{21}$/.test(value)) return true;

    return false;
  }

  /**
   * Match query parameters
   */
  private matchQueryParams(
    requestQuery: Record<string, string>,
    recordedQuery: Record<string, string>
  ): number {
    const reqKeys = Object.keys(requestQuery).filter(
      (k) => !this.ignoredQueryParams.has(k)
    );
    const recKeys = Object.keys(recordedQuery).filter(
      (k) => !this.ignoredQueryParams.has(k)
    );

    if (reqKeys.length === 0 && recKeys.length === 0) {
      return 0; // No query params to match
    }

    let matchedCount = 0;
    const totalKeys = new Set([...reqKeys, ...recKeys]).size;

    for (const key of reqKeys) {
      if (requestQuery[key] === recordedQuery[key]) {
        matchedCount++;
      }
    }

    return (matchedCount / totalKeys) * 50;
  }

  /**
   * Match headers (excluding ignored ones)
   */
  private matchHeaders(
    requestHeaders: Record<string, string>,
    recordedHeaders: Record<string, string>
  ): number {
    const filterHeaders = (headers: Record<string, string>) => {
      const filtered: Record<string, string> = {};
      for (const [key, value] of Object.entries(headers)) {
        if (!this.ignoredHeaders.has(key.toLowerCase())) {
          filtered[key.toLowerCase()] = value;
        }
      }
      return filtered;
    };

    const reqHeaders = filterHeaders(requestHeaders);
    const recHeaders = filterHeaders(recordedHeaders);

    const reqKeys = Object.keys(reqHeaders);
    const recKeys = Object.keys(recHeaders);

    if (reqKeys.length === 0 && recKeys.length === 0) {
      return 0;
    }

    let matchedCount = 0;
    for (const key of reqKeys) {
      if (reqHeaders[key] === recHeaders[key]) {
        matchedCount++;
      }
    }

    const totalKeys = new Set([...reqKeys, ...recKeys]).size;
    return (matchedCount / totalKeys) * 30;
  }

  /**
   * Match request body
   */
  private matchBody(requestBody: unknown, recordedBody: unknown): number {
    if (requestBody === undefined && recordedBody === undefined) {
      return 0;
    }

    if (requestBody === undefined || recordedBody === undefined) {
      return 0;
    }

    // Simple JSON comparison
    try {
      const reqJson = JSON.stringify(requestBody);
      const recJson = JSON.stringify(recordedBody);

      if (reqJson === recJson) {
        return 50;
      }

      // Partial match for objects
      if (
        typeof requestBody === 'object' &&
        typeof recordedBody === 'object' &&
        requestBody !== null &&
        recordedBody !== null
      ) {
        const reqKeys = Object.keys(requestBody as object);
        const recKeys = Object.keys(recordedBody as object);
        const commonKeys = reqKeys.filter((k) => recKeys.includes(k));

        if (commonKeys.length > 0) {
          return (commonKeys.length / Math.max(reqKeys.length, recKeys.length)) * 30;
        }
      }
    } catch {
      // JSON stringify failed, no match
    }

    return 0;
  }

  /**
   * Get current matching configuration
   */
  getConfig(): MatchingConfig {
    return { ...this.config };
  }
}
