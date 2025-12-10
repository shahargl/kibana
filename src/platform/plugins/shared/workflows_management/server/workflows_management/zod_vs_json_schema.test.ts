/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import v8 from 'v8';
import { getWorkflowZodSchema } from '../../../common/schema';
import { getWorkflowJsonSchema } from '@kbn/workflows';

/**
 * Comparison test: Zod schema vs JSON Schema
 *
 * This test compares:
 * 1. Memory usage of Zod schema vs JSON Schema
 * 2. Size of the serialized schemas
 * 3. Generation time
 *
 * Run with: yarn jest --testPathPattern=zod_vs_json_schema --expose-gc
 */
describe('Zod vs JSON Schema Comparison', () => {
  function forceGC() {
    if (global.gc) {
      global.gc();
    }
  }

  function getHeapMB() {
    return v8.getHeapStatistics().used_heap_size / 1024 / 1024;
  }

  function getObjectSizeBytes(obj: unknown): number {
    try {
      return JSON.stringify(obj).length;
    } catch {
      return -1;
    }
  }

  it('should compare Zod schema generation vs JSON Schema conversion', () => {
    // eslint-disable-next-line no-console
    console.log('\n========== ZOD VS JSON SCHEMA COMPARISON ==========\n');

    // --- Measure Zod Schema Generation ---
    forceGC();
    const heapBeforeZod = getHeapMB();
    const zodStartTime = performance.now();

    const zodSchema = getWorkflowZodSchema({});

    const zodEndTime = performance.now();
    const heapAfterZod = getHeapMB();

    forceGC();
    const heapAfterZodGC = getHeapMB();

    const zodDuration = zodEndTime - zodStartTime;
    const zodAllocated = heapAfterZod - heapBeforeZod;
    const zodRetained = heapAfterZodGC - heapBeforeZod;

    // eslint-disable-next-line no-console
    console.log('=== ZOD SCHEMA ===');
    // eslint-disable-next-line no-console
    console.log(`  Generation time: ${zodDuration.toFixed(2)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Memory allocated: ${zodAllocated.toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  Memory retained after GC: ${zodRetained.toFixed(2)} MB`);

    // --- Measure JSON Schema Conversion ---
    forceGC();
    const heapBeforeJson = getHeapMB();
    const jsonStartTime = performance.now();

    const jsonSchema = getWorkflowJsonSchema(zodSchema);

    const jsonEndTime = performance.now();
    const heapAfterJson = getHeapMB();

    forceGC();
    const heapAfterJsonGC = getHeapMB();

    const jsonDuration = jsonEndTime - jsonStartTime;
    const jsonAllocated = heapAfterJson - heapBeforeJson;
    const jsonRetained = heapAfterJsonGC - heapBeforeJson;

    // eslint-disable-next-line no-console
    console.log('\n=== JSON SCHEMA (converted from Zod) ===');
    // eslint-disable-next-line no-console
    console.log(`  Conversion time: ${jsonDuration.toFixed(2)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Memory allocated: ${jsonAllocated.toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  Memory retained after GC: ${jsonRetained.toFixed(2)} MB`);

    // --- Measure serialized sizes ---
    const jsonSchemaSize = getObjectSizeBytes(jsonSchema);
    const jsonSchemaSizeKB = jsonSchemaSize / 1024;
    const jsonSchemaSizeMB = jsonSchemaSizeKB / 1024;

    // eslint-disable-next-line no-console
    console.log('\n=== SERIALIZED SIZE ===');
    // eslint-disable-next-line no-console
    console.log(`  JSON Schema serialized: ${jsonSchemaSizeKB.toFixed(2)} KB (${jsonSchemaSizeMB.toFixed(2)} MB)`);

    // Zod schemas can't be serialized directly, but we can measure the definition count
    // eslint-disable-next-line no-console
    console.log(`  Zod schema: [Cannot serialize - it contains functions and closures]`);

    // --- Summary ---
    // eslint-disable-next-line no-console
    console.log('\n=== SUMMARY ===');
    // eslint-disable-next-line no-console
    console.log(`  Zod schema retained memory: ${zodRetained.toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  JSON Schema retained memory: ${jsonRetained.toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  JSON Schema serialized size: ${jsonSchemaSizeMB.toFixed(2)} MB`);

    if (jsonSchema) {
      const defCount = jsonSchema.$defs ? Object.keys(jsonSchema.$defs).length : 0;
      // eslint-disable-next-line no-console
      console.log(`  JSON Schema $defs count: ${defCount}`);
    }

    // eslint-disable-next-line no-console
    console.log('\n=== POTENTIAL SAVINGS ===');
    const potentialSavings = zodRetained - jsonSchemaSizeMB;
    // eslint-disable-next-line no-console
    console.log(`  If using JSON Schema instead of Zod at runtime:`);
    // eslint-disable-next-line no-console
    console.log(`    Memory savings: ~${potentialSavings.toFixed(2)} MB per schema`);
    // eslint-disable-next-line no-console
    console.log(`    (This assumes JSON Schema validation library has minimal overhead)`);

    // eslint-disable-next-line no-console
    console.log('\n====================================================\n');

    expect(zodSchema).toBeDefined();
    expect(jsonSchema).not.toBeNull();
  });

  it('should measure JSON Schema validation performance with Ajv', async () => {
    // This test requires Ajv to be installed
    // We'll dynamically import it to avoid breaking the test if not available
    let Ajv: typeof import('ajv').default;
    try {
      const ajvModule = await import('ajv');
      Ajv = ajvModule.default;
    } catch {
      // eslint-disable-next-line no-console
      console.log('Ajv not available, skipping JSON Schema validation benchmark');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('\n========== AJV JSON SCHEMA VALIDATION ==========\n');

    // Generate schemas
    const zodSchema = getWorkflowZodSchema({});
    const jsonSchema = getWorkflowJsonSchema(zodSchema);

    if (!jsonSchema) {
      // eslint-disable-next-line no-console
      console.log('Failed to generate JSON Schema');
      return;
    }

    // Create Ajv validator
    forceGC();
    const heapBeforeAjv = getHeapMB();
    const ajvStartTime = performance.now();

    const ajv = new Ajv({
      strict: false,
      allErrors: true,
    });

    let validate: ReturnType<typeof ajv.compile>;
    try {
      validate = ajv.compile(jsonSchema);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Failed to compile JSON Schema with Ajv:', error);
      return;
    }

    const ajvEndTime = performance.now();
    const heapAfterAjv = getHeapMB();

    forceGC();
    const heapAfterAjvGC = getHeapMB();

    // eslint-disable-next-line no-console
    console.log('=== AJV SCHEMA COMPILATION ===');
    // eslint-disable-next-line no-console
    console.log(`  Compilation time: ${(ajvEndTime - ajvStartTime).toFixed(2)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Memory allocated: ${(heapAfterAjv - heapBeforeAjv).toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  Memory retained after GC: ${(heapAfterAjvGC - heapBeforeAjv).toFixed(2)} MB`);

    // Test validation
    const testWorkflow = {
      name: 'Test Workflow',
      enabled: true,
      triggers: [{ type: 'manual' }],
      steps: [
        {
          name: 'wait-step',
          type: 'wait',
          with: { duration: '1s' },
        },
      ],
    };

    forceGC();
    const heapBeforeValidation = getHeapMB();
    const validationStartTime = performance.now();

    const isValid = validate(testWorkflow);

    const validationEndTime = performance.now();
    const heapAfterValidation = getHeapMB();

    // eslint-disable-next-line no-console
    console.log('\n=== AJV VALIDATION ===');
    // eslint-disable-next-line no-console
    console.log(`  Validation time: ${(validationEndTime - validationStartTime).toFixed(2)}ms`);
    // eslint-disable-next-line no-console
    console.log(`  Memory used: ${(heapAfterValidation - heapBeforeValidation).toFixed(2)} MB`);
    // eslint-disable-next-line no-console
    console.log(`  Valid: ${isValid}`);
    if (!isValid) {
      // eslint-disable-next-line no-console
      console.log(`  Errors: ${JSON.stringify(validate.errors?.slice(0, 3))}`);
    }

    // eslint-disable-next-line no-console
    console.log('\n====================================================\n');

    expect(validate).toBeDefined();
  });
});

