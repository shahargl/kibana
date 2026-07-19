/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { IRouter, Logger } from '@kbn/core/server';
import { AuthzDisabled } from '@kbn/core-security-server';
import { CustomRoleCrossProjectError } from '../custom_role_cross_project_error';
import type { ExecutionIdentityService } from '../service';

const projectTypeSchema = schema.oneOf([
  schema.literal('elasticsearch'),
  schema.literal('observability'),
  schema.literal('security'),
  schema.literal('workplaceai'),
  schema.literal('vectordb'),
]);

const projectAssignmentSchema = schema.object({
  projectType: projectTypeSchema,
  projectIds: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1 }),
  roleNames: schema.arrayOf(schema.string({ minLength: 1 }), { minSize: 1 }),
});

const executionIdentityBodySchema = schema.object({
  name: schema.string({ minLength: 1, maxLength: 256 }),
  description: schema.string({ defaultValue: '' }),
  projectAssignments: schema.arrayOf(projectAssignmentSchema, { minSize: 1 }),
  allowedProjectAssignments: schema.arrayOf(projectAssignmentSchema, { defaultValue: [] }),
  allowedUserIds: schema.arrayOf(schema.number({ min: 1 }), { defaultValue: [] }),
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
        body: executionIdentityBodySchema,
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({ body: await service.create(request, request.body) });
      } catch (error) {
        logger.error(`Failed to create execution identity: ${errorMessage(error)}`);
        if (error instanceof CustomRoleCrossProjectError) {
          return response.badRequest({ body: { message: error.message } });
        }
        return response.customError({
          statusCode: 500,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.put(
    {
      path: '/internal/execution_identity/{id}',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        params: schema.object({ id: schema.string({ minLength: 1 }) }),
        body: executionIdentityBodySchema,
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({
          body: await service.update(request, request.params.id, request.body),
        });
      } catch (error) {
        logger.error(`Failed to update execution identity: ${errorMessage(error)}`);
        if (error instanceof CustomRoleCrossProjectError) {
          return response.badRequest({ body: { message: error.message } });
        }
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
      path: '/internal/execution_identity/roles',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        query: schema.object({
          projectType: projectTypeSchema,
          projectIds: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({
          body: await service.listAssignableRoles(
            request,
            request.query.projectType,
            request.query.projectIds.split(',').filter(Boolean)
          ),
        });
      } catch (error) {
        logger.error(`Failed to list assignable execution identity roles: ${errorMessage(error)}`);
        return response.customError({
          statusCode: 500,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.get(
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
        return response.ok({ body: await service.getForDisplay(request, request.params.id) });
      } catch (error) {
        return response.customError({
          statusCode: 404,
          body: { message: errorMessage(error) },
        });
      }
    }
  );

  router.get(
    {
      path: '/internal/execution_identity/{id}/can_use',
      options: { access: 'internal' },
      security: { authz: AuthzDisabled.delegateToSOClient },
      validate: {
        params: schema.object({ id: schema.string({ minLength: 1 }) }),
      },
    },
    async (_context, request, response) => {
      try {
        return response.ok({ body: await service.canUse(request, request.params.id) });
      } catch (error) {
        return response.customError({
          statusCode: 404,
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
