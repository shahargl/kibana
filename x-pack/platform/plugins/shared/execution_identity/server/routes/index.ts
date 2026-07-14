/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import { AuthzDisabled } from '@kbn/core-security-server';
import type { ExecutionIdentityService } from '../service';

const projectAssignmentSchema = schema.object({
  projectType: schema.oneOf([
    schema.literal('elasticsearch'),
    schema.literal('observability'),
    schema.literal('security'),
    schema.literal('workplaceai'),
    schema.literal('vectordb'),
  ]),
  projectIds: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1 }),
  roleNames: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1 }),
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const registerRoutes = (
  router: IRouter,
  service: ExecutionIdentityService,
  logger: Logger
): void => {
  router.post(
    {
      path: '/internal/execution_identity',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        body: schema.object({
          name: schema.string({ minLength: 1, maxLength: 256 }),
          description: schema.string({ defaultValue: '' }),
          projectAssignments: schema.arrayOf(projectAssignmentSchema, { minSize: 1 }),
        }),
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({ body: await service.create(request, request.body) });
      } catch (error) {
        logger.error(`Failed to create execution identity: ${errorMessage(error)}`);
        return response.customError({
          statusCode: 500,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.get(
    {
      path: '/internal/execution_identity',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: false,
    },
    async (_context, request, response) => {
      try {
        return response.ok({ body: await service.list(request) });
      } catch (error) {
        logger.error(`Failed to list execution identities: ${errorMessage(error)}`);
        return response.customError({
          statusCode: 500,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.get(
    {
      path: '/internal/execution_identity/{id}/binding',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        params: schema.object({ id: schema.string({ minLength: 1 }) }),
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({ body: await service.getForBinding(request, request.params.id) });
      } catch (error) {
        return response.customError({
          statusCode: 404,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.delete(
    {
      path: '/internal/execution_identity/{id}',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        params: schema.object({ id: schema.string({ minLength: 1 }) }),
      },
    },
    async (_context, request, response) => {
      try {
        await service.delete(request, request.params.id);
        return response.ok({ body: { success: true } });
      } catch (error) {
        logger.error(`Failed to delete execution identity: ${errorMessage(error)}`);
        return response.customError({
          statusCode: 500,
          body: { message: errorMessage(error) },
        });
      }
    }
  );
};
