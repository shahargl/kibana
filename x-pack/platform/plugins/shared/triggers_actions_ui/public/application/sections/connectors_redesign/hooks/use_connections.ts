/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import type { HttpSetup } from '@kbn/core/public';
import { useQuery } from '@kbn/react-query';
import type { IExecutionLogResult } from '@kbn/actions-plugin/common';
import { INTERNAL_BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
import { useKibana } from '../../../../common/lib/kibana';
import { loadAllActions } from '../../../lib/action_connector_api';
import { ACTIVITY_LOG_PAGE_SIZE, MAX_ACTIVITY_LOG_PAGES } from '../constants';
import type { ExecutionSample } from '../lib/activity';
import {
  bucketExecutions,
  getActivityDays,
  getActivityWindowStart,
  getOutboundHealth,
  mergeDaily,
  sumDaily,
} from '../lib/activity';
import { getPlaceholderInsights } from '../lib/placeholder_insights';
import type { CatalogEntry, Connection } from '../types';
import { useCatalog } from './use_catalog';

export const CONNECTIONS_QUERY_KEY = ['connectorsRedesign', 'connections'];
export const ACTIVITY_QUERY_KEY = ['connectorsRedesign', 'activity'];

/** Pages through the global execution log for the activity window (capped). */
const loadRecentExecutions = async (http: HttpSetup): Promise<ExecutionSample[]> => {
  const dateStart = getActivityWindowStart();
  const samples: ExecutionSample[] = [];
  for (let page = 1; page <= MAX_ACTIVITY_LOG_PAGES; page++) {
    const { data, total } = await http.post<Pick<IExecutionLogResult, 'data' | 'total'>>(
      `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_logs`,
      {
        body: JSON.stringify({
          date_start: dateStart,
          per_page: ACTIVITY_LOG_PAGE_SIZE,
          page,
          sort: JSON.stringify([{ timestamp: { order: 'desc' } }]),
        }),
      }
    );
    for (const { connector_id: connectorId, timestamp, status } of data) {
      samples.push({ connectorId, timestamp, status });
    }
    if (data.length < ACTIVITY_LOG_PAGE_SIZE || samples.length >= total) break;
  }
  return samples;
};

export const buildConnection = (
  connector: Connection['connector'],
  entry: CatalogEntry | undefined,
  outbound: Parameters<typeof mergeDaily>[1],
  days: readonly number[]
): Connection => {
  const insights = getPlaceholderInsights(connector, entry);
  const daily = mergeDaily(days, entry?.outbound ? outbound : undefined, insights.inboundDaily);
  return {
    connector,
    entry,
    daily,
    totals: sumDaily(daily),
    health: {
      outbound: entry?.outbound ? getOutboundHealth(daily, connector.isMissingSecrets) : undefined,
      inbound: insights.inbound?.health,
    },
    insights,
    rulesCount: connector.referencedByCount ?? 0,
  };
};

/** User-visible connections with real outbound activity and placeholder insights. */
export const useConnections = () => {
  const {
    http,
    notifications: { toasts },
  } = useKibana().services;
  const catalog = useCatalog();

  const connectorsQuery = useQuery({
    queryKey: CONNECTIONS_QUERY_KEY,
    queryFn: () => loadAllActions({ http }),
    refetchOnWindowFocus: false,
    onError: () => {
      toasts.addDanger(
        i18n.translate('xpack.triggersActionsUI.connectorsRedesign.connections.loadError', {
          defaultMessage: 'Unable to load connectors',
        })
      );
    },
  });

  const activityQuery = useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => loadRecentExecutions(http),
    refetchOnWindowFocus: false,
  });

  const connections = useMemo<Connection[]>(() => {
    const days = getActivityDays();
    const buckets = bucketExecutions(activityQuery.data ?? [], days);
    return (connectorsQuery.data ?? [])
      .filter((connector) => !connector.isSystemAction)
      .map((connector) =>
        buildConnection(
          connector,
          catalog.byId.get(connector.actionTypeId),
          buckets.get(connector.id),
          days
        )
      );
  }, [connectorsQuery.data, activityQuery.data, catalog.byId]);

  return {
    connections,
    catalog,
    isLoading: connectorsQuery.isLoading || catalog.isLoading,
    isLoadingActivity: activityQuery.isLoading,
    refetch: async () => {
      await Promise.all([connectorsQuery.refetch(), activityQuery.refetch()]);
    },
  };
};
