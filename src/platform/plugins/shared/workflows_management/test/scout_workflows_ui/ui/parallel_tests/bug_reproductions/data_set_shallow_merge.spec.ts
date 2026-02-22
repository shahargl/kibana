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
  'Bug 5: data.set shallow merge',
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

    test('data.set shallow merge should preserve nested object properties', async ({
      pageObjects,
      page,
    }) => {
      const yaml = `name: shallow-merge-bug
inputs:
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: set_user_basics
    type: data.set
    with:
      user:
        id: "123"
        name: "John"
  - name: set_user_email
    type: data.set
    with:
      user:
        email: "john@example.com"
  - name: print_user
    type: console
    with:
      message: "{{ variables.user | json }}"`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const printStep = await pageObjects.workflowExecution.getStep('print_user');
      await printStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');

      expect(output).toContain('id');
      expect(output).toContain('name');
      expect(output).toContain('email');
    });
  }
);
