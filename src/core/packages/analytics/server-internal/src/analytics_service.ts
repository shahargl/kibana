/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { of } from 'rxjs';
import apm from 'elastic-apm-node';
import type { AnalyticsClient } from '@elastic/ebt/client';
import { createAnalytics } from '@elastic/ebt/client';
import { registerPerformanceMetricEventType } from '@kbn/ebt-tools';
import type { CoreContext } from '@kbn/core-base-server-internal';
import type {
  AnalyticsServiceSetup,
  AnalyticsServiceStart,
  AnalyticsServicePreboot,
} from '@kbn/core-analytics-server';

export class AnalyticsService {
  private readonly analyticsClient: AnalyticsClient;

  constructor(core: CoreContext) {
    this.analyticsClient = createAnalytics({
      isDev: core.env.mode.dev,
      logger: core.logger.get('analytics'),
      getTraceContext: () => ({
        id: apm.currentTraceIds?.['trace.id'],
      }),
    });

    this.registerBuildInfoAnalyticsContext(core);
    registerPerformanceMetricEventType(this.analyticsClient);
  }

  public preboot(): AnalyticsServicePreboot {
    return {
      optIn: this.analyticsClient.optIn,
      registerContextProvider: this.analyticsClient.registerContextProvider,
      removeContextProvider: this.analyticsClient.removeContextProvider,
      registerEventType: this.analyticsClient.registerEventType,
      registerShipper: this.analyticsClient.registerShipper,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
    };
  }

  public setup(): AnalyticsServiceSetup {
    // LAZY LOADING POC: Track registered event types to make registration idempotent
    const registeredEventTypes = new Set<string>();

    return {
      optIn: this.analyticsClient.optIn,
      registerContextProvider: this.analyticsClient.registerContextProvider,
      removeContextProvider: this.analyticsClient.removeContextProvider,
      // LAZY LOADING POC: Wrap registerEventType to skip if already registered
      registerEventType: (eventTypeOpts) => {
        if (registeredEventTypes.has(eventTypeOpts.eventType)) {
          // Already registered - skip silently for lazy loading
          return;
        }
        try {
          this.analyticsClient.registerEventType(eventTypeOpts);
          registeredEventTypes.add(eventTypeOpts.eventType);
        } catch (error) {
          // If the error is about already registered, just ignore it
          if (error instanceof Error && error.message.includes('is already registered')) {
            registeredEventTypes.add(eventTypeOpts.eventType);
            return;
          }
          throw error;
        }
      },
      registerShipper: this.analyticsClient.registerShipper,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
    };
  }

  public start(): AnalyticsServiceStart {
    return {
      optIn: this.analyticsClient.optIn,
      reportEvent: this.analyticsClient.reportEvent,
      telemetryCounter$: this.analyticsClient.telemetryCounter$,
    };
  }

  public async stop() {
    await this.analyticsClient.shutdown();
  }

  /**
   * Enriches the event with the build information.
   * @param core The core context.
   * @internal
   */
  private registerBuildInfoAnalyticsContext(core: CoreContext) {
    this.analyticsClient.registerContextProvider({
      name: 'build info',
      context$: of({
        isDev: core.env.mode.dev,
        isDistributable: core.env.packageInfo.dist,
        version: core.env.packageInfo.version,
        branch: core.env.packageInfo.branch,
        buildNum: core.env.packageInfo.buildNum,
        buildSha: core.env.packageInfo.buildSha,
      }),
      schema: {
        isDev: {
          type: 'boolean',
          _meta: { description: 'Is it running in development mode?' },
        },
        isDistributable: {
          type: 'boolean',
          _meta: { description: 'Is it running from a distributable?' },
        },
        version: { type: 'keyword', _meta: { description: 'Version of the Kibana instance.' } },
        branch: {
          type: 'keyword',
          _meta: { description: 'Branch of source running Kibana from.' },
        },
        buildNum: { type: 'long', _meta: { description: 'Build number of the Kibana instance.' } },
        buildSha: { type: 'keyword', _meta: { description: 'Build SHA of the Kibana instance.' } },
      },
    });
  }
}
