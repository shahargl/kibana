/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * E2E bug hunt: YAML parsing, validation, and template expression edge cases.
 *
 * Tests target known bug categories from the hunt-workflow-bugs knowledge base:
 * - YAML Parsing & Validation (flow mapping, special chars)
 * - Liquid Templating & Expressions (json filter, split/join, missing vars, nested refs)
 *
 * Each test: create workflow via YAML, save, run, check output.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../fixtures';
import { cleanupWorkflowsAndRules } from '../fixtures/cleanup';
import { EXECUTION_TIMEOUT } from '../fixtures/constants';

test.describe(
  'YAML and Template Expression Bug Hunt',
  {
    tag: [
      ...tags.stateful.classic,
      ...tags.serverless.observability.complete,
      ...tags.serverless.security.complete,
    ],
  },
  () => {
    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsPrivilegedUser();
    });

    test.afterAll(async ({ scoutSpace, apiServices }) => {
      await cleanupWorkflowsAndRules({ scoutSpace, apiServices });
    });

    test('template with dots in variable path should render nested field correctly', async ({
      pageObjects,
      page,
    }) => {
      // Covers: nested template expressions {{ steps.X.output.nested.field }}
      // KB: dotted key confusion, security#15783 (flattened keys in alerts)
      const yaml = `name: nested-field-template
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: produce_nested
    type: data.set
    with:
      result:
        inner:
          value: "nested-ok"
  - name: consume_nested
    type: console
    with:
      message: "{{ variables.result.inner.value }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('consume_nested');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toBe('nested-ok');
    });

    test('template with json filter on object with special chars should not render parent object', async ({
      pageObjects,
      page,
    }) => {
      // Covers: security#15782 - json filter for fields with special chars leads to parent object
      const yaml = `name: json-filter-special-chars
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_data
    type: data.set
    with:
      obj:
        "kibana.alert.reason": "High CPU"
        "field.with.dots": "value"
  - name: log_json
    type: console
    with:
      message: "{{ variables.obj | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('log_json');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('kibana.alert.reason');
      expect(output).toContain('High CPU');
      expect(output).toContain('field.with.dots');
      expect(output).toContain('value');
    });

    test('template with split and join filters should produce expected string', async ({
      pageObjects,
      page,
    }) => {
      // Covers: Liquid split/join filter edge cases
      const yaml = `name: split-join-filters
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_str
    type: data.set
    with:
      csv: "a,b,c"
  - name: split_join
    type: console
    with:
      message: "{{ variables.csv | split: ',' | join: '-' }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('split_join');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toBe('a-b-c');
    });

    test('template referencing missing variable should render empty string', async ({
      pageObjects,
      page,
    }) => {
      // Covers: missing/undefined variables - templating_engine returns empty string for {{ missing }}
      const yaml = `name: missing-var-template
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: log_missing
    type: console
    with:
      message: "prefix-{{ variables.nonexistent }}-suffix"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('log_missing');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toBe('prefix--suffix');
    });

    test('multiline block scalar with template expression should render correctly', async ({
      pageObjects,
      page,
    }) => {
      // Covers: YAML multiline/block scalars with embedded {{ }}
      const yaml = `name: multiline-template
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_val
    type: data.set
    with:
      tag: "production"
  - name: log_multiline
    type: console
    with:
      message: |
        Line one with {{ variables.tag }}
        Line two
        Line three`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('log_multiline');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('production');
      expect(output).toContain('Line one');
      expect(output).toContain('Line two');
    });

    test('quoted double-brace expression should not be misinterpreted as YAML flow mapping', async ({
      pageObjects,
      page,
    }) => {
      // Covers: security#15851 - unquoted {{ }} can be misinterpreted as flow mapping
      // Quoted value ensures correct parsing
      const yaml = `name: quoted-braces
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: log_quoted
    type: console
    with:
      message: "Result: {{ inputs.dummy }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('log_quoted');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toBe('Result: x');
    });

    test('step referencing previous step inside if block should resolve', async ({
      pageObjects,
      page,
    }) => {
      // Covers: nested template {{ steps.inner_step.output }} when step is inside if
      const yaml = `name: if-step-output-ref
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: branch
    type: if
    condition: "1: 1"
    steps:
      - name: inner_step
        type: console
        with:
          message: "from inside if"
  - name: after
    type: console
    with:
      message: "Got: {{ steps.inner_step.output }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('after');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('from inside if');
    });

    test('template with brackets and quotes in interpolated value should not break', async ({
      pageObjects,
      page,
    }) => {
      // Covers: special characters in variable values (brackets, quotes)
      const yaml = `name: brackets-quotes
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_complex
    type: data.set
    with:
      text: "[a] and {b} and \\\"quoted\\\""
  - name: log_complex
    type: console
    with:
      message: "Value: {{ variables.text }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('log_complex');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('[a]');
      expect(output).toContain('{b}');
      expect(output).toContain('quoted');
    });

    test('foreach.item template access should work with object properties', async ({
      pageObjects,
      page,
    }) => {
      // Covers: security#15943 - foreach.item with flow-style/special chars
      // Also: foreach.item.property access in templates
      const yaml = `name: foreach-item-template
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  items:
    - id: 1
      label: "first"
    - id: 2
      label: "second"
steps:
  - name: loop
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: "{{ foreach.item.id }}: {{ foreach.item.label }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const firstStep = await pageObjects.workflowExecution.getStep('loop > 0 > log_item');
      await firstStep.click();
      const firstOutput =
        await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(firstOutput).toBe('1: first');

      const secondStep = await pageObjects.workflowExecution.getStep('loop > 1 > log_item');
      await secondStep.click();
      const secondOutput =
        await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(secondOutput).toBe('2: second');
    });
  }
);
