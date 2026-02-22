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
  'Bug hunt: new areas',
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

    test('consts with special characters in keys should be accessible', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: consts-special-keys
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  api-url: "https://example.com"
  max_retries: 3
steps:
  - name: print_consts
    type: console
    with:
      message: "url={{ consts['api-url'] }} retries={{ consts.max_retries }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_consts');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('url=https://example.com');
      expect(output).toContain('retries=3');
    });

    test('wait step with template duration should resolve correctly', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: wait-template-duration
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  delay: "1s"
steps:
  - name: before
    type: console
    with:
      message: "before wait"
  - name: pause
    type: wait
    with:
      duration: "{{ consts.delay }}"
  - name: after
    type: console
    with:
      message: "after wait"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const afterStep = await pageObjects.workflowExecution.getStep('after');
      await afterStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('after wait');
    });

    test('input default value should be used when no input provided', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: input-default-value
inputs:
  - name: greeting
    type: string
    default: "hello default"
triggers:
  - type: manual
steps:
  - name: print_input
    type: console
    with:
      message: "{{ inputs.greeting }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_input');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('hello default');
    });

    test('multiple if-else branches should execute correct branch', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: if-else-branches
inputs:
  - name: status
    type: string
    default: "warning"
triggers:
  - type: manual
steps:
  - name: check_status
    type: if
    condition: "inputs.status: error"
    steps:
      - name: handle_error
        type: console
        with:
          message: "handling error"
    else:
      - name: handle_other
        type: console
        with:
          message: "handling other: {{ inputs.status }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const elseStep = await pageObjects.workflowExecution.getStep(
        'check_status > handle_other'
      );
      await elseStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('handling other: warning');
    });

    test('step output with large JSON object should be preserved', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: large-output
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_large
    type: data.set
    with:
      items:
        - id: 1
          name: "item one"
          tags: ["a", "b", "c"]
        - id: 2
          name: "item two"
          tags: ["d", "e"]
        - id: 3
          name: "item three"
          tags: ["f"]
  - name: print_count
    type: console
    with:
      message: "items={{ variables.items | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_count');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('item one');
      expect(output).toContain('item two');
      expect(output).toContain('item three');
    });

    test('http step with invalid URL should fail gracefully', async ({ pageObjects, page }) => {
      const yaml = `name: http-invalid-url
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: bad_request
    type: http
    with:
      url: "not-a-valid-url"
      method: GET
      timeout: 5s`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('failed', EXECUTION_TIMEOUT);
    });

    test('consts object should be accessible in nested template', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: consts-nested-access
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
consts:
  config:
    host: "db.example.com"
    port: 5432
steps:
  - name: print_config
    type: console
    with:
      message: "host={{ consts.config.host }} port={{ consts.config.port }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('print_config');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('host=db.example.com port=5432');
    });
  }
);
