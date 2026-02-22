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
  'Bug: step referencing output of step inside if-else',
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

    test('step referencing output of step inside if-else should work', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: if-step-output-access
inputs:
  - name: flag
    type: boolean
    default: true
triggers:
  - type: manual
steps:
  - name: check
    type: if
    condition: "\${{ inputs.flag }}"
    steps:
      - name: inner_step
        type: console
        with:
          message: "hello from inside if"
  - name: after_if
    type: console
    with:
      message: "inner said: {{ steps.inner_step.output }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const step = await pageObjects.workflowExecution.getStep('after_if');
      await step.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('hello from inside if');
    });
  }
);
