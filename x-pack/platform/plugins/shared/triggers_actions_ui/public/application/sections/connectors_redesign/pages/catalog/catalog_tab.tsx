/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { CatalogEntry, CatalogFilter } from '../../types';
import { ConnectorIcon } from '../../components/connector_icon';
import { CapabilityPill } from '../../components/status_pills';

const FILTERS: ReadonlyArray<{ id: CatalogFilter; label: string }> = [
  {
    id: 'all',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.filterAll', {
      defaultMessage: 'All',
    }),
  },
  {
    id: 'actions',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.filterActions', {
      defaultMessage: 'Actions',
    }),
  },
  {
    id: 'events',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.filterEvents', {
      defaultMessage: 'Events',
    }),
  },
  {
    id: 'both',
    label: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.filterBoth', {
      defaultMessage: 'Both',
    }),
  },
];

const SET_UP = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.setUp', {
  defaultMessage: 'Set up',
});

const TWO_PATHS = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.twoPaths', {
  defaultMessage: 'Two paths, configured separately.',
});

const matchesFilter = ({ outbound, inbound }: CatalogEntry, filter: CatalogFilter): boolean => {
  switch (filter) {
    case 'actions':
      return Boolean(outbound);
    case 'events':
      return Boolean(inbound);
    case 'both':
      return Boolean(outbound && inbound);
    default:
      return true;
  }
};

const matchesSearch = (entry: CatalogEntry, search: string): boolean => {
  if (!search) return true;
  return [
    entry.name,
    entry.description,
    entry.category,
    entry.outbound?.capability.label,
    entry.inbound?.capability.label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(search.toLowerCase());
};

interface CatalogCardProps {
  readonly entry: CatalogEntry;
  readonly isSelected: boolean;
  readonly canSave: boolean;
  readonly onSetUp: () => void;
}

const CatalogCard = ({ entry, isSelected, canSave, onSetUp }: CatalogCardProps) => {
  const { euiTheme } = useEuiTheme();
  const hasBothPaths = Boolean(entry.outbound && entry.inbound);
  return (
    <EuiPanel
      hasBorder
      paddingSize="m"
      data-test-subj={`${entry.id}-card`}
      css={css`
        display: flex;
        flex-direction: column;
        height: 100%;
        ${isSelected
          ? `border-color: ${euiTheme.colors.borderStrongPrimary};
             box-shadow: 0 0 0 ${euiTheme.border.width.thin} ${euiTheme.colors.borderStrongPrimary};`
          : ''}
      `}
    >
      <EuiFlexGroup gutterSize="m" responsive={false} alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <ConnectorIcon icon={entry.icon} size="xxl" />
        </EuiFlexItem>
        <EuiFlexItem css={{ minWidth: 0 }}>
          <EuiTitle size="xs">
            <h3>{entry.vendorName}</h3>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            <p
              css={css`
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
              `}
            >
              {entry.description}
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiFlexGroup direction="column" gutterSize="xs" alignItems="flexStart">
        {entry.outbound && (
          <CapabilityPill capability={entry.outbound.capability} variant="catalog" />
        )}
        {entry.inbound && (
          <CapabilityPill capability={entry.inbound.capability} variant="catalog" />
        )}
      </EuiFlexGroup>
      <EuiFlexGroup
        gutterSize="s"
        alignItems="flexEnd"
        justifyContent="spaceBetween"
        responsive={false}
        css={css`
          flex-grow: 1;
          margin-top: ${euiTheme.size.s};
        `}
      >
        <EuiFlexItem>
          {hasBothPaths && (
            <EuiText size="xs" color="subdued">
              {TWO_PATHS}
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            size="s"
            fill={isSelected}
            color={isSelected ? 'primary' : 'text'}
            isDisabled={!canSave || !entry.isEnabled}
            onClick={onSetUp}
            data-test-subj={`setUp-${entry.id}`}
          >
            {SET_UP}
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

interface CatalogTabProps {
  readonly entries: readonly CatalogEntry[];
  readonly isLoading: boolean;
  readonly selectedId?: string;
  readonly canSave: boolean;
  readonly onSetUp: (entry: CatalogEntry) => void;
}

export const CatalogTab = ({
  entries,
  isLoading,
  selectedId,
  canSave,
  onSetUp,
}: CatalogTabProps) => {
  const { euiTheme } = useEuiTheme();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CatalogFilter>('all');

  const visible = useMemo(
    () => entries.filter((entry) => matchesFilter(entry, filter) && matchesSearch(entry, search)),
    [entries, filter, search]
  );

  return (
    <>
      <EuiFieldSearch
        fullWidth
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.search', {
          defaultMessage: 'Search services or capabilities...',
        })}
        data-test-subj="createConnectorsModalSearch"
      />
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="s" responsive={false} wrap>
        {FILTERS.map(({ id, label }) => (
          <EuiFlexItem grow={false} key={id}>
            <EuiButton
              size="s"
              minWidth={false}
              fill={filter === id}
              color={filter === id ? 'primary' : 'text'}
              onClick={() => setFilter(id)}
              aria-pressed={filter === id}
              data-test-subj={`catalogFilter-${id}`}
            >
              {label}
            </EuiButton>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiText size="s" color="subdued" data-test-subj="catalogCount">
        {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.count', {
          defaultMessage: '{count, plural, one {# connector} other {# connectors}}',
          values: { count: visible.length },
        })}
      </EuiText>
      <EuiSpacer size="s" />
      {isLoading ? (
        <EuiFlexGroup justifyContent="center">
          <EuiLoadingSpinner size="xl" />
        </EuiFlexGroup>
      ) : (
        <div
          role="list"
          css={css`
            display: grid;
            gap: ${euiTheme.size.m};
            grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          `}
        >
          {visible.map((entry) => (
            <div role="listitem" key={entry.id}>
              <CatalogCard
                entry={entry}
                isSelected={entry.id === selectedId}
                canSave={canSave}
                onSetUp={() => onSetUp(entry)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
};
