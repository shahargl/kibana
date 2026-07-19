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
import {
  getDummyWorkflowYaml,
  getIncompleteStepTypeYaml,
  getInvalidWorkflowYaml,
  getRootLevelAutocompleteYaml,
  getWorkflowWithCommentedVariablesYaml,
} from '../fixtures/workflows';

test.describe(
  'Sanity tests for workflows',
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

    test('Create, save, run and view a dummy workflow', async ({ pageObjects, page }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();

      const workflowName = 'Dummy Workflow';

      // Set the editor value
      await pageObjects.workflowEditor.setYamlEditorValue(getDummyWorkflowYaml(workflowName));

      // Now the save button should be enabled and clicking it will save the correct value
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowList.navigate();
      await page.testSubj.waitForSelector('workflowListTable', { state: 'visible' });

      const workflowRow = pageObjects.workflowList.getWorkflowRow(workflowName);
      await expect(workflowRow).toBeVisible();
      await workflowRow.getByLabel('Run').click();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });

      const inputEditor = page.testSubj.locator('workflow-manual-json-editor');
      await expect(inputEditor).toBeVisible();
      await pageObjects.workflowEditor.setExecuteModalInputs({ message: 'Hello Kibana' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus('completed', EXECUTION_TIMEOUT);

      const helloWorldStep = await pageObjects.workflowExecution.getStep('hello_world_step');
      await helloWorldStep.click();
      const stepOutput = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(stepOutput).toBe('Hello Kibana');
    });

    test('should show validation errors for invalid workflow YAML and clear them when fixed', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      const workflowName = 'Invalid Workflow';
      await pageObjects.workflowEditor.setYamlEditorValue(getInvalidWorkflowYaml(workflowName));

      // Wait for validation to complete and show errors
      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toBeVisible();
      await expect(validationAccordion).toContainText('error');

      // Click to expand the accordion and verify the specific error message
      await validationAccordion.getByRole('button', { name: 'error' }).click();
      await expect(validationAccordion.getByText('missing property "steps"')).toBeVisible();

      // Fix the workflow by pasting valid YAML
      await pageObjects.workflowEditor.setYamlEditorValue(getDummyWorkflowYaml(workflowName));

      // Validation errors should disappear
      await expect(validationAccordion).toContainText('No validation errors');
    });

    test('shows the service account name next to settings.run_as', async ({
      pageObjects,
      page,
    }) => {
      const executionIdentityId = '11b7b80f-2675-4b5e-bd0f-9a197c768ae2';
      await page.route('**/internal/execution_identity', async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: executionIdentityId,
              name: 'Workflow reader',
              description: '',
              spaceId: 'default',
              projectAssignments: [
                {
                  projectType: 'security',
                  projectIds: ['abcdef12345678901234567890123456'],
                  roleNames: ['viewer'],
                },
              ],
              createdBy: 'test-user',
              createdAt: '2026-07-15T00:00:00.000Z',
              updatedAt: '2026-07-15T00:00:00.000Z',
            },
          ]),
        });
      });
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(`
name: execution identity badge
enabled: true
settings:
  run_as: ${executionIdentityId}
triggers:
  - type: manual
steps:
  - name: log_message
    type: console
    with:
      message: hello
`);

      await expect(page.locator('.execution-identity-name-badge')).toContainText('Workflow reader');
      const identityBadge = page.locator('.execution-identity-name-badge');
      await expect(identityBadge).toHaveCount(1);
      const badgeRows = await identityBadge.evaluateAll(
        (elements) => new Set(elements.map((element) => element.getBoundingClientRect().y)).size
      );
      expect(badgeRows).toBe(1);

      await identityBadge.hover();
      const hover = page.locator('.monaco-hover');
      await expect(hover).toContainText('Roles');
      await expect(hover).toContainText('viewer');
      await expect(hover).toContainText('Projects');
      await expect(hover).toContainText('security');
      await expect(hover.locator('img')).toBeVisible();
      await expect(hover.locator('img')).toHaveAttribute('src', /^data:image\/svg\+xml,/);
    });

    test('should show step type autocompletion suggestions', async ({ pageObjects, page }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      const workflowName = 'Autocomplete Test';
      await pageObjects.workflowEditor.setYamlEditorValue(getIncompleteStepTypeYaml(workflowName));

      // Set incomplete YAML with empty step type
      await pageObjects.workflowEditor.setYamlEditorValue(getIncompleteStepTypeYaml(workflowName));

      // Click on the "type:" line to focus the editor at that position
      await page.getByText('type:', { exact: true }).click();

      // Move to end of line and trigger autocomplete
      await page.keyboard.press('End');
      await page.keyboard.press('Space');

      // Verify the suggest widget appears with step type options
      const suggestWidget = pageObjects.workflowEditor.getYamlEditorSuggestWidget();
      await expect(suggestWidget).toBeVisible();

      await page.keyboard.type('ela');

      // Verify step types are shown in suggestions (alphabetically sorted, starting with 'a')
      await expect(
        suggestWidget.getByRole('option', { name: 'elasticsearch.search' })
      ).toBeVisible();
      await expect(
        suggestWidget.getByRole('option', { name: 'elasticsearch.index' })
      ).toBeVisible();
      await expect(suggestWidget.getByRole('option', { name: 'elasticsearch.bulk' })).toBeVisible();

      await suggestWidget.getByRole('option', { name: 'elasticsearch.search' }).click();
      await page.keyboard.press('Enter');
      await page.keyboard.type('with:');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Space');

      await expect(suggestWidget).toBeVisible();
      await page.keyboard.type('ind');

      await expect(suggestWidget.getByRole('option', { name: 'index' })).toBeVisible();
    });

    test('should show root-level property suggestions on empty lines', async ({ pageObjects }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      const workflowName = 'Root Autocomplete Test';

      const suggestWidget = pageObjects.workflowEditor.getYamlEditorSuggestWidget();

      await pageObjects.workflowEditor.triggerAutocompleteAfter(
        getRootLevelAutocompleteYaml(workflowName),
        'message: "hello"\n'
      );

      await expect(suggestWidget).toBeVisible();

      await expect(suggestWidget.getByRole('option', { name: 'consts' })).toBeVisible();
      await expect(suggestWidget.getByRole('option', { name: 'tags' })).toBeVisible();
      await expect(suggestWidget.getByRole('option', { name: 'outputs' })).toBeVisible();
    });

    test('should not show validation errors for YAML comment lines with liquid variables', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      const workflowName = 'Commented Variables Workflow';
      await pageObjects.workflowEditor.setYamlEditorValue(
        getWorkflowWithCommentedVariablesYaml(workflowName)
      );

      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toContainText('No validation errors');
    });
  }
);
