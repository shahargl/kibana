/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * E2E bug hunt tests for Execution Engine patterns from the One Workflow bug KB.
 * Covers: foreach edge cases, data.set/data.map behavior, step output accessibility,
 * template rendering edge cases.
 *
 * These tests create workflows via YAML, save, run, and assert on execution output.
 * DO NOT run these tests in isolation - run all parallel_tests specs together.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../fixtures';
import { cleanupWorkflowsAndRules } from '../fixtures/cleanup';
import { EXECUTION_TIMEOUT } from '../fixtures/constants';

test.describe(
  'Bug hunt - Execution Engine',
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

    test('foreach with single item should run and produce one iteration', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-single-item
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: loop
    type: foreach
    foreach: '[42]'
    steps:
      - name: log_item
        type: console
        with:
          message: "Single item: {{ foreach.item }}"
  - name: after_loop
    type: console
    with:
      message: "Done"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const logStep = await pageObjects.workflowExecution.getStep('loop > 0 > log_item');
      await logStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('Single item: 42');

      const afterStep = await pageObjects.workflowExecution.getStep('after_loop');
      await afterStep.click();
      const afterOutput = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(afterOutput).toBe('Done');
    });

    test('foreach with objects should correctly resolve foreach.item property access', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-objects
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  items:
    - id: 1
      label: first
    - id: 2
      label: second
steps:
  - name: loop
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log_item
        type: console
        with:
          message: "id={{ foreach.item.id }} label={{ foreach.item.label }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const firstLog = await pageObjects.workflowExecution.getStep('loop > 0 > log_item');
      await firstLog.click();
      const firstOutput = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(firstOutput).toBe('id=1 label=first');

      const secondLog = await pageObjects.workflowExecution.getStep('loop > 1 > log_item');
      await secondLog.click();
      const secondOutput = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(secondOutput).toBe('id=2 label=second');
    });

    test('nested foreach should run inner loop with correct foreach.item', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: nested-foreach
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: outer_loop
    type: foreach
    foreach: '["A", "B"]'
    steps:
      - name: inner_loop
        type: foreach
        foreach: '[1, 2]'
        steps:
          - name: log_inner
            type: console
            with:
              message: "inner={{ foreach.item }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const innerStep = await pageObjects.workflowExecution.getStep(
        'outer_loop > 0 > inner_loop > 1 > log_inner'
      );
      await innerStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('inner=2');
    });

    test('data.set with push filter inside foreach should accumulate array across iterations', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-data-set-accumulate
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: init
    type: data.set
    with:
      collected: []
  - name: loop
    type: foreach
    foreach: '["a", "b", "c"]'
    steps:
      - name: append
        type: data.set
        with:
          collected: '\${{ variables.collected | default: [] | push: foreach.item }}'
  - name: print
    type: console
    with:
      message: "{{ variables.collected | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const printStep = await pageObjects.workflowExecution.getStep('print');
      await printStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed).toEqual(['a', 'b', 'c']);
    });

    test('data.set shallow merge should preserve nested object across steps', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: data-set-nested-merge
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_nested
    type: data.set
    with:
      payload:
        level1:
          a: 1
          b: 2
  - name: extend_nested
    type: data.set
    with:
      payload:
        level1:
          c: 3
  - name: print
    type: console
    with:
      message: "{{ variables.payload | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const printStep = await pageObjects.workflowExecution.getStep('print');
      await printStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('"a":1');
      expect(output).toContain('"b":2');
      expect(output).toContain('"c":3');
    });

    test('step output from if branch should be accessible to sibling step', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: if-step-output-access
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
      - name: inner
        type: console
        with:
          message: "inner-result"
  - name: consumer
    type: console
    with:
      message: "Got: {{ steps.inner.output }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const consumerStep = await pageObjects.workflowExecution.getStep('consumer');
      await consumerStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('inner-result');
    });

    test('template with foreach.item dotted key should render correctly', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-dotted-key
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  items:
    - "@timestamp": "now"
    - "@timestamp": "later"
steps:
  - name: loop
    type: foreach
    foreach: '{{ consts.items }}'
    steps:
      - name: log
        type: console
        with:
          message: "ts={{ foreach.item['@timestamp'] }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const firstLog = await pageObjects.workflowExecution.getStep('loop > 0 > log');
      await firstLog.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('ts=');
      expect(output).toMatch(/ts=(now|later)/);
    });

    test('foreach with falsy items (0, false) should iterate over all', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-falsy
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: loop
    type: foreach
    foreach: '[1, 0, false, 2]'
    steps:
      - name: log_item
        type: console
        with:
          message: "item={{ foreach.item }} idx={{ foreach.index }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const idx1 = await pageObjects.workflowExecution.getStep('loop > 1 > log_item');
      await idx1.click();
      const output1 = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output1).toContain('item=0');
      expect(output1).toContain('idx=1');

      const idx3 = await pageObjects.workflowExecution.getStep('loop > 3 > log_item');
      await expect(idx3).toBeVisible();
    });

    test('empty string in template should render as empty not undefined', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: template-empty-string
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_empty
    type: data.set
    with:
      msg: ""
  - name: log
    type: console
    with:
      message: "[{{ variables.msg }}]"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({});

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const logStep = await pageObjects.workflowExecution.getStep('log');
      await logStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('[]');
    });
  }
);
