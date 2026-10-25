/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiLink,
  EuiPopover,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import type { ActionConnector } from '../../../../../types';
import type { Connection } from '../../types';
import { ActivitySparkline, useDirectionColors } from '../../components/activity_sparkline';
import { ConnectorIcon } from '../../components/connector_icon';
import { AclPill, CapabilityPill, HealthPill } from '../../components/status_pills';
import { formatCompact } from '../../lib/activity';
import {
  ACTIONS_OUTBOUND,
  EVENTS_INBOUND,
  INBOUND_ONLY,
  OUTBOUND_ONLY,
  PLACEHOLDER_TOOLTIP,
} from '../../translations';

const COLUMN = {
  connection: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.connection', {
    defaultMessage: 'Connection',
  }),
  capabilities: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.capabilities', {
    defaultMessage: 'Capabilities',
  }),
  activity: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.activity', {
    defaultMessage: 'Activity · 7 days',
  }),
  activityTooltip: i18n.translate(
    'xpack.triggersActionsUI.connectorsRedesign.table.activityTooltip',
    {
      defaultMessage:
        'Actions executed through the connection and events received from it over the last 7 days.',
    }
  ),
  health: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.health', {
    defaultMessage: 'Health',
  }),
  connectedAs: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.connectedAs', {
    defaultMessage: 'Connected as',
  }),
  usedBy: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.usedBy', {
    defaultMessage: 'Used by',
  }),
  actions: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.actions', {
    defaultMessage: 'Actions',
  }),
};

const getWorkflowsLabel = (count: number) =>
  i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.usedByWorkflows', {
    defaultMessage: '{count, plural, one {# workflow} other {# workflows}} •',
    values: { count },
  });

const getRulesLabel = (count: number) =>
  i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.usedByRules', {
    defaultMessage: '{count, plural, one {# rule} other {# rules}}',
    values: { count },
  });

interface RowActionsProps {
  readonly connector: ActionConnector;
  readonly onOpen: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

const RowActions = ({ connector, onOpen, onEdit, onDelete }: RowActionsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const close = () => setIsOpen(false);
  const run = (action: () => void) => () => {
    close();
    action();
  };
  return (
    <EuiPopover
      isOpen={isOpen}
      closePopover={close}
      panelPaddingSize="none"
      anchorPosition="leftCenter"
      aria-label={COLUMN.actions}
      button={
        <EuiToolTip content={COLUMN.actions} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="ellipsis"
            color="text"
            aria-label={COLUMN.actions}
            data-test-subj={`connectionActions-${connector.id}`}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              setIsOpen((open) => !open);
            }}
          />
        </EuiToolTip>
      }
    >
      {/* Popover content is portaled, but React still bubbles its clicks to the row. */}
      <div onClick={(event) => event.stopPropagation()} role="presentation">
        <EuiContextMenuPanel
          items={[
            <EuiContextMenuItem key="open" icon="eye" onClick={run(onOpen)}>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.viewDetails', {
                defaultMessage: 'View details',
              })}
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              key="edit"
              icon="pencil"
              disabled={connector.isPreconfigured}
              onClick={run(onEdit)}
            >
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.edit', {
                defaultMessage: 'Edit connection',
              })}
            </EuiContextMenuItem>,
            <EuiContextMenuItem
              key="delete"
              icon="trash"
              disabled={connector.isPreconfigured}
              onClick={run(onDelete)}
              data-test-subj="deleteConnector"
            >
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.table.delete', {
                defaultMessage: 'Delete',
              })}
            </EuiContextMenuItem>,
          ]}
        />
      </div>
    </EuiPopover>
  );
};

const Legend = () => {
  const colors = useDirectionColors();
  const { euiTheme } = useEuiTheme();
  const item = (color: string, label: string) => (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
      <EuiFlexItem grow={false}>
        <span
          css={css`
            display: inline-block;
            width: ${euiTheme.size.s};
            height: ${euiTheme.size.s};
            border-radius: 50%;
            background: ${color};
          `}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="xs" color="subdued" css={{ whiteSpace: 'nowrap' }}>
          {label}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      {item(colors.outbound, ACTIONS_OUTBOUND)}
      {item(colors.inbound, EVENTS_INBOUND)}
    </EuiFlexGroup>
  );
};

interface ConnectionsTableProps {
  readonly connections: readonly Connection[];
  readonly isLoading: boolean;
  readonly onOpen: (connectorId: string) => void;
  readonly onEdit: (connector: ActionConnector) => void;
  readonly onDelete: (connector: ActionConnector) => void;
}

export const ConnectionsTable = ({
  connections,
  isLoading,
  onOpen,
  onEdit,
  onDelete,
}: ConnectionsTableProps) => {
  const { euiTheme } = useEuiTheme();

  const columns: Array<EuiBasicTableColumn<Connection>> = [
    {
      name: COLUMN.connection,
      width: '17%',
      render: ({ connector, entry }: Connection) => (
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <ConnectorIcon icon={entry?.icon} size="xl" />
          </EuiFlexItem>
          <EuiFlexItem css={{ minWidth: 0 }}>
            <EuiLink
              color="text"
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                onOpen(connector.id);
              }}
              data-test-subj={`edit${connector.id}`}
              css={css`
                font-weight: ${euiTheme.font.weight.semiBold};
              `}
            >
              {connector.name}
            </EuiLink>
            <EuiText size="xs" color="subdued">
              {entry?.category ?? connector.actionTypeId}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      name: COLUMN.capabilities,
      width: '14%',
      render: ({ entry }: Connection) => (
        <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
          {entry?.outbound && <CapabilityPill capability={entry.outbound.capability} />}
          {entry?.inbound && <CapabilityPill capability={entry.inbound.capability} />}
          {entry?.outbound && !entry.inbound && (
            <EuiText size="xs" color="subdued" css={{ paddingLeft: euiTheme.size.l }}>
              {OUTBOUND_ONLY}
            </EuiText>
          )}
          {entry?.inbound && !entry.outbound && (
            <EuiText size="xs" color="subdued" css={{ paddingLeft: euiTheme.size.l }}>
              {INBOUND_ONLY}
            </EuiText>
          )}
        </EuiFlexGroup>
      ),
    },
    {
      name: (
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>{COLUMN.activity}</EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiIconTip type="info" size="s" color="subdued" content={COLUMN.activityTooltip} />
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
      width: '24%',
      render: ({ daily, totals, entry }: Connection) => (
        <EuiFlexGroup direction="column" gutterSize="xs">
          <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap={false}>
            <EuiFlexItem grow={false}>
              <ActivitySparkline
                daily={daily}
                showOutbound={Boolean(entry?.outbound)}
                showInbound={Boolean(entry?.inbound)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <Legend />
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiFlexGroup gutterSize="m" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" data-test-subj="outboundTotal">
                <EuiIcon type="sortUp" size="s" color="subdued" aria-hidden={true} />{' '}
                {formatCompact(totals.outbound)}
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content={PLACEHOLDER_TOOLTIP}>
                <EuiText size="xs" tabIndex={0} data-test-subj="inboundTotal">
                  <EuiIcon type="sortDown" size="s" color="subdued" aria-hidden={true} />{' '}
                  {formatCompact(totals.inbound)}
                </EuiText>
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexGroup>
      ),
    },
    {
      name: COLUMN.health,
      width: '14%',
      render: ({ health, insights }: Connection) => (
        <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
          {health.outbound && <HealthPill direction="outbound" status={health.outbound} />}
          {health.inbound && (
            <HealthPill
              direction="inbound"
              status={health.inbound}
              isPlaceholder={insights.isPlaceholder}
            />
          )}
        </EuiFlexGroup>
      ),
    },
    {
      name: COLUMN.connectedAs,
      width: '13%',
      render: ({ insights }: Connection) => (
        <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
          <EuiText size="s">{insights.identity}</EuiText>
          <AclPill status={insights.acl.status} />
        </EuiFlexGroup>
      ),
    },
    {
      name: COLUMN.usedBy,
      width: '11%',
      render: ({ insights, rulesCount }: Connection) => (
        <EuiText size="s">
          <EuiToolTip content={PLACEHOLDER_TOOLTIP}>
            <span tabIndex={0}>{getWorkflowsLabel(insights.workflows.length)}</span>
          </EuiToolTip>
          <div>{getRulesLabel(rulesCount)}</div>
        </EuiText>
      ),
    },
    {
      name: '',
      width: '48px',
      align: 'right',
      render: ({ connector }: Connection) => (
        <RowActions
          connector={connector}
          onOpen={() => onOpen(connector.id)}
          onEdit={() => onEdit(connector)}
          onDelete={() => onDelete(connector)}
        />
      ),
    },
  ];

  return (
    <EuiBasicTable<Connection>
      tableCaption={COLUMN.connection}
      items={[...connections]}
      itemId={({ connector }) => connector.id}
      columns={columns}
      loading={isLoading}
      rowProps={({ connector }) => ({
        'data-test-subj': 'connectors-row',
        onClick: () => onOpen(connector.id),
        css: css`
          cursor: pointer;
        `,
      })}
      data-test-subj="actionsTable"
    />
  );
};
