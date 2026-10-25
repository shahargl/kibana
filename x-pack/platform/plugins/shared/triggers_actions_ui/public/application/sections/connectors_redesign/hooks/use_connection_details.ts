/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useQuery } from '@kbn/react-query';
import { fromKueryExpression } from '@kbn/es-query';
import { preconfiguredConnectorActionRefPrefix } from '@kbn/alerting-plugin/common';
import { useKibana } from '../../../../common/lib/kibana';
import { loadRulesWithKueryFilter } from '../../../lib/rule_api/rules_kuery_filter';
import { INTERNAL_BASE_ACTION_API_PATH } from '../../../constants';
import type { ActionConnector } from '../../../../types';
import { getActivityDays } from '../lib/activity';
import type { DayCounts } from '../lib/activity';
import type { Connection, RuleReference } from '../types';
import { buildConnection, useConnections } from './use_connections';

const DAY_MS = 24 * 60 * 60 * 1000;
const RULES_PREVIEW_SIZE = 5;

interface KpiResponse {
  success: number;
  failure: number;
  warning: number;
  unknown: number;
}

const escapeKql = (value: string): string => value.replace(/(["\\])/g, '\\$1');

/** Detail view of one connection: exact per-day outbound KPIs and the rules that use it. */
export const useConnectionDetails = (connectorId: string) => {
  const { http } = useKibana().services;
  const { connections, catalog, isLoading, refetch } = useConnections();
  const baseConnection = connections.find(({ connector }) => connector.id === connectorId);
  const connector: ActionConnector | undefined = baseConnection?.connector;

  const days = useMemo(() => getActivityDays(), []);

  const kpiQuery = useQuery({
    queryKey: ['connectorsRedesign', 'kpi', connectorId],
    enabled: Boolean(connector),
    refetchOnWindowFocus: false,
    queryFn: () =>
      Promise.all(
        days.map((day) =>
          http.post<KpiResponse>(
            `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_kpi`,
            {
              body: JSON.stringify({
                filter: `kibana.action.id: "${escapeKql(connectorId)}"`,
                date_start: new Date(day).toISOString(),
                date_end: new Date(day + DAY_MS).toISOString(),
              }),
            }
          )
        )
      ),
  });

  const rulesQuery = useQuery({
    queryKey: ['connectorsRedesign', 'rules', connectorId],
    enabled: Boolean(connector),
    refetchOnWindowFocus: false,
    queryFn: () =>
      loadRulesWithKueryFilter({
        http,
        page: { index: 0, size: RULES_PREVIEW_SIZE },
        ...(connector?.isPreconfigured
          ? {
              kueryNode: fromKueryExpression(
                `alert.attributes.actions:{ actionRef: "${preconfiguredConnectorActionRefPrefix}${connectorId}" }`
              ),
            }
          : { hasReference: { type: 'action', id: connectorId } }),
      }),
  });

  const connection = useMemo<Connection | undefined>(() => {
    if (!baseConnection) return undefined;
    if (!kpiQuery.data) return baseConnection;
    const outbound: DayCounts[] = kpiQuery.data.map(({ success, failure, warning, unknown }) => ({
      outbound: success + failure + warning + unknown,
      outboundFailures: failure,
    }));
    const rebuilt = buildConnection(baseConnection.connector, baseConnection.entry, outbound, days);
    return { ...rebuilt, rulesCount: rulesQuery.data?.total ?? rebuilt.rulesCount };
  }, [baseConnection, kpiQuery.data, rulesQuery.data, days]);

  const rules = useMemo<RuleReference[]>(
    () =>
      (rulesQuery.data?.data ?? []).map(({ id, name, ruleTypeId, tags }) => ({
        id,
        name,
        description: tags.length ? tags.join(', ') : ruleTypeId,
      })),
    [rulesQuery.data]
  );

  return {
    connection,
    catalog,
    rules,
    isLoading,
    isNotFound: !isLoading && !baseConnection,
    refetch,
  };
};
