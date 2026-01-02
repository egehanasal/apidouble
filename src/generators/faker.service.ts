/**
 * Faker.js integration for dynamic data generation
 */

import { faker, Faker } from '@faker-js/faker';

export interface FakerContext {
  /** Request parameters */
  params: Record<string, string>;
  /** Query parameters */
  query: Record<string, string>;
  /** Request index (for generating sequences) */
  index: number;
  /** Cached values for consistency within a single request */
  cache: Map<string, unknown>;
}

export interface FakerServiceConfig {
  /** Seed for reproducible data */
  seed?: number;
  /** Locale for localized data */
  locale?: string;
}

/**
 * Service for generating dynamic data using Faker.js
 */
export class FakerService {
  private faker: Faker;
  private requestIndex = 0;

  constructor(config: FakerServiceConfig = {}) {
    this.faker = faker;

    if (config.seed !== undefined) {
      this.faker.seed(config.seed);
    }
  }

  /**
   * Set seed for reproducible data
   */
  setSeed(seed: number): void {
    this.faker.seed(seed);
  }

  /**
   * Reset the request index
   */
  resetIndex(): void {
    this.requestIndex = 0;
  }

  /**
   * Create a new context for a request
   */
  createContext(
    params: Record<string, string> = {},
    query: Record<string, string> = {}
  ): FakerContext {
    return {
      params,
      query,
      index: this.requestIndex++,
      cache: new Map(),
    };
  }

  /**
   * Process a value, replacing faker templates
   */
  process<T>(value: T, context?: FakerContext): T {
    const ctx = context ?? this.createContext();
    return this.processValue(value, ctx) as T;
  }

  /**
   * Process any value recursively
   */
  private processValue(value: unknown, context: FakerContext): unknown {
    if (typeof value === 'string') {
      return this.processString(value, context);
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.processValue(item, context));
    }

    if (value !== null && typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.processValue(val, context);
      }
      return result;
    }

    return value;
  }

  /**
   * Process a string, replacing faker templates
   * Supports: {{faker.person.fullName}}, {{faker.number.int(100)}}, {{param.id}}, {{index}}
   */
  private processString(str: string, context: FakerContext): unknown {
    // Check if the entire string is a single template (return typed value)
    const singleMatch = str.match(/^\{\{(.+?)\}\}$/);
    if (singleMatch) {
      return this.evaluateTemplate(singleMatch[1].trim(), context);
    }

    // Replace multiple templates within a string (always returns string)
    return str.replace(/\{\{(.+?)\}\}/g, (_, template) => {
      const result = this.evaluateTemplate(template.trim(), context);
      return String(result);
    });
  }

  /**
   * Evaluate a single template expression
   */
  private evaluateTemplate(template: string, context: FakerContext): unknown {
    // Handle special templates
    if (template === 'index') {
      return context.index;
    }

    if (template.startsWith('param.')) {
      const paramName = template.slice(6);
      return context.params[paramName] ?? '';
    }

    if (template.startsWith('query.')) {
      const queryName = template.slice(6);
      return context.query[queryName] ?? '';
    }

    // Handle cached values for consistency
    if (template.startsWith('cache.')) {
      const cacheKey = template.slice(6);
      if (context.cache.has(cacheKey)) {
        return context.cache.get(cacheKey);
      }
    }

    // Handle faker templates
    if (template.startsWith('faker.')) {
      return this.evaluateFaker(template.slice(6), context);
    }

    // Unknown template, return as-is
    return `{{${template}}}`;
  }

  /**
   * Evaluate a faker expression
   * Supports: person.fullName, number.int, number.int(100), number.int({"min":1,"max":10})
   */
  private evaluateFaker(expression: string, context: FakerContext): unknown {
    // Check cache first
    const cacheKey = `faker.${expression}`;
    if (context.cache.has(cacheKey)) {
      return context.cache.get(cacheKey);
    }

    // Parse the expression
    const match = expression.match(/^([a-zA-Z.]+)(?:\((.+)\))?$/);
    if (!match) {
      return `{{faker.${expression}}}`;
    }

    const [, path, argsStr] = match;
    const parts = path.split('.');

    // Navigate to the faker method
    let current: unknown = this.faker;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return `{{faker.${expression}}}`;
      }
    }

    // If it's a function, call it
    if (typeof current === 'function') {
      try {
        let result: unknown;
        if (argsStr) {
          const args = this.parseArgs(argsStr);
          result = current.call(this.faker, ...args);
        } else {
          result = current.call(this.faker);
        }
        return result;
      } catch {
        return `{{faker.${expression}}}`;
      }
    }

    return current;
  }

  /**
   * Parse function arguments from string
   */
  private parseArgs(argsStr: string): unknown[] {
    // Try to parse as JSON array
    try {
      const parsed = JSON.parse(`[${argsStr}]`);
      return parsed;
    } catch {
      // Fall back to simple parsing
      return argsStr.split(',').map((arg) => {
        const trimmed = arg.trim();
        // Try to parse as number
        const num = Number(trimmed);
        if (!isNaN(num)) return num;
        // Try to parse as boolean
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        // Try to parse as JSON
        try {
          return JSON.parse(trimmed);
        } catch {
          // Return as string (remove quotes if present)
          return trimmed.replace(/^["']|["']$/g, '');
        }
      });
    }
  }

  /**
   * Cache a value for consistent use within a request
   */
  cacheValue(context: FakerContext, key: string, value: unknown): void {
    context.cache.set(key, value);
  }

  /**
   * Get the underlying faker instance for direct access
   */
  getFaker(): Faker {
    return this.faker;
  }
}

/**
 * Template helper for creating dynamic responses
 */
export function template<T>(data: T): T {
  return data;
}

/**
 * Generate an array of items using faker
 */
export function fakerArray<T>(
  count: number,
  generator: (index: number, faker: Faker) => T
): T[] {
  return Array.from({ length: count }, (_, i) => generator(i, faker));
}

/**
 * Common faker templates for convenience
 */
export const FakerTemplates = {
  // User templates
  user: {
    id: '{{faker.string.uuid}}',
    firstName: '{{faker.person.firstName}}',
    lastName: '{{faker.person.lastName}}',
    fullName: '{{faker.person.fullName}}',
    email: '{{faker.internet.email}}',
    avatar: '{{faker.image.avatar}}',
    username: '{{faker.internet.username}}',
  },

  // Address templates
  address: {
    street: '{{faker.location.streetAddress}}',
    city: '{{faker.location.city}}',
    state: '{{faker.location.state}}',
    zipCode: '{{faker.location.zipCode}}',
    country: '{{faker.location.country}}',
  },

  // Company templates
  company: {
    name: '{{faker.company.name}}',
    catchPhrase: '{{faker.company.catchPhrase}}',
    buzzPhrase: '{{faker.company.buzzPhrase}}',
  },

  // Product templates
  product: {
    id: '{{faker.string.uuid}}',
    name: '{{faker.commerce.productName}}',
    description: '{{faker.commerce.productDescription}}',
    price: '{{faker.commerce.price}}',
    category: '{{faker.commerce.department}}',
  },

  // Lorem templates
  lorem: {
    word: '{{faker.lorem.word}}',
    words: '{{faker.lorem.words}}',
    sentence: '{{faker.lorem.sentence}}',
    paragraph: '{{faker.lorem.paragraph}}',
  },

  // Date templates
  date: {
    past: '{{faker.date.past}}',
    future: '{{faker.date.future}}',
    recent: '{{faker.date.recent}}',
    birthdate: '{{faker.date.birthdate}}',
  },
};

// Default singleton instance
export const fakerService = new FakerService();
