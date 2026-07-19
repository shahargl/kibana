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
  'kbn-xsrf': 'execution-identity-role-test',
  'x-elastic-internal-origin': 'Kibana',
  'elastic-api-version': '2023-10-31',
};

apiTest.describe(
  'execution identity role discovery and delegation policy',
  { tag: tags.serverless.security.complete },
  () => {
    const runId = randomUUID().slice(0, 8);
    const customRoleName = `workflow_logs_reader_${runId}`;
    let adminHeaders: Record<string, string>;
    let editorHeaders: Record<string, string>;
    let viewerHeaders: Record<string, string>;
    let identityId: string | undefined;

    apiTest.beforeAll(async ({ esClient, samlAuth }) => {
      const [admin, editor, viewer] = await Promise.all([
        samlAuth.asInteractiveUser('admin'),
        samlAuth.asInteractiveUser('editor'),
        samlAuth.asInteractiveUser('viewer'),
      ]);
      adminHeaders = { ...admin.cookieHeader, ...INTERNAL_HEADERS };
      editorHeaders = { ...editor.cookieHeader, ...INTERNAL_HEADERS };
      viewerHeaders = { ...viewer.cookieHeader, ...INTERNAL_HEADERS };
      await esClient.security.putRole({
        name: customRoleName,
        cluster: [],
        indices: [
          {
            names: [`execution-identity-custom-${runId}-*`],
            privileges: ['read'],
          },
        ],
        applications: [],
        run_as: [],
      });
    });

    apiTest.afterAll(async ({ apiClient, esClient }) => {
      if (identityId) {
        await apiClient.delete(`/internal/execution_identity/${encodeURIComponent(identityId)}`, {
          headers: adminHeaders,
          responseType: 'json',
        });
      }
      await esClient.security.deleteRole({ name: customRoleName }, { ignore: [404] });
    });

    apiTest(
      'discovers custom roles and enforces role delegation through can_use',
      async ({ apiClient }) => {
        const crossProjectRolesResponse = await apiClient.get(
          `/internal/execution_identity/roles?projectType=security&projectIds=${MOCK_IDP_UIAM_PROJECT_ID},${MOCK_IDP_UIAM_PROJECT_ID2}`,
          {
            headers: adminHeaders,
            responseType: 'json',
          }
        );
        expect(
          crossProjectRolesResponse.statusCode,
          JSON.stringify(crossProjectRolesResponse.body)
        ).toBe(200);
        expect(crossProjectRolesResponse.body).toStrictEqual(
          expect.arrayContaining([
            { name: 'admin', kind: 'built_in' },
            { name: 'editor', kind: 'built_in' },
            { name: 'viewer', kind: 'built_in' },
          ])
        );

        const rolesResponse = await apiClient.get(
          `/internal/execution_identity/roles?projectType=security&projectIds=${MOCK_IDP_UIAM_PROJECT_ID}`,
          {
            headers: adminHeaders,
            responseType: 'json',
          }
        );
        expect(rolesResponse.statusCode, JSON.stringify(rolesResponse.body)).toBe(200);
        expect(rolesResponse.body).toStrictEqual(
          expect.arrayContaining([
            { name: 'viewer', kind: 'built_in' },
            { name: customRoleName, kind: 'custom' },
          ])
        );

        const crossProjectCreateResponse = await apiClient.post('/internal/execution_identity', {
          headers: adminHeaders,
          responseType: 'json',
          body: {
            name: `Invalid cross-project custom role identity ${runId}`,
            description: 'Custom roles are intentionally single-project in this PoC',
            projectAssignments: [
              {
                projectType: 'security',
                projectIds: [MOCK_IDP_UIAM_PROJECT_ID, MOCK_IDP_UIAM_PROJECT_ID2],
                roleNames: [customRoleName],
              },
            ],
          },
        });
        expect(
          crossProjectCreateResponse.statusCode,
          JSON.stringify(crossProjectCreateResponse.body)
        ).toBe(400);
        expect(crossProjectCreateResponse.body).toStrictEqual(
          expect.objectContaining({
            message: expect.stringContaining('cannot be assigned to a cross-project'),
          })
        );

        const createResponse = await apiClient.post('/internal/execution_identity', {
          headers: adminHeaders,
          responseType: 'json',
          body: {
            name: `Custom role identity ${runId}`,
            description: 'Scout verification of UIAM custom role delegation and use policy',
            projectAssignments: [
              {
                projectType: 'security',
                projectIds: [MOCK_IDP_UIAM_PROJECT_ID],
                roleNames: [customRoleName],
              },
            ],
            allowedProjectAssignments: [
              {
                projectType: 'security',
                projectIds: [MOCK_IDP_UIAM_PROJECT_ID],
                roleNames: ['editor'],
              },
            ],
          },
        });
        expect(createResponse.statusCode, JSON.stringify(createResponse.body)).toBe(200);
        const createdIdentity = createResponse.body as { id: string };
        identityId = createdIdentity.id;

        const deniedResponse = await apiClient.get(
          `/internal/execution_identity/${encodeURIComponent(identityId)}/can_use`,
          {
            headers: viewerHeaders,
            responseType: 'json',
          }
        );
        expect(deniedResponse.statusCode, JSON.stringify(deniedResponse.body)).toBe(200);
        expect(deniedResponse.body).toStrictEqual({
          allowed: false,
          reason: 'role_policy_not_covered',
        });

        const editorAllowedResponse = await apiClient.get(
          `/internal/execution_identity/${encodeURIComponent(identityId)}/can_use`,
          {
            headers: editorHeaders,
            responseType: 'json',
          }
        );
        expect(editorAllowedResponse.statusCode, JSON.stringify(editorAllowedResponse.body)).toBe(
          200
        );
        expect(editorAllowedResponse.body).toStrictEqual({
          allowed: true,
          reason: 'explicit_role_policy',
        });

        const updateResponse = await apiClient.put(
          `/internal/execution_identity/${encodeURIComponent(identityId)}`,
          {
            headers: adminHeaders,
            responseType: 'json',
            body: {
              name: `Custom role identity ${runId}`,
              description: 'Updated to delegate use to viewers',
              projectAssignments: [
                {
                  projectType: 'security',
                  projectIds: [MOCK_IDP_UIAM_PROJECT_ID],
                  roleNames: [customRoleName],
                },
              ],
              allowedProjectAssignments: [
                {
                  projectType: 'security',
                  projectIds: [MOCK_IDP_UIAM_PROJECT_ID],
                  roleNames: ['viewer'],
                },
              ],
            },
          }
        );
        expect(updateResponse.statusCode, JSON.stringify(updateResponse.body)).toBe(200);

        const allowedResponse = await apiClient.get(
          `/internal/execution_identity/${encodeURIComponent(identityId)}/can_use`,
          {
            headers: viewerHeaders,
            responseType: 'json',
          }
        );
        expect(allowedResponse.statusCode, JSON.stringify(allowedResponse.body)).toBe(200);
        expect(allowedResponse.body).toStrictEqual({
          allowed: true,
          reason: 'explicit_role_policy',
        });
      }
    );
  }
);
