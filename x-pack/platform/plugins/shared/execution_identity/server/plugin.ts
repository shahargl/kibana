/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CoreSetup,
  CoreStart,
  KibanaRequest,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '@kbn/core/server';
import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import type {
  EncryptedSavedObjectsPluginSetup,
  EncryptedSavedObjectsPluginStart,
} from '@kbn/encrypted-saved-objects-plugin/server';
import type { FeaturesPluginSetup } from '@kbn/features-plugin/server';
import type { SpacesPluginSetup, SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { TaskManagerSetupContract } from '@kbn/task-manager-plugin/server';
import {
  EXECUTION_IDENTITY_PLUGIN_ID,
  EXECUTION_IDENTITY_PLUGIN_NAME,
  EXECUTION_IDENTITY_SAVED_OBJECT_TYPE,
  type ResolvedExecutionIdentity,
} from '../common/types';
import { registerRoutes } from './routes';
import {
  executionIdentityEncryptionParams,
  executionIdentitySavedObjectType,
} from './saved_objects/execution_identity_type';
import { ExecutionIdentityService } from './service';

interface SetupDependencies {
  encryptedSavedObjects: EncryptedSavedObjectsPluginSetup;
  features: FeaturesPluginSetup;
  spaces: SpacesPluginSetup;
  taskManager: TaskManagerSetupContract;
}

interface StartDependencies {
  encryptedSavedObjects: EncryptedSavedObjectsPluginStart;
  spaces: SpacesPluginStart;
}

export interface ExecutionIdentityPluginStart {
  getForBinding: (
    request: KibanaRequest,
    id: string
  ) => Promise<{ id: string; name: string; spaceId: string }>;
  resolve: (id: string, spaceId: string) => Promise<ResolvedExecutionIdentity>;
}

export class ExecutionIdentityPlugin
  implements Plugin<void, ExecutionIdentityPluginStart, SetupDependencies, StartDependencies>
{
  private readonly logger: Logger;
  private readonly service: ExecutionIdentityService;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
    this.service = new ExecutionIdentityService(this.logger);
  }

  public setup(
    core: CoreSetup<StartDependencies, ExecutionIdentityPluginStart>,
    plugins: SetupDependencies
  ): void {
    core.savedObjects.registerType(executionIdentitySavedObjectType);
    plugins.encryptedSavedObjects.registerType(executionIdentityEncryptionParams);
    plugins.features.registerKibanaFeature({
      id: EXECUTION_IDENTITY_PLUGIN_ID,
      name: EXECUTION_IDENTITY_PLUGIN_NAME,
      category: DEFAULT_APP_CATEGORIES.management,
      app: [EXECUTION_IDENTITY_PLUGIN_ID],
      privileges: {
        all: {
          app: [EXECUTION_IDENTITY_PLUGIN_ID],
          savedObject: { all: [EXECUTION_IDENTITY_SAVED_OBJECT_TYPE], read: [] },
          ui: ['show', 'manage', 'bind'],
        },
        read: {
          app: [EXECUTION_IDENTITY_PLUGIN_ID],
          savedObject: { all: [], read: [EXECUTION_IDENTITY_SAVED_OBJECT_TYPE] },
          ui: ['show', 'bind'],
        },
      },
    });
    plugins.taskManager.registerExecutionIdentityResolver((id, spaceId) =>
      this.service.resolve(id, spaceId)
    );

    registerRoutes(core.http.createRouter(), this.service, this.logger);
  }

  public start(core: CoreStart, plugins: StartDependencies): ExecutionIdentityPluginStart {
    this.service.setStartServices({
      core,
      encryptedSavedObjects: plugins.encryptedSavedObjects,
      spaces: plugins.spaces,
    });
    return {
      getForBinding: (request, id) => this.service.getForBinding(request, id),
      resolve: (id, spaceId) => this.service.resolve(id, spaceId),
    };
  }

  public stop(): void {}
}
