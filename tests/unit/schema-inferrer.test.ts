import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaInferrer } from '../../src/generators/schema-inferrer.js';

describe('SchemaInferrer', () => {
  let inferrer: SchemaInferrer;

  beforeEach(() => {
    inferrer = new SchemaInferrer();
  });

  describe('inferFromSample', () => {
    it('should infer simple object schema', () => {
      const sample = {
        id: 1,
        name: 'Test',
        active: true,
      };

      const schema = inferrer.inferFromSample(sample, 'User');

      expect(schema.name).toBe('User');
      expect(schema.fields).toHaveLength(3);
      expect(schema.fields[0].name).toBe('id');
      expect(schema.fields[0].type.kind).toBe('primitive');
      expect(schema.fields[0].type.primitive).toBe('number');
    });

    it('should infer nested object schema', () => {
      const sample = {
        user: {
          name: 'Test',
          email: 'test@example.com',
        },
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].name).toBe('user');
      expect(schema.fields[0].type.kind).toBe('object');
      expect(schema.fields[0].type.objectFields).toHaveLength(2);
    });

    it('should infer array schema', () => {
      const sample = {
        items: [1, 2, 3],
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.kind).toBe('array');
      expect(schema.fields[0].type.arrayType?.primitive).toBe('number');
    });

    it('should infer array of objects', () => {
      const sample = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.kind).toBe('array');
      expect(schema.fields[0].type.arrayType?.kind).toBe('object');
    });

    it('should handle null values', () => {
      const sample = {
        value: null,
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.primitive).toBe('null');
    });

    it('should handle empty arrays', () => {
      const sample = {
        items: [],
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.kind).toBe('array');
    });
  });

  describe('inferFromSamples', () => {
    it('should mark optional fields', () => {
      const samples = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob', email: 'bob@example.com' },
      ];

      const schema = inferrer.inferFromSamples(samples, 'User');

      const emailField = schema.fields.find((f) => f.name === 'email');
      expect(emailField?.optional).toBe(true);

      const idField = schema.fields.find((f) => f.name === 'id');
      expect(idField?.optional).toBe(false);
    });

    it('should handle empty samples', () => {
      const schema = inferrer.inferFromSamples([], 'Empty');

      expect(schema.name).toBe('Empty');
      expect(schema.fields).toHaveLength(0);
    });

    it('should collect examples from all samples', () => {
      const samples = [
        { name: 'Alice' },
        { name: 'Bob' },
        { name: 'Charlie' },
      ];

      const schema = inferrer.inferFromSamples(samples);

      const nameField = schema.fields.find((f) => f.name === 'name');
      expect(nameField?.examples).toContain('Alice');
      expect(nameField?.examples).toContain('Bob');
    });
  });

  describe('TypeScript generation', () => {
    it('should generate interface for simple object', () => {
      const sample = {
        id: 1,
        name: 'Test',
      };

      const schema = inferrer.inferFromSample(sample, 'Item');

      expect(schema.typescript).toContain('interface Item');
      expect(schema.typescript).toContain('id: number');
      expect(schema.typescript).toContain('name: string');
    });

    it('should handle optional fields', () => {
      const samples = [
        { id: 1 },
        { id: 2, name: 'Test' },
      ];

      const schema = inferrer.inferFromSamples(samples, 'Item');

      expect(schema.typescript).toContain('name?: string');
    });

    it('should handle arrays', () => {
      const sample = {
        tags: ['a', 'b', 'c'],
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.typescript).toContain('tags: string[]');
    });
  });

  describe('Faker suggestions', () => {
    it('should suggest faker for email field', () => {
      const sample = {
        email: 'test@example.com',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.internet.email}}');
    });

    it('should detect UUID values', () => {
      const sample = {
        id: '550e8400-e29b-41d4-a716-446655440000',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.string.uuid}}');
    });

    it('should suggest faker for name fields', () => {
      const sample = {
        firstName: 'John',
        lastName: 'Doe',
        fullName: 'John Doe',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.person.firstName}}');
      expect(schema.fields[1].fakerSuggestion).toBe('{{faker.person.lastName}}');
      expect(schema.fields[2].fakerSuggestion).toBe('{{faker.person.fullName}}');
    });

    it('should suggest faker for numeric id', () => {
      const sample = {
        userId: 123,
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toContain('faker.number.int');
    });

    it('should suggest faker for address fields', () => {
      const sample = {
        city: 'New York',
        country: 'USA',
        zipCode: '10001',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.location.city}}');
      expect(schema.fields[1].fakerSuggestion).toBe('{{faker.location.country}}');
      expect(schema.fields[2].fakerSuggestion).toBe('{{faker.location.zipCode}}');
    });

    it('should suggest faker for URL values', () => {
      const sample = {
        website: 'https://example.com',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.internet.url}}');
    });

    it('should suggest lorem for long strings', () => {
      const sample = {
        description: 'This is a very long description that should trigger the lorem paragraph suggestion because it exceeds the normal word limit threshold.',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].fakerSuggestion).toBe('{{faker.lorem.paragraph}}');
    });
  });

  describe('fakerTemplate generation', () => {
    it('should generate faker template object', () => {
      const sample = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'test@example.com',
        name: 'Test User',
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fakerTemplate.id).toBe('{{faker.string.uuid}}');
      expect(schema.fakerTemplate.email).toBe('{{faker.internet.email}}');
    });
  });

  describe('complex scenarios', () => {
    it('should handle deeply nested objects', () => {
      const sample = {
        user: {
          profile: {
            settings: {
              theme: 'dark',
            },
          },
        },
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.kind).toBe('object');
      expect(schema.fields[0].type.objectFields?.[0].type.kind).toBe('object');
    });

    it('should handle mixed arrays', () => {
      const sample = {
        data: [
          { type: 'user', id: 1 },
          { type: 'post', id: 2 },
        ],
      };

      const schema = inferrer.inferFromSample(sample);

      expect(schema.fields[0].type.kind).toBe('array');
      expect(schema.fields[0].type.arrayType?.kind).toBe('object');
    });

    it('should handle realistic API response', () => {
      const sample = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        avatar: 'https://example.com/avatar.jpg',
        address: {
          street: '123 Main St',
          city: 'New York',
          zipCode: '10001',
          country: 'USA',
        },
        createdAt: '2024-01-15T10:30:00Z',
        tags: ['developer', 'admin'],
      };

      const schema = inferrer.inferFromSample(sample, 'UserProfile');

      expect(schema.name).toBe('UserProfile');
      expect(schema.fields.length).toBe(8);
      expect(schema.typescript).toContain('interface UserProfile');
      expect(Object.keys(schema.fakerTemplate).length).toBeGreaterThan(0);
    });
  });
});
