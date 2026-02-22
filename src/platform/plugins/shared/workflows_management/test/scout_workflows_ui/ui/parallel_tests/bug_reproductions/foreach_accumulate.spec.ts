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
import { spaceTest as test } from '../../fixtures';
import { cleanupWorkflowsAndRules } from '../../fixtures/cleanup';
import { EXECUTION_TIMEOUT } from '../../fixtures/constants';

test.describe(
  'Bug: foreach with nested data.set accumulate',
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

    test('foreach with nested data.set should accumulate across iterations', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: foreach-accumulate-bug
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: init_count
    type: data.set
    with:
      count: 0
  - name: loop
    type: foreach
    foreach: '["a", "b", "c"]'
    steps:
      - name: increment
        type: data.set
        with:
          count: 1
  - name: print_count
    type: console
    with:
      message: "count={{ variables.count }}"`;

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

      // After 3 iterations, count should be the value from the last data.set (1)
      // since data.set overwrites, not increments. The question is: does it persist
      // across iterations or get reset?
      expect(output).toBe('count=1');
    });
  }
);
