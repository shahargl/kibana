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
import { parseWorkflowYamlToJSON } from '../../../common/lib/yaml';

/**
 * Memory benchmark tests for workflow schema validation.
 *
 * These tests measure memory consumption during:
 * 1. Schema generation (getWorkflowZodSchema)
 * 2. YAML parsing and validation (parseWorkflowYamlToJSON)
 *
 * Run with: yarn jest --testPathPattern=schema_memory --expose-gc
 *
 * The --expose-gc flag enables manual garbage collection for accurate measurements.
 */
describe('Schema Memory Benchmarks', () => {
  const forceGC = () => {
    if (global.gc) {
      global.gc();
    }
  };

  const getHeapMB = () => v8.getHeapStatistics().used_heap_size / 1024 / 1024;

  /**
   * A realistic workflow YAML for sanity testing - includes foreach, if/else, inputs, consts
   */
  const SANITY_CHECK_WORKFLOW = `name: New workflow

enabled: false

description: This is a new workflow

tags:
  - workflow
  - example

triggers:
  - type: manual

# Inputs allow you to provide values when running the workflow
inputs:
  - name: people
    type: array
    default:
      - alice
      - bob
      - charlie
    description: List of people to greet
  - name: greeting
    type: string
    default: Hello
    description: The greeting message to use

# Constants are reusable values defined once
consts:
  favorite_person: bob
  api_endpoint: https://api.example.com

steps:
  # Foreach loops iterate over arrays
  - name: iterate_people
    type: foreach
    foreach: "{{ inputs.people }}"
    steps:
      # Access foreach context: foreach.item, foreach.index
      - name: log_current_person
        type: console
        with:
          message: |
            Processing: {{ foreach.item }}
            Index: {{ foreach.index }}

      # If conditions allow conditional execution (uses KQL syntax)
      - name: check_if_favorite
        type: if
        condition: "foreach.item: {{ consts.favorite_person }}"
        steps:
          - name: greet_favorite
            type: console
            with:
              # Templates support data transformation, like 'upcase' or 'capitalize'
              message: "{{ inputs.greeting }}, {{ foreach.item | upcase }}! You're special! ❤️"
        else:
          - name: greet_normal
            type: console
            with:
              message: "{{ inputs.greeting }}, {{ foreach.item | capitalize }}!"

      # Example of accessing previous step output
      - name: use_step_output
        type: console
        with:
          message: |
            Previous step logged: {{ steps.log_current_person.output }}
            Using const: {{ consts.api_endpoint }}

      # Example of using filters (json filter formats data as JSON string)
      - name: demonstrate_filters
        type: console
        with:
          message: "People array as JSON: {{ inputs.people | json }}"
`;

  /**
   * Generates a workflow YAML with the specified number of steps
   */
  const generateWorkflowYaml = (numSteps: number): string => {
    const steps = Array.from(
      { length: numSteps },
      (_, i) => `  - name: step-${i}
    type: wait
    with:
      duration: 1s`
    ).join('\n');

    return `name: Benchmark Workflow
enabled: true
triggers:
  - type: manual
steps:
${steps}`;
  };

  /**
   * Generates a deeply nested workflow with foreach and if blocks
   */
  const generateNestedWorkflowYaml = (depth: number): string => {
    let yaml = `name: Nested Benchmark Workflow
enabled: true
triggers:
  - type: manual
inputs:
  - name: items
    type: array
steps:`;

    let indent = '  ';
    for (let i = 0; i < depth; i++) {
      yaml += `
${indent}- name: foreach-${i}
${indent}  type: foreach
${indent}  foreach: "{{ inputs.items }}"
${indent}  steps:`;
      indent += '    ';
    }

    // Add a final wait step at the deepest level
    yaml += `
${indent}- name: final-wait
${indent}  type: wait
${indent}  with:
${indent}    duration: 1s`;

    return yaml;
  };

  describe('sanity check', () => {
    it('should successfully validate a realistic workflow with foreach, if/else, inputs, consts', () => {
      const schema = getWorkflowZodSchema({});

      forceGC();
      const heapBefore = getHeapMB();

      const result = parseWorkflowYamlToJSON(SANITY_CHECK_WORKFLOW, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Sanity Check] Realistic workflow validation:`);
      // eslint-disable-next-line no-console
      console.log(`  Success: ${result.success}`);
      // eslint-disable-next-line no-console
      console.log(`  Memory delta: ${deltaMB.toFixed(2)} MB`);

      if (!result.success) {
        // eslint-disable-next-line no-console
        console.log(`  Error: ${result.error.message}`);
      }

      expect(result.success).toBe(true);
    });
  });

  describe('schema generation memory', () => {
    it('should measure memory for schema generation without dynamic connectors', () => {
      forceGC();
      const heapBefore = getHeapMB();

      const schema = getWorkflowZodSchema({});

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Schema generation (no dynamic connectors):`);
      // eslint-disable-next-line no-console
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  Delta: ${deltaMB.toFixed(2)} MB`);

      // Basic sanity check - schema should exist
      expect(schema).toBeDefined();

      // Memory threshold check (adjust as needed based on acceptable limits)
      // This is a warning, not a hard failure, since memory can vary
      if (deltaMB > 50) {
        // eslint-disable-next-line no-console
        console.warn(`[WARNING] Schema generation used ${deltaMB.toFixed(2)} MB - consider optimization`);
      }
    });

    it('should measure memory for repeated schema generation (caching check)', () => {
      forceGC();

      // First generation
      const heapBefore1 = getHeapMB();
      getWorkflowZodSchema({});
      const heapAfter1 = getHeapMB();
      const delta1 = heapAfter1 - heapBefore1;

      forceGC();

      // Second generation - should be cheaper if caching is working
      const heapBefore2 = getHeapMB();
      getWorkflowZodSchema({});
      const heapAfter2 = getHeapMB();
      const delta2 = heapAfter2 - heapBefore2;

      forceGC();

      // Third generation
      const heapBefore3 = getHeapMB();
      getWorkflowZodSchema({});
      const heapAfter3 = getHeapMB();
      const delta3 = heapAfter3 - heapBefore3;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Repeated schema generation:`);
      // eslint-disable-next-line no-console
      console.log(`  1st generation: ${delta1.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  2nd generation: ${delta2.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  3rd generation: ${delta3.toFixed(2)} MB`);

      // If caching is effective, subsequent generations should use less memory
      if (delta2 > delta1 * 0.5) {
        // eslint-disable-next-line no-console
        console.warn(`[WARNING] Schema not being cached effectively - 2nd gen used ${delta2.toFixed(2)} MB vs ${delta1.toFixed(2)} MB first gen`);
      }
    });
  });

  describe('validation memory', () => {
    let schema: ReturnType<typeof getWorkflowZodSchema>;

    beforeAll(() => {
      // Generate schema once for all validation tests
      schema = getWorkflowZodSchema({});
      forceGC();
    });

    it('should measure memory for small workflow validation (5 steps)', () => {
      const yaml = generateWorkflowYaml(5);

      forceGC();
      const heapBefore = getHeapMB();

      parseWorkflowYamlToJSON(yaml, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Small workflow validation (5 steps): ${deltaMB.toFixed(2)} MB`);

      expect(deltaMB).toBeLessThan(10); // Small workflows should use minimal memory
    });

    it('should measure memory for medium workflow validation (50 steps)', () => {
      const yaml = generateWorkflowYaml(50);

      forceGC();
      const heapBefore = getHeapMB();

      parseWorkflowYamlToJSON(yaml, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Medium workflow validation (50 steps): ${deltaMB.toFixed(2)} MB`);

      expect(deltaMB).toBeLessThan(50);
    });

    it('should measure memory for large workflow validation (200 steps)', () => {
      const yaml = generateWorkflowYaml(200);

      forceGC();
      const heapBefore = getHeapMB();

      parseWorkflowYamlToJSON(yaml, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Large workflow validation (200 steps): ${deltaMB.toFixed(2)} MB`);

      if (deltaMB > 100) {
        // eslint-disable-next-line no-console
        console.warn(`[WARNING] Large workflow validation used ${deltaMB.toFixed(2)} MB`);
      }
    });

    it('should measure memory for deeply nested workflow (10 levels)', () => {
      const yaml = generateNestedWorkflowYaml(10);

      forceGC();
      const heapBefore = getHeapMB();

      parseWorkflowYamlToJSON(yaml, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Deeply nested workflow (10 levels): ${deltaMB.toFixed(2)} MB`);

      if (deltaMB > 50) {
        // eslint-disable-next-line no-console
        console.warn(`[WARNING] Deeply nested validation used ${deltaMB.toFixed(2)} MB`);
      }
    });
  });

  describe('combined schema + validation memory', () => {
    it('should measure total memory for full workflow processing', () => {
      const yaml = generateWorkflowYaml(100);

      forceGC();
      const heapBefore = getHeapMB();

      // Simulate what happens in createWorkflow
      const schema = getWorkflowZodSchema({});
      parseWorkflowYamlToJSON(yaml, schema);

      const heapAfter = getHeapMB();
      const deltaMB = heapAfter - heapBefore;

      // eslint-disable-next-line no-console
      console.log(`[Benchmark] Full workflow processing (100 steps):`);
      // eslint-disable-next-line no-console
      console.log(`  Heap before: ${heapBefore.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  Heap after: ${heapAfter.toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  Total delta: ${deltaMB.toFixed(2)} MB`);

      const heapStats = v8.getHeapStatistics();
      // eslint-disable-next-line no-console
      console.log(`  Heap limit: ${(heapStats.heap_size_limit / 1024 / 1024).toFixed(2)} MB`);
      // eslint-disable-next-line no-console
      console.log(`  Usage ratio: ${((heapAfter / (heapStats.heap_size_limit / 1024 / 1024)) * 100).toFixed(1)}%`);
    });
  });
});

