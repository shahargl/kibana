/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CloudSetup } from '@kbn/cloud-plugin/public';
import type { CoreSetup, Plugin } from '@kbn/core/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import {
  EXECUTION_IDENTITY_PLUGIN_ID,
  EXECUTION_IDENTITY_PLUGIN_NAME,
  type ExecutionIdentityProjectType,
} from '../common/types';

interface SetupDependencies {
  cloud: CloudSetup;
  management: ManagementSetup;
}

const toExecutionIdentityProjectType = (
  projectType: CloudSetup['serverless']['projectType']
): ExecutionIdentityProjectType | undefined => {
  if (projectType === 'search') {
    return 'elasticsearch';
  }
  return projectType;
};

export class ExecutionIdentityPublicPlugin implements Plugin<void, void, SetupDependencies> {
  public setup(core: CoreSetup, plugins: SetupDependencies): void {
    plugins.management.sections.section.security.registerApp({
      id: EXECUTION_IDENTITY_PLUGIN_ID,
      title: EXECUTION_IDENTITY_PLUGIN_NAME,
      order: 99,
      capabilitiesId: EXECUTION_IDENTITY_PLUGIN_ID,
      mount: async (params) => {
        const [coreStart] = await core.getStartServices();
        const { renderApp } = await import('./application');
        const { projectId, projectName, projectType } = plugins.cloud.serverless;
        return renderApp(
          coreStart,
          params,
          projectId && projectType
            ? {
                id: projectId,
                name: projectName ?? 'Current project',
                type: toExecutionIdentityProjectType(projectType),
              }
            : undefined
        );
      },
    });
  }

  public start(): void {}

  public stop(): void {}
}
