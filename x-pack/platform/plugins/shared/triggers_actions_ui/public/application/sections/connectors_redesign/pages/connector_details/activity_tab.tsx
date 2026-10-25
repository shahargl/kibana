/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import moment from 'moment';
import { i18n } from '@kbn/i18n';
import { useQuery } from '@kbn/react-query';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiBasicTable, EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { IExecutionLog } from '@kbn/actions-plugin/common';
import { INTERNAL_BASE_ACTION_API_PATH } from '@kbn/actions-plugin/common';
import { useKibana } from '../../../../../common/lib/kibana';
import type { Connection } from '../../types';
import { getActivityWindowStart } from '../../lib/activity';
import { Pill } from '../../components/pill';
import { ActivityChart } from './activity_chart';

const RECENT_EXECUTIONS = 25;

const escapeKql = (value: string): string => value.replace(/(["\\])/g, '\\$1');

const STATUS_COLOR: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  success: 'success',
  failure: 'danger',
  warning: 'warning',
};

const columns: Array<EuiBasicTableColumn<IExecutionLog>> = [
  {
    field: 'timestamp',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.timestamp', {
      defaultMessage: 'Timestamp',
    }),
    width: '200px',
    render: (timestamp: string) => moment(timestamp).format('MMM D, YYYY @ HH:mm:ss'),
  },
  {
    field: 'status',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.status', {
      defaultMessage: 'Status',
    }),
    width: '120px',
    render: (status: string) => (
      <Pill color={STATUS_COLOR[status] ?? 'neutral'} dot tinted={false}>
        {status || '—'}
      </Pill>
    ),
  },
  {
    field: 'source',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.source', {
      defaultMessage: 'Source',
    }),
    width: '140px',
  },
  {
    field: 'duration_ms',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.duration', {
      defaultMessage: 'Duration',
    }),
    width: '100px',
    render: (duration: number) => `${Math.round(duration)} ms`,
  },
  {
    field: 'message',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.message', {
      defaultMessage: 'Message',
    }),
    truncateText: true,
  },
];

export const ActivityTab = ({ connection }: { readonly connection: Connection }) => {
  const { http } = useKibana().services;
  const { connector, entry } = connection;

  const { data, isLoading } = useQuery({
    queryKey: ['connectorsRedesign', 'recentExecutions', connector.id],
    refetchOnWindowFocus: false,
    enabled: Boolean(entry?.outbound),
    queryFn: () =>
      http.post<{ total: number; data: IExecutionLog[] }>(
        `${INTERNAL_BASE_ACTION_API_PATH}/_global_connector_execution_logs`,
        {
          body: JSON.stringify({
            date_start: getActivityWindowStart(),
            filter: `kibana.action.id: "${escapeKql(connector.id)}"`,
            per_page: RECENT_EXECUTIONS,
            page: 1,
            sort: JSON.stringify([{ timestamp: { order: 'desc' } }]),
          }),
        }
      ),
  });

  return (
    <>
      <ActivityChart connection={connection} height={240} />
      {entry?.outbound && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel hasBorder paddingSize="l" data-test-subj="recentExecutionsPanel">
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.recent', {
                  defaultMessage: 'Recent outbound executions',
                })}
              </h3>
            </EuiTitle>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.activity.recentDesc', {
                defaultMessage: 'Actions executed through this connection, newest first.',
              })}
            </EuiText>
            <EuiSpacer size="m" />
            <EuiBasicTable<IExecutionLog>
              tableCaption={i18n.translate(
                'xpack.triggersActionsUI.connectorsRedesign.activity.recent',
                { defaultMessage: 'Recent outbound executions' }
              )}
              items={data?.data ?? []}
              columns={columns}
              loading={isLoading}
              noItemsMessage={i18n.translate(
                'xpack.triggersActionsUI.connectorsRedesign.activity.none',
                { defaultMessage: 'No executions in the last 7 days.' }
              )}
            />
          </EuiPanel>
        </>
      )}
    </>
  );
};
