/**
 * Schema Inference - Generate TypeScript interfaces from recorded responses
 */

export interface InferredField {
  name: string;
  type: TypeInfo;
  optional: boolean;
  examples: unknown[];
  fakerSuggestion?: string;
}

export interface TypeInfo {
  kind: 'primitive' | 'array' | 'object' | 'union';
  primitive?: 'string' | 'number' | 'boolean' | 'null';
  arrayType?: TypeInfo;
  objectFields?: InferredField[];
  unionTypes?: TypeInfo[];
}

export interface InferredSchema {
  name: string;
  fields: InferredField[];
  typescript: string;
  fakerTemplate: Record<string, string>;
}

/**
 * Infer TypeScript schema from sample data
 */
export class SchemaInferrer {
  private maxExamples = 5;

  /**
   * Infer schema from a single sample
   */
  inferFromSample(sample: unknown, name: string = 'Response'): InferredSchema {
    const typeInfo = this.inferType(sample, [sample]);
    const fields = typeInfo.kind === 'object' ? typeInfo.objectFields ?? [] : [];

    return {
      name,
      fields,
      typescript: this.generateTypeScript(typeInfo, name),
      fakerTemplate: this.generateFakerTemplate(fields),
    };
  }

  /**
   * Infer schema from multiple samples (more accurate)
   */
  inferFromSamples(samples: unknown[], name: string = 'Response'): InferredSchema {
    if (samples.length === 0) {
      return {
        name,
        fields: [],
        typescript: `interface ${name} {}`,
        fakerTemplate: {},
      };
    }

    // Merge type info from all samples
    const typeInfos = samples.map((s) => this.inferType(s, samples));
    const mergedType = this.mergeTypes(typeInfos);
    const fields = mergedType.kind === 'object' ? mergedType.objectFields ?? [] : [];

    return {
      name,
      fields,
      typescript: this.generateTypeScript(mergedType, name),
      fakerTemplate: this.generateFakerTemplate(fields),
    };
  }

  /**
   * Infer type from a value
   */
  private inferType(value: unknown, allSamples: unknown[]): TypeInfo {
    if (value === null) {
      return { kind: 'primitive', primitive: 'null' };
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return { kind: 'array', arrayType: { kind: 'primitive', primitive: 'string' } };
      }
      const elementTypes = value.map((v) => this.inferType(v, allSamples));
      return { kind: 'array', arrayType: this.mergeTypes(elementTypes) };
    }

    if (typeof value === 'object') {
      const fields: InferredField[] = [];
      const obj = value as Record<string, unknown>;

      for (const [key, val] of Object.entries(obj)) {
        const examples = this.collectExamples(key, allSamples);
        fields.push({
          name: key,
          type: this.inferType(val, allSamples),
          optional: false,
          examples: examples.slice(0, this.maxExamples),
          fakerSuggestion: this.suggestFaker(key, val, examples),
        });
      }

      return { kind: 'object', objectFields: fields };
    }

    if (typeof value === 'string') {
      return { kind: 'primitive', primitive: 'string' };
    }

    if (typeof value === 'number') {
      return { kind: 'primitive', primitive: 'number' };
    }

    if (typeof value === 'boolean') {
      return { kind: 'primitive', primitive: 'boolean' };
    }

    return { kind: 'primitive', primitive: 'string' };
  }

  /**
   * Collect examples of a field from all samples
   */
  private collectExamples(fieldName: string, samples: unknown[]): unknown[] {
    const examples: unknown[] = [];

    for (const sample of samples) {
      if (sample && typeof sample === 'object' && !Array.isArray(sample)) {
        const obj = sample as Record<string, unknown>;
        if (fieldName in obj) {
          const val = obj[fieldName];
          if (!examples.includes(val)) {
            examples.push(val);
          }
        }
      }
    }

    return examples;
  }

  /**
   * Merge multiple type infos into one
   */
  private mergeTypes(types: TypeInfo[]): TypeInfo {
    if (types.length === 0) {
      return { kind: 'primitive', primitive: 'string' };
    }

    if (types.length === 1) {
      return types[0];
    }

    // Check if all types are the same kind
    const kinds = new Set(types.map((t) => t.kind));

    if (kinds.size === 1) {
      const kind = types[0].kind;

      if (kind === 'primitive') {
        const primitives = new Set(types.map((t) => t.primitive));
        if (primitives.size === 1) {
          return types[0];
        }
        // Multiple primitives - create union
        return {
          kind: 'union',
          unionTypes: Array.from(primitives).map((p) => ({ kind: 'primitive', primitive: p } as TypeInfo)),
        };
      }

      if (kind === 'array') {
        const elementTypes = types.map((t) => t.arrayType!).filter(Boolean);
        return { kind: 'array', arrayType: this.mergeTypes(elementTypes) };
      }

      if (kind === 'object') {
        return this.mergeObjectTypes(types);
      }
    }

    // Different kinds - create union
    return { kind: 'union', unionTypes: types };
  }

  /**
   * Merge object types, handling optional fields
   */
  private mergeObjectTypes(types: TypeInfo[]): TypeInfo {
    const fieldMap = new Map<string, { types: TypeInfo[]; count: number; examples: unknown[] }>();
    const totalSamples = types.length;

    for (const type of types) {
      if (type.kind !== 'object' || !type.objectFields) continue;

      for (const field of type.objectFields) {
        if (!fieldMap.has(field.name)) {
          fieldMap.set(field.name, { types: [], count: 0, examples: [] });
        }
        const entry = fieldMap.get(field.name)!;
        entry.types.push(field.type);
        entry.count++;
        entry.examples.push(...field.examples);
      }
    }

    const mergedFields: InferredField[] = [];
    for (const [name, { types: fieldTypes, count, examples }] of fieldMap) {
      const uniqueExamples = [...new Set(examples)].slice(0, this.maxExamples);
      mergedFields.push({
        name,
        type: this.mergeTypes(fieldTypes),
        optional: count < totalSamples,
        examples: uniqueExamples,
        fakerSuggestion: this.suggestFaker(name, examples[0], uniqueExamples),
      });
    }

    return { kind: 'object', objectFields: mergedFields };
  }

  /**
   * Suggest faker method based on field name and value
   */
  private suggestFaker(name: string, value: unknown, _examples: unknown[]): string | undefined {
    const lowerName = name.toLowerCase();

    // UUID detection
    if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return '{{faker.string.uuid}}';
    }

    // Email detection
    if (typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return '{{faker.internet.email}}';
    }

    // URL detection
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      return '{{faker.internet.url}}';
    }

    // Phone detection
    if (typeof value === 'string' && /^\+?\d{10,}$/.test(value.replace(/[\s-]/g, ''))) {
      return '{{faker.phone.number}}';
    }

    // Name-based suggestions
    if (lowerName === 'id' || lowerName.endsWith('id') || lowerName.endsWith('_id')) {
      if (typeof value === 'number') {
        return '{{faker.number.int({"min":1,"max":10000})}}';
      }
      return '{{faker.string.uuid}}';
    }

    if (lowerName === 'email' || lowerName.endsWith('email')) {
      return '{{faker.internet.email}}';
    }

    if (lowerName === 'firstname' || lowerName === 'first_name') {
      return '{{faker.person.firstName}}';
    }

    if (lowerName === 'lastname' || lowerName === 'last_name') {
      return '{{faker.person.lastName}}';
    }

    if (lowerName === 'name' || lowerName === 'fullname' || lowerName === 'full_name') {
      return '{{faker.person.fullName}}';
    }

    if (lowerName === 'username' || lowerName === 'user_name') {
      return '{{faker.internet.username}}';
    }

    if (lowerName === 'avatar' || lowerName === 'image' || lowerName === 'photo') {
      return '{{faker.image.avatar}}';
    }

    if (lowerName === 'phone' || lowerName === 'phonenumber' || lowerName === 'phone_number') {
      return '{{faker.phone.number}}';
    }

    if (lowerName === 'address' || lowerName === 'street') {
      return '{{faker.location.streetAddress}}';
    }

    if (lowerName === 'city') {
      return '{{faker.location.city}}';
    }

    if (lowerName === 'state') {
      return '{{faker.location.state}}';
    }

    if (lowerName === 'country') {
      return '{{faker.location.country}}';
    }

    if (lowerName === 'zipcode' || lowerName === 'zip' || lowerName === 'postalcode' || lowerName === 'postal_code') {
      return '{{faker.location.zipCode}}';
    }

    if (lowerName === 'company' || lowerName === 'companyname' || lowerName === 'company_name') {
      return '{{faker.company.name}}';
    }

    if (lowerName === 'title' || lowerName === 'jobtitle' || lowerName === 'job_title') {
      return '{{faker.person.jobTitle}}';
    }

    if (lowerName === 'description' || lowerName === 'bio' || lowerName === 'about') {
      return '{{faker.lorem.paragraph}}';
    }

    if (lowerName === 'price' || lowerName === 'amount' || lowerName === 'cost') {
      return '{{faker.commerce.price}}';
    }

    if (lowerName === 'product' || lowerName === 'productname' || lowerName === 'product_name') {
      return '{{faker.commerce.productName}}';
    }

    if (lowerName === 'category' || lowerName === 'department') {
      return '{{faker.commerce.department}}';
    }

    if (lowerName.includes('date') || lowerName.includes('time') || lowerName === 'createdat' || lowerName === 'updatedat') {
      return '{{faker.date.recent}}';
    }

    if (lowerName === 'url' || lowerName === 'website' || lowerName === 'link') {
      return '{{faker.internet.url}}';
    }

    // Type-based fallbacks
    if (typeof value === 'string') {
      if (value.length > 100) {
        return '{{faker.lorem.paragraph}}';
      }
      if (value.length > 20) {
        return '{{faker.lorem.sentence}}';
      }
      return '{{faker.lorem.word}}';
    }

    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return '{{faker.number.int(1000)}}';
      }
      return '{{faker.number.float({"min":0,"max":1000,"fractionDigits":2})}}';
    }

    if (typeof value === 'boolean') {
      return '{{faker.datatype.boolean}}';
    }

    return undefined;
  }

  /**
   * Generate TypeScript interface
   */
  private generateTypeScript(type: TypeInfo, name: string, indent: string = '', isTopLevel: boolean = true): string {
    if (type.kind === 'primitive') {
      return type.primitive === 'null' ? 'null' : type.primitive!;
    }

    if (type.kind === 'array') {
      const elementType = this.generateTypeScript(type.arrayType!, `${name}Item`, indent, false);
      return `${elementType}[]`;
    }

    if (type.kind === 'union') {
      const unionTypes = type.unionTypes!.map((t) => this.generateTypeScript(t, name, indent, false));
      return unionTypes.join(' | ');
    }

    if (type.kind === 'object') {
      const fields = type.objectFields ?? [];
      if (fields.length === 0) {
        return isTopLevel ? `interface ${name} {}` : '{}';
      }

      const fieldLines = fields.map((field) => {
        const optional = field.optional ? '?' : '';
        const fieldType = this.generateTypeScript(field.type, this.pascalCase(field.name), indent + '  ', false);

        // For nested objects, generate inline
        if (field.type.kind === 'object' && field.type.objectFields?.length) {
          const nestedFields = field.type.objectFields
            .map((f) => {
              const opt = f.optional ? '?' : '';
              const ft = this.generateTypeScript(f.type, this.pascalCase(f.name), indent + '    ', false);
              return `${indent}    ${f.name}${opt}: ${ft};`;
            })
            .join('\n');
          return `${indent}  ${field.name}${optional}: {\n${nestedFields}\n${indent}  };`;
        }

        return `${indent}  ${field.name}${optional}: ${fieldType};`;
      });

      if (isTopLevel) {
        return `interface ${name} {\n${fieldLines.join('\n')}\n${indent}}`;
      } else {
        return `{\n${fieldLines.join('\n')}\n${indent}}`;
      }
    }

    return 'unknown';
  }

  /**
   * Generate faker template from fields
   */
  private generateFakerTemplate(fields: InferredField[]): Record<string, string> {
    const template: Record<string, string> = {};

    for (const field of fields) {
      if (field.fakerSuggestion) {
        template[field.name] = field.fakerSuggestion;
      } else if (field.type.kind === 'object' && field.type.objectFields) {
        const nested = this.generateFakerTemplate(field.type.objectFields);
        if (Object.keys(nested).length > 0) {
          template[field.name] = nested as unknown as string;
        }
      }
    }

    return template;
  }

  /**
   * Convert string to PascalCase
   */
  private pascalCase(str: string): string {
    return str
      .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
      .replace(/^(.)/, (_, c) => c.toUpperCase());
  }
}

// Default singleton instance
export const schemaInferrer = new SchemaInferrer();
