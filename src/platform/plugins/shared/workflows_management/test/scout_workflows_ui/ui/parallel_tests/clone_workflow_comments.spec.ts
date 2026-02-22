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

const WORKFLOW_WITH_COMMENTS = `# This workflow has important comments
name: Comment Test Workflow
description: Testing comment preservation
# Trigger section
triggers:
  - type: manual
    with:
      inputs:
        - name: message
          type: string
steps:
  # Log the message
  - name: log_message
    type: console
    with:
      message: "{{ inputs.message }}"
`;

test.describe(
  'Bug reproduction: Clone workflow should preserve YAML comments',
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

    test('cloned workflow should preserve YAML comments from original', async ({
      pageObjects,
      page,
    }) => {
      await test.step('create workflow with comments', async () => {
        await pageObjects.workflowEditor.gotoNewWorkflow();
        await pageObjects.workflowEditor.setYamlEditorValue(WORKFLOW_WITH_COMMENTS);
        await pageObjects.workflowEditor.saveWorkflow();
      });

      await test.step('clone the workflow from list', async () => {
        await pageObjects.workflowList.navigate();
        await page.testSubj.waitForSelector('workflowListTable', { state: 'visible' });
        const cloneButton = await pageObjects.workflowList.getThreeDotsMenuAction(
          'Comment Test Workflow',
          'cloneWorkflowAction'
        );
        await cloneButton.click();

        // Clone stays on list page — wait for the cloned workflow to appear
        const clonedRow = pageObjects.workflowList.getWorkflowRow('Comment Test Workflow Copy');
        await expect(clonedRow).toBeVisible({ timeout: 10000 });
      });

      await test.step('open cloned workflow and verify comments', async () => {
        // Click into the cloned workflow to open the editor
        const clonedRow = pageObjects.workflowList.getWorkflowRow('Comment Test Workflow Copy');
        await clonedRow.getByRole('link', { name: 'Comment Test Workflow Copy' }).click();
        await pageObjects.workflowEditor.waitForEditorToLoad();

        const clonedYaml = await pageObjects.workflowEditor.getYamlEditorValue();

        expect(clonedYaml).toContain('# This workflow has important comments');
        expect(clonedYaml).toContain('# Trigger section');
        expect(clonedYaml).toContain('# Log the message');
      });
    });
  }
);
