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

test.describe(
  'P1 schema bug: document field template expression',
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

    test('document field with template expression should not show Incorrect type / __schema146', async ({
      pageObjects,
      page,
    }) => {
      // Valid workflow: variables.doc is set by data.set; elasticsearch.index uses document: ${{ variables.doc }}.
      // Schema should NOT flag template expressions — type is only known at runtime. Bug: editor shows
      // "Incorrect type. Expected '__schema146'" at steps.1.with.document and blocks the workflow.
      const yaml = `name: p1-document-undefined-crash
triggers:
  - type: manual
inputs:
  - name: dummy
    type: string
    default: "x"
steps:
  - name: set_doc
    type: data.set
    with:
      doc:
        - a: 2
  - name: index_step
    type: elasticsearch.index
    with:
      index: workflows-p1-test
      id: "p1"
      document: \${{ variables.doc }}`;

      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(yaml);
      await page.waitForTimeout(2000);

      const validationAccordion = pageObjects.workflowEditor.validationErrorsAccordion;
      await expect(validationAccordion).toBeVisible();

      // Bug: schema flags document: ${{ variables.doc }} as "Incorrect type. Expected '__schema146'".
      // Template expressions must not be type-checked statically — they are valid.
      await expect(validationAccordion).not.toContainText('__schema146');
      await expect(validationAccordion).not.toContainText('Incorrect type');
    });
  }
);
