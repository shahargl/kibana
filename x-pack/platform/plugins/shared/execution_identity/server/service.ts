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
  type ExecutionIdentityAssignableRole,
  type ExecutionIdentityProjectAssignment,
  type ExecutionIdentityProjectType,
  type ExecutionIdentityUseAuthorization,
  type ResolvedExecutionIdentity,
  type UpdateExecutionIdentityRequest,
} from '../common/types';
import { CustomRoleCrossProjectError } from './custom_role_cross_project_error';

interface ExecutionIdentityAttributes {
  name: string;
  description: string;
  projectAssignments: string;
  allowedProjectAssignments?: string;
  allowedUserIds?: number[];
  apiKeyId: string;
  apiKey: string;
  createdBy: string;
  createdByDisplayName?: string;
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
    await this.ensureCustomRolesAreSingleProject(request, params.projectAssignments);
    const grantParams: GrantUiamAPIKeyParams = {
      name: `execution-identity: ${params.name}`,
      projectRoleAssignments: this.toUiamProjectRoleAssignments(params.projectAssignments),
      ...(params.allowedProjectAssignments?.length
        ? {
            allowedRoleAssignments: this.toUiamProjectRoleAssignments(
              params.allowedProjectAssignments
            ),
          }
        : {}),
      ...(params.allowedUserIds?.length ? { allowedUserIds: params.allowedUserIds } : {}),
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
          allowedProjectAssignments: JSON.stringify(params.allowedProjectAssignments ?? []),
          allowedUserIds: params.allowedUserIds ?? [],
          apiKeyId: apiKey.id,
          apiKey: apiKey.api_key,
          createdBy: currentUser?.username ?? 'unknown',
          createdByDisplayName: currentUser?.full_name ?? currentUser?.username ?? 'unknown',
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
    const currentUser = this.ensureStarted().core.security.authc.getCurrentUser(request);
    const response = await this.getScopedClient(request).find<ExecutionIdentityAttributes>({
      type: EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
      perPage: 1000,
      sortField: 'name',
      sortOrder: 'asc',
    });
    return response.saved_objects.map((savedObject) => {
      const identity = this.toExecutionIdentity(savedObject);
      return {
        ...identity,
        createdByDisplayName:
          identity.createdByDisplayName ??
          (identity.createdBy === currentUser?.username ? currentUser.full_name : undefined),
      };
    });
  }

  public async listAssignableRoles(
    request: KibanaRequest,
    projectType: ExecutionIdentityProjectType,
    projectIds: string[]
  ): Promise<ExecutionIdentityAssignableRole[]> {
    const { core } = this.ensureStarted();
    const uiam = core.security.authc.apiKeys.uiam;
    if (!uiam) {
      throw new Error('UIAM API key support is not enabled in this Kibana deployment');
    }

    const customApplicationRoles =
      projectIds.length === 1 ? await this.getCustomRoleCandidates(request) : [];
    const response = await uiam.delegableRoles(request, {
      projectType,
      projectIds,
      customApplicationRoles,
    });
    return (
      response?.roles.map(({ roleId, kind }) => ({
        name: roleId,
        kind,
      })) ?? []
    );
  }

  public async canUse(
    request: KibanaRequest,
    id: string
  ): Promise<ExecutionIdentityUseAuthorization> {
    const { core } = this.ensureStarted();
    const uiam = core.security.authc.apiKeys.uiam;
    if (!uiam) {
      return { allowed: false, reason: 'uiam_unavailable' };
    }

    const savedObject = await this.getInternalSavedObject(request, id);
    return (
      (await uiam.canUse(request, savedObject.attributes.apiKeyId)) ?? {
        allowed: false,
        reason: 'uiam_unavailable',
      }
    );
  }

  public async getForDisplay(request: KibanaRequest, id: string): Promise<ExecutionIdentity> {
    // Display metadata is intentionally available independently of `canUse`. Users need to see
    // which non-secret roles and projects make a referenced identity unavailable to them.
    return this.toExecutionIdentity(await this.getInternalSavedObject(request, id));
  }

  public async update(
    request: KibanaRequest,
    id: string,
    params: UpdateExecutionIdentityRequest
  ): Promise<ExecutionIdentity> {
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

    await this.ensureCustomRolesAreSingleProject(request, params.projectAssignments);
    const newApiKey = await uiam.grant(request, {
      name: `execution-identity: ${params.name}`,
      projectRoleAssignments: this.toUiamProjectRoleAssignments(params.projectAssignments),
      ...(params.allowedProjectAssignments?.length
        ? {
            allowedRoleAssignments: this.toUiamProjectRoleAssignments(
              params.allowedProjectAssignments
            ),
          }
        : {}),
      ...(params.allowedUserIds?.length ? { allowedUserIds: params.allowedUserIds } : {}),
    });
    if (!newApiKey) {
      throw new Error('UIAM did not create a replacement API key');
    }

    const updatedAttributes: ExecutionIdentityAttributes = {
      ...decrypted.attributes,
      name: params.name,
      description: params.description,
      projectAssignments: JSON.stringify(params.projectAssignments),
      allowedProjectAssignments: JSON.stringify(params.allowedProjectAssignments ?? []),
      allowedUserIds: params.allowedUserIds ?? [],
      apiKeyId: newApiKey.id,
      apiKey: newApiKey.api_key,
    };
    let identity: ExecutionIdentity;
    try {
      const updated = await scopedClient.update<ExecutionIdentityAttributes>(
        EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
        id,
        updatedAttributes,
        { version: decrypted.version }
      );
      identity = this.toExecutionIdentityAttributes(updated.id, updatedAttributes);
    } catch (error) {
      try {
        const cleanupResult = await uiam.invalidateWithApiKey({
          id: newApiKey.id,
          apiKey: newApiKey.api_key,
        });
        if (!cleanupResult || cleanupResult.error_count > 0) {
          this.logger.error(
            `Failed to clean up replacement UIAM API key after execution identity update "${id}" failed`
          );
        }
      } catch (cleanupError) {
        this.logger.error(
          `Failed to clean up replacement UIAM API key after execution identity update "${id}" failed`,
          {
            error: cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError)),
          }
        );
      }
      throw error;
    }

    try {
      const revokeResult = await uiam.invalidateWithApiKey({
        id: decrypted.attributes.apiKeyId,
        apiKey: decrypted.attributes.apiKey,
      });
      if (!revokeResult || revokeResult.error_count > 0) {
        this.logger.error(`Failed to revoke replaced UIAM API key for execution identity "${id}"`);
      }
    } catch (error) {
      this.logger.error(`Failed to revoke replaced UIAM API key for execution identity "${id}"`, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }

    this.logAudit(request, 'execution_identity_update', 'change', identity);
    return identity;
  }

  public async getForBinding(
    request: KibanaRequest,
    id: string
  ): Promise<Omit<ResolvedExecutionIdentity, 'authorization' | 'apiKeyId'>> {
    const { spaces } = this.ensureStarted();
    const authorization = await this.canUse(request, id);
    if (!authorization.allowed) {
      throw new Error(`Current user cannot use execution identity "${id}"`);
    }
    const savedObject = await this.getInternalSavedObject(request, id);
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

  private async getInternalSavedObject(
    request: KibanaRequest,
    id: string
  ): Promise<SavedObject<ExecutionIdentityAttributes>> {
    const { core, spaces } = this.ensureStarted();
    const spaceId = spaces.spacesService.getSpaceId(request);
    const namespace = spaces.spacesService.spaceIdToNamespace(spaceId);
    return core.savedObjects
      .createInternalRepository([EXECUTION_IDENTITY_SAVED_OBJECT_TYPE])
      .get<ExecutionIdentityAttributes>(EXECUTION_IDENTITY_SAVED_OBJECT_TYPE, id, { namespace });
  }

  private async ensureCustomRolesAreSingleProject(
    request: KibanaRequest,
    assignments: ExecutionIdentityProjectAssignment[]
  ): Promise<void> {
    for (const assignment of assignments) {
      if (assignment.projectIds.length < 2) {
        continue;
      }
      const roles = await this.listAssignableRoles(
        request,
        assignment.projectType,
        assignment.projectIds
      );
      const delegableBuiltInRoleNames = new Set(
        roles.filter(({ kind }) => kind === 'built_in').map(({ name }) => name)
      );
      const unsupportedRole = assignment.roleNames.find(
        (roleName) => !delegableBuiltInRoleNames.has(roleName)
      );
      if (unsupportedRole) {
        throw new CustomRoleCrossProjectError(
          `Role "${unsupportedRole}" is not a delegable built-in role across the selected projects; custom roles cannot be assigned to a cross-project execution identity`
        );
      }
    }
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
    return this.toExecutionIdentityAttributes(savedObject.id, savedObject.attributes);
  }

  private toExecutionIdentityAttributes(
    id: string,
    attributes: ExecutionIdentityAttributes
  ): ExecutionIdentity {
    return {
      id,
      name: attributes.name,
      description: attributes.description,
      projectAssignments: JSON.parse(
        attributes.projectAssignments
      ) as ExecutionIdentityProjectAssignment[],
      allowedProjectAssignments: attributes.allowedProjectAssignments
        ? (JSON.parse(attributes.allowedProjectAssignments) as ExecutionIdentityProjectAssignment[])
        : [],
      allowedUserIds: attributes.allowedUserIds ?? [],
      apiKeyId: attributes.apiKeyId,
      createdBy: attributes.createdBy,
      createdByDisplayName: attributes.createdByDisplayName,
      createdAt: attributes.createdAt,
    };
  }

  private logAudit(
    request: KibanaRequest,
    action: string,
    type: 'creation' | 'change' | 'deletion',
    identity: ExecutionIdentity
  ): void {
    try {
      this.ensureStarted()
        .core.security.audit.asScoped(request)
        .log({
          message: `User has ${
            type === 'creation' ? 'created' : type === 'change' ? 'updated' : 'deleted'
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

  private async getCustomRoleCandidates(request: KibanaRequest): Promise<string[]> {
    const { core } = this.ensureStarted();
    const currentUserRoles = core.security.authc.getCurrentUser(request)?.roles ?? [];
    try {
      const result = await core.elasticsearch.client
        .asScoped(request)
        .asCurrentUser.security.queryRole({
          query: { match_all: {} },
          size: 1000,
        });
      const customRoleNames = (result.roles ?? [])
        .filter((role) => role.metadata?._reserved !== true)
        .map((role) => role.name);
      return [...new Set([...currentUserRoles, ...customRoleNames])].sort();
    } catch (error) {
      this.logger.debug(
        'Unable to query the project custom-role catalog; using caller role names as candidates',
        {
          error: error instanceof Error ? error : new Error(String(error)),
        }
      );
      return [...new Set(currentUserRoles)].sort();
    }
  }

  private ensureStarted(): StartServices {
    if (!this.startServices) {
      throw new Error('ExecutionIdentityService has not been started');
    }
    return this.startServices;
  }
}
