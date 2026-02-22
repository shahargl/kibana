/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * E2E tests for bugs reported in Slack (#one-workflow, #one-workflow-eng).
 * Each test documents a concrete, reproducible problem with a reference to the Slack thread.
 *
 * DO NOT run these tests in CI until verified locally — they may be flaky or environment-dependent.
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../fixtures';
import { cleanupWorkflowsAndRules } from '../fixtures/cleanup';
import {
  EXECUTION_TIMEOUT,
  LONG_EXECUTION_TIMEOUT,
} from '../fixtures/constants';
import { getManyIterationsWorkflowYaml } from '../fixtures/workflows';

// ---------------------------------------------------------------------------
// Ty Bekiares: Foreach rendering errors with many iterations
// Slack: #one-workflow (2026-02-12), Thread C08U04SUN49/1770907169.626789
// "not a big deal, but for workflows with lots of items foreach to iterate on,
//  with a bunch of steps, I still run across occasional rendering errors like this. this is serverless."
// ---------------------------------------------------------------------------
const FOREACH_MANY_ITERATIONS_YAML = getManyIterationsWorkflowYaml(
  'Foreach Many Iterations Bug Hunt'
);

// ---------------------------------------------------------------------------
// Rohan Singhvi: inputs.action_type condition not being satisfied
// Slack: #one-workflow (2026-02-09), Thread C08U04SUN49/1770622730.838369
// "Hi, below is part of my workflow. I am trying to trigger this via Logstash
//  and it looks like I am successfully able to do so BUT the condition I have
//  outlined is not getting satisfied despite _seeming like it should"
// Tal Borenstein: "try condition: inputs.action_type == Acknowledge (the sign preserves the actual type)"
// ---------------------------------------------------------------------------
const INPUTS_ACTION_TYPE_CONDITION_YAML = `name: inputs action_type condition
inputs:
  - name: action_type
    type: string
    default: "Acknowledge"
  - name: dummy
    type: string
    default: "x"
triggers:
  - type: manual
steps:
  - name: check_action
    type: if
    condition: 'inputs.action_type: "Acknowledge"'
    steps:
      - name: action_matched
        type: console
        with:
          message: "Condition satisfied: action_type is Acknowledge"
  - name: always_run
    type: console
    with:
      message: "Done"`;

// ---------------------------------------------------------------------------
// Morgan Goeller: Flattened field workflows not working
// Slack: #one-workflow (2026-02-11), Thread C08U04SUN49/1770843754.488589
// "I was trying to get workflows to work with a flattened field, like this:
//  name: Generate location description: Capture location details and tags. tags: example, location"
// Kibana alert objects use flattened keys (e.g. kibana.alert.reason). Simulate with manual input.
// ---------------------------------------------------------------------------
const FLATTENED_FIELD_YAML = `name: flattened field workflow
inputs:
  - name: dummy
    type: string
    default: "x"
  - name: flattened_event
    type: string
    default: '{"kibana.alert.reason": "High CPU", "host.name": "server-01"}'
triggers:
  - type: manual
steps:
  - name: parse_event
    type: data.set
    with:
      event: '\${{ inputs.flattened_event | json_parse }}'
  - name: log_reason
    type: console
    with:
      message: "Reason: {{ variables.event['kibana.alert.reason'] }}"`;

// ---------------------------------------------------------------------------
// Xiaoguo Liu: Bulk writes not indexed for search (refresh issue)
// Slack: #one-workflow (2026-02-04), Resolved - Omri: "Use refresh=wait_for"
// "I tried national park example. Returned result is 0 for term search canyon but DSL search returns 2"
// elasticsearch.bulk uses refresh: false by default, so data not immediately searchable.
// This test uses bulk WITHOUT explicit refresh to reproduce the race.
// ---------------------------------------------------------------------------
const BULK_NO_REFRESH_YAML = `name: bulk no refresh bug hunt
consts:
  indexName: bulk-refresh-bug-hunt
triggers:
  - type: manual
inputs:
  - name: dummy
    type: string
    default: "x"
steps:
  - name: create_index
    type: elasticsearch.indices.create
    with:
      index: "{{ consts.indexName }}"
      mappings:
        properties:
          name: { type: text }
          category: { type: keyword }
  - name: bulk_index
    type: elasticsearch.bulk
    with:
      index: "{{ consts.indexName }}"
      operations:
        - name: "Grand Canyon"
          category: "canyon"
        - name: "Zion"
          category: "canyon"
        - name: "Yellowstone"
          category: "geothermal"
  - name: search_canyon
    type: elasticsearch.search
    with:
      index: "{{ consts.indexName }}"
      size: 10
      query:
        term:
          category: canyon
  - name: log_results
    type: console
    with:
      message: "Found {{ steps.search_canyon.output.hits.total.value }} canyon parks"`;

// ---------------------------------------------------------------------------
// Philipp Kahr: Timestamp field in elasticsearch.index step
// Slack: #one-workflow (2026-02-13), Thread C08U04SUN49/1770995613.738579 [RESOLVED]
// "I am a bit confused on how in an index action I would set the timestamp field."
// James Spiteri: example in workflow lib. Philipp: "Oh sad it doesnt do ISO8601 per default. Still complaining about timestamp"
// ---------------------------------------------------------------------------
const TIMESTAMP_INDEX_YAML = `name: timestamp index bug hunt
consts:
  indexName: timestamp-bug-hunt
triggers:
  - type: manual
inputs:
  - name: dummy
    type: string
    default: "x"
steps:
  - name: create_index
    type: elasticsearch.indices.create
    with:
      index: "{{ consts.indexName }}"
      mappings:
        properties:
          "@timestamp":
            type: date
          message: { type: text }
  - name: index_with_timestamp
    type: elasticsearch.index
    with:
      index: "{{ consts.indexName }}"
      document:
        "@timestamp": "2026-02-19T12:00:00.000Z"
        message: "Test document with explicit timestamp"
  - name: verify
    type: console
    with:
      message: "Indexed"`;

// ---------------------------------------------------------------------------
// Ayelet Paz Akler: Cancel execution doesn't work, keeps running
// Slack: #one-workflow-eng (2026-01-07), Thread in Autocomplete & Editor Intelligence section
// "Not sure if its a known bug: I got many errors on the executions, Im trying to cancel but it continues to run"
// Suggestion: cancel from list view.
// ---------------------------------------------------------------------------
const LONG_RUNNING_CANCEL_YAML = `name: cancel execution bug hunt
triggers:
  - type: manual
inputs:
  - name: dummy
    type: string
    default: "x"
steps:
  - name: before_wait
    type: console
    with:
      message: "About to wait 30s"
  - name: wait_step
    type: wait
    with:
      duration: 30s
  - name: after_wait
    type: console
    with:
      message: "Wait completed"`;

test.describe(
  'Bug hunt: Slack-reported issues',
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

    test('Ty Bekiares: foreach with many iterations should render without errors', async ({
      pageObjects,
      page,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(FOREACH_MANY_ITERATIONS_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus(
        'completed',
        LONG_EXECUTION_TIMEOUT
      );
      await pageObjects.workflowExecution.expandStepsTree();

      const afterForeachStep = await pageObjects.workflowExecution.getStep('after_foreach_step');
      await expect(afterForeachStep).toBeVisible();

      const iterationSteps = pageObjects.workflowExecution.executionPanel.getByRole('button', {
        name: /^(?!foreach_).*hello_world_step/,
      });
      await expect(iterationSteps).toHaveCount(50);
    });

    test('Rohan Singhvi: inputs.action_type == Acknowledge condition should be satisfied', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(INPUTS_ACTION_TYPE_CONDITION_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({
        action_type: 'Acknowledge',
        dummy: 'x',
      });

      await pageObjects.workflowExecution.waitForExecutionStatus(
        'completed',
        EXECUTION_TIMEOUT
      );
      await pageObjects.workflowExecution.expandStepsTree();

      const actionMatchedStep = await pageObjects.workflowExecution.getStep(
        'check_action > action_matched'
      );
      await expect(actionMatchedStep).toBeVisible();
      await actionMatchedStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('Condition satisfied');
    });

    test('Morgan Goeller: flattened/dotted keys in variables should resolve correctly', async ({
      pageObjects,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(FLATTENED_FIELD_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.executeWorkflowWithInputs({
        dummy: 'x',
        flattened_event:
          '{"kibana.alert.reason": "High CPU", "host.name": "server-01"}',
      });

      await pageObjects.workflowExecution.waitForExecutionStatus(
        'completed',
        EXECUTION_TIMEOUT
      );

      const logStep = await pageObjects.workflowExecution.getStep('log_reason');
      await logStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toContain('High CPU');
    });

    test('Xiaoguo Liu: bulk then search should find documents (refresh: wait_for or indexed)', async ({
      pageObjects,
      browserAuth,
    }) => {
      await browserAuth.loginWithCustomRole({
        elasticsearch: {
          cluster: ['manage_index_templates'],
          indices: [
            {
              names: ['bulk-refresh-bug-hunt', 'timestamp-bug-hunt'],
              privileges: [
                'create_index',
                'read',
                'view_index_metadata',
                'write',
                'delete_index',
              ],
            },
          ],
        },
        kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
      });
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(BULK_NO_REFRESH_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus(
        'completed',
        EXECUTION_TIMEOUT
      );

      const searchStep = await pageObjects.workflowExecution.getStep('search_canyon');
      await searchStep.click();
      const searchOutput = await pageObjects.workflowExecution.getStepResultJson<{
        hits: { total: { value: number }; hits: unknown[] };
      }>('output');

      // Bug (Xiaoguo Liu): elasticsearch.bulk without refresh causes search to return 0.
      // Expected: 2 canyon parks (Grand Canyon, Zion). When bug exists: 0.
      expect(searchOutput.hits.total.value).toBe(2);
    });

    test('Philipp Kahr: elasticsearch.index with @timestamp field should index successfully', async ({
      pageObjects,
      browserAuth,
    }) => {
      await browserAuth.loginWithCustomRole({
        elasticsearch: {
          cluster: ['manage_index_templates'],
          indices: [
            {
              names: ['bulk-refresh-bug-hunt', 'timestamp-bug-hunt'],
              privileges: [
                'create_index',
                'read',
                'view_index_metadata',
                'write',
                'delete_index',
              ],
            },
          ],
        },
        kibana: [{ base: ['all'], feature: {}, spaces: ['*'] }],
      });
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(TIMESTAMP_INDEX_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionStatus(
        'completed',
        EXECUTION_TIMEOUT
      );

      const indexStep = await pageObjects.workflowExecution.getStep('index_with_timestamp');
      await expect(indexStep).toBeVisible();

      const verifyStep = await pageObjects.workflowExecution.getStep('verify');
      await verifyStep.click();
      const output = await pageObjects.workflowExecution.getStepResultJson<string>('output');
      expect(output).toBe('Indexed');
    });

    test('Ayelet Paz Akler: cancel execution should stop running workflow', async ({
      pageObjects,
      page,
    }) => {
      await pageObjects.workflowEditor.gotoNewWorkflow();
      await pageObjects.workflowEditor.setYamlEditorValue(LONG_RUNNING_CANCEL_YAML);
      await pageObjects.workflowEditor.saveWorkflow();
      await pageObjects.workflowEditor.clickRunButton();
      await page.testSubj.waitForSelector('workflowExecuteModal', { state: 'visible' });
      await page.testSubj.click('executeWorkflowButton');

      await pageObjects.workflowExecution.waitForExecutionView();

      const cancelButton = page.testSubj.locator('cancelExecutionButton');
      await expect(cancelButton).toBeVisible({ timeout: 5000 });
      await cancelButton.click();

      const cancelledPanel = page
        .testSubj.locator('workflowExecutionPanel')
        .and(page.locator('[data-execution-status="cancelled"]'));
      await expect(cancelledPanel).toBeVisible({ timeout: LONG_EXECUTION_TIMEOUT });
    });
  }
);
