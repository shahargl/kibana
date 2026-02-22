/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../fixtures';
import { cleanupWorkflowsAndRules } from '../fixtures/cleanup';
import { EXECUTION_TIMEOUT } from '../fixtures/constants';

test.describe(
  'Boundary value bug hunt',
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

    test('foreach with false boolean items should iterate all', async ({ pageObjects, page }) => {
      const yaml = `name: foreach-false-bool
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: loop
    type: foreach
    foreach: '[true, false, true]'
    steps:
      - name: log_item
        type: console
        with:
          message: "Item: \${{ foreach.item }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const lastIteration = await pageObjects.workflowExecution.getStep('loop > 2 > log_item');
      await expect(lastIteration).toBeVisible();
    });

    test('foreach with empty string items should iterate all', async ({ pageObjects, page }) => {
      const yaml = `name: foreach-empty-str
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: loop
    type: foreach
    foreach: '["hello", "", "world"]'
    steps:
      - name: log_item
        type: console
        with:
          message: "Item: [{{ foreach.item }}]"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const lastIteration = await pageObjects.workflowExecution.getStep('loop > 2 > log_item');
      await expect(lastIteration).toBeVisible();
    });

    test('foreach with null items should iterate all', async ({ pageObjects, page }) => {
      const yaml = `name: foreach-null-items
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: loop
    type: foreach
    foreach: '[{"a":1}, null, {"b":2}]'
    steps:
      - name: log_item
        type: console
        with:
          message: "Item: {{ foreach.item | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);
      await pageObjects.workflowExecution.expandStepsTree();

      const lastIteration = await pageObjects.workflowExecution.getStep('loop > 2 > log_item');
      await expect(lastIteration).toBeVisible();
    });

    test('data.set with falsy values (0, false) should preserve them', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: data-set-falsy
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_values
    type: data.set
    with:
      count: 0
      flag: false
      label: ""
  - name: print_values
    type: console
    with:
      message: "count=\${{ variables.count }} flag=\${{ variables.flag }} label=[\${{ variables.label }}]"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_values');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('count=0');
      expect(output).toContain('flag=false');
      expect(output).toContain('label=[]');
    });

    test('KQL condition with value 0 should match correctly', async ({ pageObjects, page }) => {
      const yaml = `name: kql-zero-match
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_zero
    type: data.set
    with:
      count: 0
  - name: check_zero
    type: if
    condition: "variables.count: 0"
    steps:
      - name: matched
        type: console
        with:
          message: "zero matched"
  - name: done
    type: console
    with:
      message: "done"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const matchStep = await pageObjects.workflowExecution.getStep('check_zero > matched');
      await expect(matchStep).toBeVisible();
    });

    test('data.set overwriting string with object should work', async ({ pageObjects, page }) => {
      const yaml = `name: data-set-type-change
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_string
    type: data.set
    with:
      value: "hello"
  - name: set_object
    type: data.set
    with:
      value:
        nested: "world"
  - name: print_value
    type: console
    with:
      message: "{{ variables.value | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_value');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('nested');
      expect(output).toContain('world');
      expect(output).not.toContain('hello');
    });

    test('template with nested step output access should resolve deep paths', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: deep-path-access
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
      config:
        db:
          host: "localhost"
          port: 5432
  - name: print_deep
    type: console
    with:
      message: "host={{ variables.config.db.host }} port={{ variables.config.db.port }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_deep');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toBe('host=localhost port=5432');
    });
  }
);
