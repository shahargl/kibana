/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { useKibana } from '../../../../../common/lib/kibana';
import type { Connection, DirectionFilter, HealthFilter, SortOption } from '../../types';
import { SelectFilter } from '../../components/select_filter';
import { useConnectionManagement } from '../../components/use_connection_management';
import { ConnectionsTable } from './connections_table';

const DIRECTION_OPTIONS: ReadonlyArray<{ value: DirectionFilter; label: string }> = [
  {
    value: 'all',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.all', {
      defaultMessage: 'All',
    }),
  },
  {
    value: 'outbound',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.outbound', {
      defaultMessage: 'Outbound',
    }),
  },
  {
    value: 'inbound',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.inbound', {
      defaultMessage: 'Inbound',
    }),
  },
  {
    value: 'both',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.both', {
      defaultMessage: 'Both directions',
    }),
  },
];

const HEALTH_OPTIONS: ReadonlyArray<{ value: HealthFilter; label: string }> = [
  { value: 'all', label: DIRECTION_OPTIONS[0].label },
  {
    value: 'healthy',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.healthy', {
      defaultMessage: 'Healthy',
    }),
  },
  {
    value: 'attention',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.attention', {
      defaultMessage: 'Needs attention',
    }),
  },
];

const SORT_OPTIONS: ReadonlyArray<{ value: SortOption; label: string }> = [
  {
    value: 'name_asc',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.sort.nameAsc', {
      defaultMessage: 'Name A–Z',
    }),
  },
  {
    value: 'name_desc',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.sort.nameDesc', {
      defaultMessage: 'Name Z–A',
    }),
  },
  {
    value: 'activity_desc',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.sort.activity', {
      defaultMessage: 'Most active',
    }),
  },
];

const matchesDirection = ({ entry }: Connection, filter: DirectionFilter): boolean => {
  switch (filter) {
    case 'outbound':
      return Boolean(entry?.outbound);
    case 'inbound':
      return Boolean(entry?.inbound);
    case 'both':
      return Boolean(entry?.outbound && entry?.inbound);
    default:
      return true;
  }
};

const needsAttention = ({ health }: Connection): boolean =>
  [health.outbound, health.inbound].some((status) => status === 'delayed' || status === 'failed');

const matchesHealth = (connection: Connection, filter: HealthFilter): boolean => {
  if (filter === 'all') return true;
  return filter === 'attention' ? needsAttention(connection) : !needsAttention(connection);
};

const matchesSearch = ({ connector, entry }: Connection, search: string): boolean => {
  if (!search) return true;
  const haystack = [
    connector.name,
    entry?.name,
    entry?.category,
    entry?.outbound?.capability.label,
    entry?.inbound?.capability.label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
};

const compare = (sort: SortOption) => (a: Connection, b: Connection) => {
  if (sort === 'activity_desc') {
    return b.totals.outbound + b.totals.inbound - (a.totals.outbound + a.totals.inbound);
  }
  const byName = a.connector.name.localeCompare(b.connector.name);
  return sort === 'name_desc' ? -byName : byName;
};

interface ConnectedTabProps {
  readonly connections: readonly Connection[];
  readonly isLoading: boolean;
  readonly isLoadingActivity: boolean;
  readonly onRefresh: () => void;
  readonly onOpen: (connectorId: string) => void;
  readonly onBrowseCatalog: () => void;
}

export const ConnectedTab = ({
  connections,
  isLoading,
  isLoadingActivity,
  onRefresh,
  onOpen,
  onBrowseCatalog,
}: ConnectedTabProps) => {
  const { docLinks } = useKibana().services;
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [health, setHealth] = useState<HealthFilter>('all');
  const [sort, setSort] = useState<SortOption>('name_asc');
  const { openEdit, requestDelete, elements } = useConnectionManagement({ onChanged: onRefresh });

  const visible = useMemo(
    () =>
      connections
        .filter(
          (connection) =>
            matchesSearch(connection, search) &&
            matchesDirection(connection, direction) &&
            matchesHealth(connection, health)
        )
        .sort(compare(sort)),
    [connections, search, direction, health, sort]
  );

  if (!isLoading && connections.length === 0) {
    return (
      <EuiEmptyPrompt
        iconType="plugs"
        data-test-subj="createFirstConnectorEmptyPrompt"
        title={
          <h2>
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.empty.title', {
              defaultMessage: 'Connect your first service',
            })}
          </h2>
        }
        body={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.empty.body', {
          defaultMessage:
            'Connections let Elastic take actions in third-party tools and receive their events.',
        })}
        actions={
          <EuiButton fill onClick={onBrowseCatalog} data-test-subj="createFirstActionButton">
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.empty.cta', {
              defaultMessage: 'Explore catalog',
            })}
          </EuiButton>
        }
      />
    );
  }

  return (
    <>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={5} css={{ minWidth: 240 }}>
          <EuiFieldSearch
            fullWidth
            compressed
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={i18n.translate(
              'xpack.triggersActionsUI.connectorsRedesign.search.placeholder',
              { defaultMessage: 'Search connections...' }
            )}
            data-test-subj="connectionsSearch"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SelectFilter
            label={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.direction', {
              defaultMessage: 'Direction',
            })}
            value={direction}
            options={DIRECTION_OPTIONS}
            onChange={setDirection}
            data-test-subj="directionFilter"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SelectFilter
            label={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.health', {
              defaultMessage: 'Health',
            })}
            value={health}
            options={HEALTH_OPTIONS}
            onChange={setHealth}
            data-test-subj="healthFilter"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SelectFilter
            label={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.filter.sortBy', {
              defaultMessage: 'Sort by',
            })}
            value={sort}
            options={SORT_OPTIONS}
            onChange={setSort}
            data-test-subj="sortFilter"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          <EuiText size="s" textAlign="right" data-test-subj="connectionsCount">
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.count', {
              defaultMessage: '{count, plural, one {# connection} other {# connections}}',
              values: { count: visible.length },
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiPanel hasBorder paddingSize="none">
        <ConnectionsTable
          connections={visible}
          isLoading={isLoading || isLoadingActivity}
          onOpen={onOpen}
          onEdit={(connector) => openEdit(connector)}
          onDelete={requestDelete}
        />
      </EuiPanel>
      <EuiSpacer size="l" />
      <EuiPanel color="primary" hasBorder paddingSize="m" data-test-subj="activityExplainer">
        <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="info" color="primary" size="m" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>
                {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.explainer.title', {
                  defaultMessage:
                    'Activity shows events received and actions executed through each connection, not connector tests.',
                })}
              </strong>
            </EuiText>
            <EuiText size="s" color="subdued">
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.explainer.body', {
                defaultMessage:
                  'Use this data to understand real usage, detect anomalies, and ensure your integrations are healthy.',
              })}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiLink href={docLinks.links.alerting.actionTypes} target="_blank" external>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.explainer.learnMore', {
                defaultMessage: 'Learn more',
              })}
            </EuiLink>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      {elements}
    </>
  );
};
