/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import { MOCK_IDP_UIAM_PROJECT_ID, MOCK_IDP_UIAM_PROJECT_ID2 } from '@kbn/mock-idp-utils';
import { apiTest, tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';

const INTERNAL_HEADERS = {
  'kbn-xsrf': 'execution-identity-cps-test',
  'x-elastic-internal-origin': 'Kibana',
  'elastic-api-version': '2023-10-31',
};

const waitForTerminalExecution = async (
  apiClient: {
    get: (
      path: string,
      options: { headers: Record<string, string>; responseType: 'json' }
    ) => Promise<{ statusCode: number; body: unknown }>;
  },
  executionId: string,
  headers: Record<string, string>
) => {
  const timeoutAt = Date.now() + 60_000;
  let lastBody: unknown;

  while (Date.now() < timeoutAt) {
    const response = await apiClient.get(
      `/api/workflows/executions/${executionId}?includeOutput=true`,
      {
        headers,
        responseType: 'json',
      }
    );
    expect(response.statusCode, JSON.stringify(response.body)).toBe(200);
    lastBody = response.body;

    const status = (response.body as { status?: string }).status;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      return response.body as {
        status: string;
        executedBy?: string;
        stepExecutions?: Array<{ stepId?: string; output?: unknown; error?: unknown }>;
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Execution did not finish within 60 seconds: ${JSON.stringify(lastBody)}`);
};

apiTest.describe(
  'execution identity with Cross-Project Search',
  { tag: tags.serverless.security.complete },
  () => {
    const runId = randomUUID().slice(0, 8);
    const indexName = `execution-identity-cps-${runId}`;
    const originMarker = `origin-project-${runId}`;
    const linkedMarker = `linked-project-${runId}`;
    let headers: Record<string, string>;
    let identityId: string | undefined;
    let apiKeyId: string | undefined;
    let workflowId: string | undefined;

    apiTest.beforeAll(async ({ apiClient, esClient, linkedProject, samlAuth }) => {
      const credentials = await samlAuth.asInteractiveUser('admin');
      headers = { ...credentials.cookieHeader, ...INTERNAL_HEADERS };

      await esClient.index({
        index: indexName,
        refresh: 'wait_for',
        document: { marker: originMarker },
      });
      await linkedProject.esClient.index({
        index: indexName,
        refresh: 'wait_for',
        document: { marker: linkedMarker },
      });

      const identityResponse = await apiClient.post('/internal/execution_identity', {
        headers,
        responseType: 'json',
        body: {
          name: `CPS workflow identity ${runId}`,
          description: 'Scout verification of UIAM-backed workflow execution',
          projectAssignments: [
            {
              projectType: 'security',
              projectIds: [MOCK_IDP_UIAM_PROJECT_ID, MOCK_IDP_UIAM_PROJECT_ID2],
              roleNames: ['admin'],
            },
          ],
        },
      });
      expect(identityResponse.statusCode, JSON.stringify(identityResponse.body)).toBe(200);
      ({ id: identityId, apiKeyId } = identityResponse.body as {
        id: string;
        apiKeyId: string;
      });

      const workflowYaml = `
name: execution identity CPS ${runId}
enabled: true
settings:
  run_as: ${identityId}
triggers:
  - type: manual
steps:
  - name: search_accessible_projects
    type: elasticsearch.request
    with:
      method: POST
      path: /${indexName}/_search
      body:
        project_routing: _alias:*
        query:
          match_all: {}
`;
      const workflowResponse = await apiClient.post('/api/workflows/workflow', {
        headers,
        responseType: 'json',
        body: { yaml: workflowYaml },
      });
      expect(workflowResponse.statusCode, JSON.stringify(workflowResponse.body)).toBe(200);
      workflowId = (workflowResponse.body as { id: string }).id;
    });

    apiTest.afterAll(async ({ apiClient, esClient, linkedProject }) => {
      if (workflowId) {
        await apiClient.delete(
          `/api/workflows/workflow/${encodeURIComponent(workflowId)}?force=true`,
          {
            headers,
            responseType: 'json',
          }
        );
      }
      if (identityId) {
        await apiClient.delete(`/internal/execution_identity/${encodeURIComponent(identityId)}`, {
          headers,
          responseType: 'json',
        });
      }
      await esClient.indices.delete({ index: indexName }, { ignore: [404] });
      await linkedProject.esClient.indices.delete({ index: indexName }, { ignore: [404] });
    });

    apiTest(
      'runs a workflow against the linked project as the selected identity',
      async ({ apiClient }) => {
        const runResponse = await apiClient.post(
          `/api/workflows/workflow/${encodeURIComponent(workflowId!)}/run`,
          {
            headers,
            responseType: 'json',
            body: { inputs: {} },
          }
        );
        expect(runResponse.statusCode, JSON.stringify(runResponse.body)).toBe(200);

        const { workflowExecutionId } = runResponse.body as { workflowExecutionId: string };
        const execution = await waitForTerminalExecution(apiClient, workflowExecutionId, headers);
        expect(execution.status, JSON.stringify(execution)).toBe('completed');
        expect(execution.executedBy).toBe(`service_account:${identityId}`);

        const searchStep = execution.stepExecutions?.find(
          (step) => step.stepId === 'search_accessible_projects'
        );
        expect(searchStep?.error).toBeUndefined();
        expect(JSON.stringify(searchStep?.output)).toContain(originMarker);
        expect(JSON.stringify(searchStep?.output)).toContain(linkedMarker);
      }
    );

    apiTest(
      'rotates the API key and applies updated project access to subsequent runs',
      async ({ apiClient }) => {
        const updateResponse = await apiClient.put(
          `/internal/execution_identity/${encodeURIComponent(identityId!)}`,
          {
            headers,
            responseType: 'json',
            body: {
              name: `CPS workflow identity ${runId}`,
              description: 'Updated to origin-project access only',
              projectAssignments: [
                {
                  projectType: 'security',
                  projectIds: [MOCK_IDP_UIAM_PROJECT_ID],
                  roleNames: ['admin'],
                },
              ],
            },
          }
        );
        expect(updateResponse.statusCode, JSON.stringify(updateResponse.body)).toBe(200);
        expect((updateResponse.body as { apiKeyId: string }).apiKeyId).not.toBe(apiKeyId);

        const runResponse = await apiClient.post(
          `/api/workflows/workflow/${encodeURIComponent(workflowId!)}/run`,
          {
            headers,
            responseType: 'json',
            body: { inputs: {} },
          }
        );
        expect(runResponse.statusCode, JSON.stringify(runResponse.body)).toBe(200);

        const { workflowExecutionId } = runResponse.body as { workflowExecutionId: string };
        const execution = await waitForTerminalExecution(apiClient, workflowExecutionId, headers);
        expect(execution.status, JSON.stringify(execution)).toBe('completed');
        expect(execution.executedBy).toBe(`service_account:${identityId}`);

        const searchStep = execution.stepExecutions?.find(
          (step) => step.stepId === 'search_accessible_projects'
        );
        expect(searchStep?.error).toBeUndefined();
        expect(JSON.stringify(searchStep?.output)).toContain(originMarker);
        expect(JSON.stringify(searchStep?.output)).not.toContain(linkedMarker);
      }
    );
  }
);
