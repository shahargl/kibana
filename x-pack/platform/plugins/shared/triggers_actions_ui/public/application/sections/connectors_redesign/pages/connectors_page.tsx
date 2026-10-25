/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { EuiSpacer } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderMenu, AppHeaderTab } from '@kbn/app-header';
import { useKibana } from '../../../../common/lib/kibana';
import { getAlertingSectionBreadcrumb } from '../../../lib/breadcrumb';
import { getCurrentDocTitle } from '../../../lib/doc_title';
import { hasSaveActionsCapability } from '../../../lib/capabilities';
import { getDetailsPath, ROUTE_CATALOG, ROUTE_CONNECTED } from '../constants';
import { useConnections } from '../hooks/use_connections';
import type { CatalogEntry } from '../types';
import {
  ADD_CONNECTION,
  PAGE_DESCRIPTION,
  PAGE_TITLE,
  TAB_CATALOG,
  TAB_CONNECTED,
} from '../translations';
import { ConnectedTab } from './connected/connected_tab';
import { CatalogTab } from './catalog/catalog_tab';
import { ConnectFlyout } from './connect_flyout/connect_flyout';

export const ConnectorsPage = ({ history, match }: RouteComponentProps) => {
  const {
    chrome,
    setBreadcrumbs,
    docLinks,
    application: { capabilities },
  } = useKibana().services;
  const isCatalog = match.path === ROUTE_CATALOG;
  const canSave = hasSaveActionsCapability(capabilities);
  const { connections, catalog, isLoading, isLoadingActivity, refetch } = useConnections();
  const [connectEntry, setConnectEntry] = useState<CatalogEntry | null>(null);

  useEffect(() => {
    setBreadcrumbs([getAlertingSectionBreadcrumb('connectors')]);
    chrome.docTitle.change(getCurrentDocTitle('connectors'));
  }, [chrome, setBreadcrumbs]);

  const tabs = useMemo<AppHeaderTab[]>(
    () => [
      {
        id: 'connected',
        label: TAB_CONNECTED,
        isSelected: !isCatalog,
        onClick: () => history.push(ROUTE_CONNECTED),
        'data-test-subj': 'connectorsTab',
      },
      {
        id: 'catalog',
        label: TAB_CATALOG,
        isSelected: isCatalog,
        onClick: () => history.push(ROUTE_CATALOG),
        'data-test-subj': 'catalogTab',
      },
    ],
    [history, isCatalog]
  );

  const menu = useMemo<AppHeaderMenu>(
    () => ({
      primaryActionItem: canSave
        ? {
            id: 'addConnection',
            label: ADD_CONNECTION,
            iconType: 'plus',
            testId: 'createConnectorButton',
            run: () => history.push(ROUTE_CATALOG),
          }
        : undefined,
    }),
    [canSave, history]
  );

  const onConnected = useCallback(
    (connectorId: string, openTest: boolean) => {
      setConnectEntry(null);
      refetch();
      history.push({ pathname: getDetailsPath(connectorId), search: openTest ? '?test=true' : '' });
    },
    [history, refetch]
  );

  return (
    <>
      <AppHeader
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        tabs={tabs}
        menu={menu}
        docLink={docLinks.links.alerting.actionTypes}
        spacing="bleed"
      />
      <EuiSpacer size="l" />
      <div>
        {isCatalog ? (
          <CatalogTab
            entries={catalog.entries}
            isLoading={catalog.isLoading}
            selectedId={connectEntry?.id}
            canSave={canSave}
            onSetUp={setConnectEntry}
          />
        ) : (
          <ConnectedTab
            connections={connections}
            isLoading={isLoading}
            isLoadingActivity={isLoadingActivity}
            onRefresh={refetch}
            onOpen={(connectorId) => history.push(getDetailsPath(connectorId))}
            onBrowseCatalog={() => history.push(ROUTE_CATALOG)}
          />
        )}
      </div>
      {connectEntry && (
        <ConnectFlyout
          entry={connectEntry}
          onClose={() => setConnectEntry(null)}
          onConnected={onConnected}
        />
      )}
    </>
  );
};
