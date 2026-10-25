/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import moment from 'moment';
import { i18n } from '@kbn/i18n';
import { EuiFlexGroup, EuiFlexItem, EuiPanel, EuiSpacer, EuiText, EuiToolTip } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderMenu, AppHeaderMetadataItems, AppHeaderTab } from '@kbn/app-header';
import { useKibana } from '../../../../../common/lib/kibana';
import type { Connection, Direction, HealthStatus } from '../../types';
import type { DetailTab } from '../../constants';
import { DETAIL_TABS, ROUTE_CONNECTED } from '../../constants';
import { ConnectorIcon, DirectionTile } from '../../components/connector_icon';
import { HEALTH_COLOR } from '../../components/status_pills';
import { getHealthWord, PLACEHOLDER_TOOLTIP } from '../../translations';

const MANAGEMENT_APP_PATH = 'insightsAndAlerting/triggersActionsConnectors';

const BACK_LABEL = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.backLabel', {
  defaultMessage: 'connectors',
});

const TAB_LABELS: Record<DetailTab, string> = {
  overview: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.tab.overview', {
    defaultMessage: 'Overview',
  }),
  configuration: i18n.translate(
    'xpack.triggersActionsUI.connectorsRedesign.details.tab.configuration',
    { defaultMessage: 'Configuration' }
  ),
  activity: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.tab.activity', {
    defaultMessage: 'Activity',
  }),
  used_by: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.tab.usedBy', {
    defaultMessage: 'Used by',
  }),
};

const StatusPanel = ({
  direction,
  status,
  count,
  isPlaceholder,
}: {
  readonly direction: Direction;
  readonly status: HealthStatus;
  readonly count: number;
  readonly isPlaceholder?: boolean;
}) => {
  const color = HEALTH_COLOR[status];
  const panelColor = color === 'neutral' ? 'subdued' : color;
  const textColor = color === 'neutral' ? 'subdued' : color;
  const title =
    direction === 'outbound'
      ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.outboundStatus', {
          defaultMessage: 'Outbound actions: {status}',
          values: { status: getHealthWord(status) },
        })
      : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.inboundStatus', {
          defaultMessage: 'Inbound events: {status}',
          values: { status: getHealthWord(status) },
        });
  const detail =
    direction === 'outbound'
      ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.executed7d', {
          defaultMessage: '{count} executed (7 days)',
          values: { count: count.toLocaleString() },
        })
      : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.received7d', {
          defaultMessage: '{count} received (7 days)',
          values: { count: count.toLocaleString() },
        });

  const panel = (
    <EuiPanel
      hasBorder
      color={panelColor}
      paddingSize="m"
      data-test-subj={`statusPanel-${direction}`}
      tabIndex={isPlaceholder ? 0 : undefined}
    >
      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <DirectionTile direction={direction} color={color} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s" color={textColor}>
            <strong>{title}</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {detail}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
  return isPlaceholder ? (
    <EuiToolTip content={PLACEHOLDER_TOOLTIP} display="block">
      {panel}
    </EuiToolTip>
  ) : (
    panel
  );
};

interface DetailsHeaderProps {
  readonly connection: Connection;
  readonly tab: DetailTab;
  readonly onTabChange: (tab: DetailTab) => void;
  readonly onEdit: () => void;
  readonly onTest?: () => void;
  readonly onDelete: () => void;
}

/** Page header for a connection: app header with back link, tabs and actions, plus health summary. */
export const DetailsHeader = ({
  connection,
  tab,
  onTabChange,
  onEdit,
  onTest,
  onDelete,
}: DetailsHeaderProps) => {
  const { application } = useKibana().services;
  const { connector, entry, insights, health, totals } = connection;
  const isReadOnly = connector.isPreconfigured || connector.isSystemAction;

  const metadata = useMemo<AppHeaderMetadataItems>(
    () => [
      { type: 'text', label: entry?.vendorName ?? connector.actionTypeId },
      { type: 'text', label: insights.environment },
      {
        type: 'text',
        label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.updatedLabel', {
          defaultMessage: 'Last updated',
        }),
        value: moment(insights.updatedAt).format('MMM D, YYYY'),
      },
    ],
    [entry, connector.actionTypeId, insights.environment, insights.updatedAt]
  );

  const tabs = useMemo<AppHeaderTab[]>(
    () =>
      DETAIL_TABS.map((id) => ({
        id,
        label: TAB_LABELS[id],
        isSelected: tab === id,
        onClick: () => onTabChange(id),
        'data-test-subj': `connectionTab-${id}`,
      })),
    [tab, onTabChange]
  );

  const menu = useMemo<AppHeaderMenu>(
    () => ({
      primaryActionItem: {
        id: 'edit',
        label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.edit', {
          defaultMessage: 'Edit connector',
        }),
        iconType: 'pencil',
        testId: 'editConnectorButton',
        disableButton: isReadOnly,
        run: onEdit,
      },
      items: [
        ...(onTest
          ? [
              {
                id: 'test',
                label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.test', {
                  defaultMessage: 'Test connection',
                }),
                iconType: 'play',
                testId: 'runConnector',
                overflow: true as const,
                run: onTest,
              },
            ]
          : []),
        {
          id: 'delete',
          label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.delete', {
            defaultMessage: 'Delete connection',
          }),
          iconType: 'trash',
          testId: 'deleteConnector',
          overflow: true as const,
          isDestructive: true,
          disableButton: isReadOnly,
          run: onDelete,
        },
      ],
    }),
    [isReadOnly, onEdit, onTest, onDelete]
  );

  return (
    <>
      <AppHeader
        title={connector.name}
        back={{
          href: application.getUrlForApp('management', {
            path: `${MANAGEMENT_APP_PATH}${ROUTE_CONNECTED}`,
          }),
          label: BACK_LABEL,
        }}
        metadata={metadata}
        tabs={tabs}
        menu={menu}
        spacing="bleed"
      />
      <EuiSpacer size="l" />
      <EuiFlexGroup gutterSize="m" alignItems="stretch" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <ConnectorIcon icon={entry?.icon} size="xxl" tile="l" />
        </EuiFlexItem>
        {health.outbound && (
          <EuiFlexItem>
            <StatusPanel direction="outbound" status={health.outbound} count={totals.outbound} />
          </EuiFlexItem>
        )}
        {health.inbound && (
          <EuiFlexItem>
            <StatusPanel
              direction="inbound"
              status={health.inbound}
              count={totals.inbound}
              isPlaceholder
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};
