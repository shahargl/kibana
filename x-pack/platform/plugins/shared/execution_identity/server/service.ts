/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreStart,
  KibanaRequest,
  Logger,
  SavedObject,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import type { GrantUiamAPIKeyParams } from '@kbn/core-security-server';
import type { EncryptedSavedObjectsPluginStart } from '@kbn/encrypted-saved-objects-plugin/server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import {
  EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
  type CreateExecutionIdentityRequest,
  type ExecutionIdentity,
  type ExecutionIdentityProjectAssignment,
  type ResolvedExecutionIdentity,
} from '../common/types';

interface ExecutionIdentityAttributes {
  name: string;
  description: string;
  projectAssignments: string;
  apiKeyId: string;
  apiKey: string;
  createdBy: string;
  createdAt: string;
}

interface StartServices {
  core: CoreStart;
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  spaces: SpacesPluginStart;
}

export class ExecutionIdentityService {
  private startServices?: StartServices;

  constructor(private readonly logger: Logger) {}

  public setStartServices(startServices: StartServices): void {
    this.startServices = startServices;
  }

  public async create(
    request: KibanaRequest,
    params: CreateExecutionIdentityRequest
  ): Promise<ExecutionIdentity> {
    const { core } = this.ensureStarted();
    const uiam = core.security.authc.apiKeys.uiam;
    if (!uiam) {
      throw new Error('UIAM API key support is not enabled in this Kibana deployment');
    }

    const currentUser = core.security.authc.getCurrentUser(request);
    const createdAt = new Date().toISOString();
    const grantParams: GrantUiamAPIKeyParams = {
      name: `execution-identity: ${params.name}`,
      projectRoleAssignments: this.toUiamProjectRoleAssignments(params.projectAssignments),
    };
    const apiKey = await uiam.grant(request, grantParams);
    if (!apiKey) {
      throw new Error('UIAM did not create an API key');
    }

    try {
      const savedObject = await this.getScopedClient(request).create<ExecutionIdentityAttributes>(
        EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
        {
          name: params.name,
          description: params.description,
          projectAssignments: JSON.stringify(params.projectAssignments),
          apiKeyId: apiKey.id,
          apiKey: apiKey.api_key,
          createdBy: currentUser?.username ?? 'unknown',
          createdAt,
        }
      );
      const identity = this.toExecutionIdentity(savedObject);
      this.logAudit(request, 'execution_identity_create', 'creation', identity);
      return identity;
    } catch (error) {
      await uiam.invalidateWithApiKey({ id: apiKey.id, apiKey: apiKey.api_key });
      throw error;
    }
  }

  public async list(request: KibanaRequest): Promise<ExecutionIdentity[]> {
    const response = await this.getScopedClient(request).find<ExecutionIdentityAttributes>({
      type: EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
      perPage: 1000,
      sortField: 'name',
      sortOrder: 'asc',
    });
    return response.saved_objects.map((savedObject) => this.toExecutionIdentity(savedObject));
  }

  public async getForBinding(
    request: KibanaRequest,
    id: string
  ): Promise<Omit<ResolvedExecutionIdentity, 'authorization' | 'apiKeyId'>> {
    const { spaces } = this.ensureStarted();
    const savedObject = await this.getScopedClient(request).get<ExecutionIdentityAttributes>(
      EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
      id
    );
    const identity = this.toExecutionIdentity(savedObject);
    return {
      id: identity.id,
      name: identity.name,
      spaceId: spaces.spacesService.getSpaceId(request),
    };
  }

  public async delete(request: KibanaRequest, id: string): Promise<void> {
    const { core, encryptedSavedObjects, spaces } = this.ensureStarted();
    const uiam = core.security.authc.apiKeys.uiam;
    if (!uiam) {
      throw new Error('UIAM API key support is not enabled in this Kibana deployment');
    }

    const scopedClient = this.getScopedClient(request);
    await scopedClient.get(EXECUTION_IDENTITY_SAVED_OBJECT_TYPE, id);
    const spaceId = spaces.spacesService.getSpaceId(request);
    const decrypted = await encryptedSavedObjects
      .getClient({ includedHiddenTypes: [EXECUTION_IDENTITY_SAVED_OBJECT_TYPE] })
      .getDecryptedAsInternalUser<ExecutionIdentityAttributes>(
        EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
        id,
        { namespace: spaceId }
      );

    const result = await uiam.invalidateWithApiKey({
      id: decrypted.attributes.apiKeyId,
      apiKey: decrypted.attributes.apiKey,
    });
    if (!result || result.error_count > 0) {
      throw new Error(`Failed to revoke UIAM API key for execution identity "${id}"`);
    }

    await scopedClient.delete(EXECUTION_IDENTITY_SAVED_OBJECT_TYPE, id);
    this.logAudit(
      request,
      'execution_identity_delete',
      'deletion',
      this.toExecutionIdentity(decrypted)
    );
  }

  public async resolve(id: string, spaceId: string): Promise<ResolvedExecutionIdentity> {
    const { encryptedSavedObjects } = this.ensureStarted();
    const savedObject = await encryptedSavedObjects
      .getClient({ includedHiddenTypes: [EXECUTION_IDENTITY_SAVED_OBJECT_TYPE] })
      .getDecryptedAsInternalUser<ExecutionIdentityAttributes>(
        EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
        id,
        { namespace: spaceId }
      );

    return {
      id,
      name: savedObject.attributes.name,
      spaceId,
      apiKeyId: savedObject.attributes.apiKeyId,
      authorization: `ApiKey ${savedObject.attributes.apiKey}`,
    };
  }

  private getScopedClient(request: KibanaRequest): SavedObjectsClientContract {
    const { core } = this.ensureStarted();
    return core.savedObjects.getScopedClient(request, {
      includedHiddenTypes: [EXECUTION_IDENTITY_SAVED_OBJECT_TYPE],
    });
  }

  private toUiamProjectRoleAssignments(
    assignments: ExecutionIdentityProjectAssignment[]
  ): NonNullable<GrantUiamAPIKeyParams['projectRoleAssignments']> {
    return assignments.reduce<NonNullable<GrantUiamAPIKeyParams['projectRoleAssignments']>>(
      (result, assignment) => {
        result[assignment.projectType] = [
          ...(result[assignment.projectType] ?? []),
          {
            projectIds: assignment.projectIds,
            applicationRoles: assignment.roleNames,
          },
        ];
        return result;
      },
      {}
    );
  }

  private toExecutionIdentity(
    savedObject: SavedObject<ExecutionIdentityAttributes>
  ): ExecutionIdentity {
    return {
      id: savedObject.id,
      name: savedObject.attributes.name,
      description: savedObject.attributes.description,
      projectAssignments: JSON.parse(
        savedObject.attributes.projectAssignments
      ) as ExecutionIdentityProjectAssignment[],
      apiKeyId: savedObject.attributes.apiKeyId,
      createdBy: savedObject.attributes.createdBy,
      createdAt: savedObject.attributes.createdAt,
    };
  }

  private logAudit(
    request: KibanaRequest,
    action: string,
    type: 'creation' | 'deletion',
    identity: ExecutionIdentity
  ): void {
    try {
      this.ensureStarted()
        .core.security.audit.asScoped(request)
        .log({
          message: `User has ${
            type === 'creation' ? 'created' : 'deleted'
          } execution identity [id=${identity.id}, name="${identity.name}"]`,
          event: {
            action,
            category: ['database'],
            type: [type],
            outcome: 'success',
          },
        });
    } catch (error) {
      this.logger.debug('Failed to write execution identity audit event', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  private ensureStarted(): StartServices {
    if (!this.startServices) {
      throw new Error('ExecutionIdentityService has not been started');
    }
    return this.startServices;
  }
}
