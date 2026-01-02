import { describe, it, expect, beforeEach } from 'vitest';
import {
  FakerService,
  fakerArray,
  FakerTemplates,
} from '../../src/generators/faker.service.js';

describe('FakerService', () => {
  let service: FakerService;

  beforeEach(() => {
    service = new FakerService();
  });

  describe('process strings', () => {
    it('should pass through regular strings', () => {
      const result = service.process('Hello World');
      expect(result).toBe('Hello World');
    });

    it('should replace faker.person.firstName template', () => {
      service.setSeed(123);
      const result = service.process('{{faker.person.firstName}}');
      expect(typeof result).toBe('string');
      expect(result).not.toBe('{{faker.person.firstName}}');
    });

    it('should replace faker.person.fullName template', () => {
      const result = service.process('{{faker.person.fullName}}');
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    });

    it('should replace faker.string.uuid template', () => {
      const result = service.process('{{faker.string.uuid}}');
      expect(typeof result).toBe('string');
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should handle multiple templates in one string', () => {
      const result = service.process('Hello {{faker.person.firstName}} {{faker.person.lastName}}!');
      expect(typeof result).toBe('string');
      expect(result).not.toContain('{{');
    });

    it('should handle faker with arguments', () => {
      const result = service.process('{{faker.number.int(100)}}');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    });

    it('should handle faker with object arguments', () => {
      const result = service.process('{{faker.number.int({"min":10,"max":20})}}');
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(10);
      expect(result).toBeLessThanOrEqual(20);
    });
  });

  describe('process objects', () => {
    it('should process templates in object values', () => {
      const input = {
        id: '{{faker.string.uuid}}',
        name: '{{faker.person.fullName}}',
        static: 'unchanged',
      };

      const result = service.process(input);

      expect(result.static).toBe('unchanged');
      expect(result.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(typeof result.name).toBe('string');
    });

    it('should process nested objects', () => {
      const input = {
        user: {
          profile: {
            name: '{{faker.person.fullName}}',
            email: '{{faker.internet.email}}',
          },
        },
      };

      const result = service.process(input);

      expect(typeof result.user.profile.name).toBe('string');
      expect(result.user.profile.email).toContain('@');
    });
  });

  describe('process arrays', () => {
    it('should process templates in array elements', () => {
      const input = ['{{faker.person.firstName}}', '{{faker.person.lastName}}'];

      const result = service.process(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result[0]).not.toContain('{{');
    });

    it('should process arrays of objects', () => {
      const input = [
        { name: '{{faker.person.fullName}}' },
        { name: '{{faker.person.fullName}}' },
      ];

      const result = service.process(input);

      expect(Array.isArray(result)).toBe(true);
      expect(result[0].name).not.toBe(result[1].name); // Different values
    });
  });

  describe('context', () => {
    it('should support {{index}} template', () => {
      const ctx1 = service.createContext();
      const ctx2 = service.createContext();

      const result1 = service.process('{{index}}', ctx1);
      const result2 = service.process('{{index}}', ctx2);

      expect(result1).toBe(0);
      expect(result2).toBe(1);
    });

    it('should support {{param.name}} template', () => {
      const context = service.createContext({ id: '123', name: 'test' });

      const result = service.process('User {{param.id}}: {{param.name}}', context);

      expect(result).toBe('User 123: test');
    });

    it('should support {{query.name}} template', () => {
      const context = service.createContext({}, { page: '1', limit: '10' });

      const result = service.process('Page {{query.page}} of {{query.limit}}', context);

      expect(result).toBe('Page 1 of 10');
    });

    it('should reset index', () => {
      service.createContext();
      service.createContext();
      service.resetIndex();

      const ctx = service.createContext();
      const result = service.process('{{index}}', ctx);

      expect(result).toBe(0);
    });
  });

  describe('seed', () => {
    it('should produce reproducible results when resetting seed', () => {
      service.setSeed(12345);
      const result1 = service.process('{{faker.person.firstName}}');

      service.setSeed(12345);
      const result2 = service.process('{{faker.person.firstName}}');

      expect(result1).toBe(result2);
    });

    it('should produce different results with different seeds', () => {
      service.setSeed(12345);
      const result1 = service.process('{{faker.person.firstName}}');

      service.setSeed(54321);
      const result2 = service.process('{{faker.person.firstName}}');

      expect(result1).not.toBe(result2);
    });

    it('should allow reproducible sequences', () => {
      service.setSeed(99999);
      const seq1_1 = service.process('{{faker.person.firstName}}');
      const seq1_2 = service.process('{{faker.person.firstName}}');

      service.setSeed(99999);
      const seq2_1 = service.process('{{faker.person.firstName}}');
      const seq2_2 = service.process('{{faker.person.firstName}}');

      expect(seq1_1).toBe(seq2_1);
      expect(seq1_2).toBe(seq2_2);
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent faker methods', () => {
      const result = service.process('{{faker.nonexistent.method}}');
      expect(result).toBe('{{faker.nonexistent.method}}');
    });

    it('should handle invalid template syntax', () => {
      const result = service.process('{{invalid}}');
      expect(result).toBe('{{invalid}}');
    });

    it('should handle null and undefined', () => {
      expect(service.process(null)).toBe(null);
      expect(service.process(undefined)).toBe(undefined);
    });

    it('should handle numbers', () => {
      expect(service.process(42)).toBe(42);
    });

    it('should handle booleans', () => {
      expect(service.process(true)).toBe(true);
      expect(service.process(false)).toBe(false);
    });

    it('should return typed values for single templates', () => {
      const num = service.process('{{faker.number.int(10)}}');
      expect(typeof num).toBe('number');

      const bool = service.process('{{faker.datatype.boolean}}');
      expect(typeof bool).toBe('boolean');
    });

    it('should return string when template is embedded', () => {
      const result = service.process('Value: {{faker.number.int(10)}}');
      expect(typeof result).toBe('string');
      expect(result).toMatch(/^Value: \d+$/);
    });
  });

  describe('getFaker', () => {
    it('should return the underlying faker instance', () => {
      const faker = service.getFaker();

      expect(faker).toBeDefined();
      expect(typeof faker.person.firstName).toBe('function');
    });
  });
});

describe('fakerArray', () => {
  it('should generate array of items', () => {
    const users = fakerArray(3, (index, faker) => ({
      id: index + 1,
      name: faker.person.fullName(),
    }));

    expect(users).toHaveLength(3);
    expect(users[0].id).toBe(1);
    expect(users[1].id).toBe(2);
    expect(users[2].id).toBe(3);
  });
});

describe('FakerTemplates', () => {
  let service: FakerService;

  beforeEach(() => {
    service = new FakerService();
  });

  it('should have user templates', () => {
    const result = service.process(FakerTemplates.user);

    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
    expect(typeof result.firstName).toBe('string');
    expect(typeof result.lastName).toBe('string');
    expect(result.email).toContain('@');
  });

  it('should have address templates', () => {
    const result = service.process(FakerTemplates.address);

    expect(typeof result.street).toBe('string');
    expect(typeof result.city).toBe('string');
    expect(typeof result.country).toBe('string');
  });

  it('should have product templates', () => {
    const result = service.process(FakerTemplates.product);

    expect(typeof result.name).toBe('string');
    expect(typeof result.price).toBe('string');
    expect(typeof result.category).toBe('string');
  });
});
