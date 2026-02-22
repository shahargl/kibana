/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../fixtures';
import { cleanupWorkflowsAndRules } from '../fixtures/cleanup';
import {
  getDummyWorkflowYaml,
  getInvalidWorkflowYaml,
  getRichWorkflowForRoundtripYaml,
  getDuplicateStepNamesYaml,
  getManyStepsWorkflowYaml,
} from '../fixtures/workflows';

test.describe(
  'Bug hunt: UI/UX and Editor',
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

    test('save/load roundtrip: saving and reloading preserves all workflow content', async ({
      pageObjects,
      page,
    }) => {
      const workflowName = 'Roundtrip Test Workflow';
      const yaml = getRichWorkflowForRoundtripYaml(workflowName);

      await test.step('create and save workflow with rich content', async () => {
        await pageObjects.workflowEditor.gotoNewWorkflow();
        await pageObjects.workflowEditor.setYamlEditorValue(yaml);
        await pageObjects.workflowEditor.saveWorkflow();
      });

      await test.step('navigate away and back to workflow', async () => {
        await pageObjects.workflowList.navigate();
        await page.testSubj.waitForSelector('workflowListTable', { state: 'visible' });
        const row = pageObjects.workflowList.getWorkflowRow(workflowName);
        await row.getByRole('link', { name: workflowName }).click();
        await pageObjects.workflowEditor.waitForEditorToLoad();
      });

      await test.step('verify YAML content preserved', async () => {
        const loadedYaml = await pageObjects.workflowEditor.getYamlEditorValue();

        // Comments
        expect(loadedYaml).toContain('# Header comment for roundtrip test');
        expect(loadedYaml).toContain('# Trigger section comment');
        expect(loadedYaml).toContain('# Steps section');

        // Consts
        expect(loadedYaml).toContain('api_key: "secret-123"');
        expect(loadedYaml).toContain('timeout_sec: 30');
        expect(loadedYaml).toContain('retries: 3');

        // Inputs
        expect(loadedYaml).toContain('message');
        expect(loadedYaml).toContain('default message');
        expect(loadedYaml).toContain('count');

        // Tags
        expect(loadedYaml).toContain('tag1');
        expect(loadedYaml).toContain('tag2');

        // Steps and template expressions
        expect(loadedYaml).toContain('first_step');
        expect(loadedYaml).toContain('second_step');
        expect(loadedYaml).toContain('{{ inputs.message }}');
        expect(loadedYaml).toContain('{{ consts.timeout_sec }}');
      });
    });

    test('validation errors: schema error (duplicate step names) displays correctly', async ({
      pageObjects,
    }) => {
      const workflowName = 'Duplicate Steps Workflow';
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getDuplicateStepNamesYaml(workflowName)
      );

      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toBeVisible();
      await expect(validationAccordion).toContainText('error');

      await validationAccordion.getByRole('button', { name: /error/ }).click();
      await expect(validationAccordion).toContainText(/duplicate|unique|not unique/i);
    });

    test('validation errors: missing required property (steps) displays correctly', async ({
      pageObjects,
    }) => {
      const workflowName = 'Missing Steps Workflow';
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getInvalidWorkflowYaml(workflowName)
      );

      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toBeVisible();
      await expect(validationAccordion).toContainText('error');

      await validationAccordion.getByRole('button', { name: /error/ }).click();
      await expect(validationAccordion).toContainText('missing property "steps"');
    });

    test('validation errors: fixing invalid YAML clears errors and shows no validation message', async ({
      pageObjects,
    }) => {
      const workflowName = 'Fixable Validation Workflow';
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getInvalidWorkflowYaml(workflowName)
      );

      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toBeVisible();
      await expect(validationAccordion).toContainText('error');

      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml(workflowName)
      );

      await expect(validationAccordion).toContainText('No validation errors');
    });

    test('editor with large workflow: many steps load and remain editable', async ({
      pageObjects,
      page,
    }) => {
      const workflowName = 'Large Workflow Editor Test';
      const yaml = getManyStepsWorkflowYaml(workflowName);

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);

      await pageObjects.workflowEditor.waitForEditorToLoad();
      const content = await pageObjects.workflowEditor.getYamlEditorValue();

      expect(content).toContain('step_1');
      expect(content).toContain('step_25');
      expect(content).toContain('Step 25');

      await pageObjects.workflowEditor.saveWorkflow();
      await page.testSubj.waitForSelector('workflowSavedChangesBadge');
    });

    test('clone workflow: preserves consts, inputs, tags, description, and step content', async ({
      pageObjects,
      page,
    }) => {
      const workflowName = 'Clone All Fields Test';
      const yaml = getRichWorkflowForRoundtripYaml(workflowName);

      await test.step('create workflow with rich content', async () => {
        await pageObjects.workflowEditor.gotoNewWorkflow();
        await pageObjects.workflowEditor.setYamlEditorValue(yaml);
        await pageObjects.workflowEditor.saveWorkflow();
      });

      await test.step('clone from list', async () => {
        await pageObjects.workflowList.navigate();
        await page.testSubj.waitForSelector('workflowListTable', { state: 'visible' });
        const cloneButton = await pageObjects.workflowList.getThreeDotsMenuAction(
          workflowName,
          'cloneWorkflowAction'
        );
        await cloneButton.click();

        const clonedRow = pageObjects.workflowList.getWorkflowRow(`${workflowName} Copy`);
        await expect(clonedRow).toBeVisible({ timeout: 10000 });
      });

      await test.step('open cloned workflow and verify all fields preserved', async () => {
        const clonedRow = pageObjects.workflowList.getWorkflowRow(`${workflowName} Copy`);
        await clonedRow.getByRole('link', { name: `${workflowName} Copy` }).click();
        await pageObjects.workflowEditor.waitForEditorToLoad();

        const clonedYaml = await pageObjects.workflowEditor.getYamlEditorValue();

        expect(clonedYaml).toContain('# Header comment for roundtrip test');
        expect(clonedYaml).toContain('description: Workflow with rich content');
        expect(clonedYaml).toContain('tag1');
        expect(clonedYaml).toContain('tag2');
        expect(clonedYaml).toContain('api_key: "secret-123"');
        expect(clonedYaml).toContain('timeout_sec: 30');
        expect(clonedYaml).toContain('retries: 3');
        expect(clonedYaml).toContain('inputs:');
        expect(clonedYaml).toContain('message');
        expect(clonedYaml).toContain('count');
        expect(clonedYaml).toContain('first_step');
        expect(clonedYaml).toContain('second_step');
        expect(clonedYaml).toContain('{{ inputs.message }}');
        expect(clonedYaml).toContain('{{ consts.timeout_sec }}');
      });
    });

    test('enabled toggle: disabled when YAML has validation errors', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml('Invalid Toggle Test')
      );
      await pageObjects.workflowEditor.saveWorkflow();
      await page.testSubj.waitForSelector('workflowSavedChangesBadge');

      await pageObjects.workflowEditor.setYamlEditorValue(
        getInvalidWorkflowYaml('Invalid Toggle Test')
      );

      const enabledToggle = pageObjects.workflowEditor.workflowDetailEnabledToggle;
      await expect(enabledToggle).toBeDisabled();
    });

    test('enabled toggle: enabled when YAML is valid and saved', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml('Valid Toggle Test')
      );
      await pageObjects.workflowEditor.saveWorkflow();
      await page.testSubj.waitForSelector('workflowSavedChangesBadge');

      const enabledToggle = pageObjects.workflowEditor.workflowDetailEnabledToggle;
      await expect(enabledToggle).toBeEnabled();
    });

    test('enabled toggle: disabled when there are unsaved changes', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml('Unsaved Toggle Test')
      );
      await pageObjects.workflowEditor.saveWorkflow();
      await page.testSubj.waitForSelector('workflowSavedChangesBadge');

      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml('Unsaved Toggle Test').replace('hello world', 'modified')
      );

      const enabledToggle = pageObjects.workflowEditor.workflowDetailEnabledToggle;
      await expect(enabledToggle).toBeDisabled();
    });

    test('run button: disabled when YAML has validation errors', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(
        getDummyWorkflowYaml('Invalid Run Test')
      );
      await pageObjects.workflowEditor.saveWorkflow();
      await page.testSubj.waitForSelector('workflowSavedChangesBadge');

      await pageObjects.workflowEditor.setYamlEditorValue(
        getInvalidWorkflowYaml('Invalid Run Test')
      );

      const runButton = pageObjects.workflowEditor.runButton;
      await expect(runButton).toBeDisabled();
    });
  }
);
