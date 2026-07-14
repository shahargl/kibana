/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreSetup, Plugin } from '@kbn/core/public';
import type { ManagementSetup } from '@kbn/management-plugin/public';
import { EXECUTION_IDENTITY_PLUGIN_ID, EXECUTION_IDENTITY_PLUGIN_NAME } from '../common/types';

interface SetupDependencies {
  management: ManagementSetup;
}

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
        return renderApp(coreStart, params);
      },
    });
  }

  public start(): void {}

  public stop(): void {}
}
