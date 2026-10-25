/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiEmptyPrompt,
  EuiFlexGrid,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
} from '@elastic/eui';
import { useKibana } from '../../../../../common/lib/kibana';
import { getAlertingSectionBreadcrumb } from '../../../../lib/breadcrumb';
import { getCurrentDocTitle } from '../../../../lib/doc_title';
import { EditConnectorTabs } from '../../../../../types';
import { getDetailsPath, ROUTE_CONNECTED } from '../../constants';
import type { DetailTab } from '../../constants';
import { useConnectionDetails } from '../../hooks/use_connection_details';
import { useConnectionManagement } from '../../components/use_connection_management';
import { DetailsHeader } from './details_header';
import { ActivityChart } from './activity_chart';
import { InboundCard, OutboundCard } from './direction_cards';
import { UsedByPanel } from './used_by_panel';
import { ConfigurationTab } from './configuration_tab';
import { ActivityTab } from './activity_tab';

type DetailsRouteProps = RouteComponentProps<{ connectorId: string; tab?: DetailTab }>;

export const ConnectorDetailsPage = ({ history, location, match }: DetailsRouteProps) => {
  const { connectorId, tab = 'overview' } = match.params;
  const { chrome, setBreadcrumbs } = useKibana().services;
  const { connection, rules, isLoading, isNotFound, refetch } = useConnectionDetails(connectorId);
  const { openEdit, requestDelete, elements } = useConnectionManagement({
    onChanged: refetch,
    onDeleted: () => history.push(ROUTE_CONNECTED),
  });
  const connector = connection?.connector;
  const connectorName = connector?.name;
  const goToTab = useCallback(
    (next: DetailTab) => history.push(getDetailsPath(connectorId, next)),
    [history, connectorId]
  );

  useEffect(() => {
    setBreadcrumbs([
      getAlertingSectionBreadcrumb('connectors', true),
      ...(connectorName ? [{ text: connectorName }] : []),
    ]);
    const sectionTitle = getCurrentDocTitle('connectors');
    chrome.docTitle.change(connectorName ? [connectorName, sectionTitle] : sectionTitle);
  }, [chrome, setBreadcrumbs, connectorName]);

  const shouldOpenTest = new URLSearchParams(location.search).get('test') === 'true';
  useEffect(() => {
    if (!shouldOpenTest || !connector) return;
    openEdit(connector, EditConnectorTabs.Test);
    history.replace({ pathname: location.pathname, search: '' });
  }, [shouldOpenTest, connector, openEdit, history, location.pathname]);

  if (isLoading && !connection) {
    return <EuiLoadingSpinner size="xl" />;
  }

  if (isNotFound || !connection || !connector) {
    return (
      <EuiEmptyPrompt
        iconType="linkSlash"
        data-test-subj="connectionNotFound"
        title={
          <h2>
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.notFound', {
              defaultMessage: 'Connection not found',
            })}
          </h2>
        }
        body={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.notFoundBody', {
          defaultMessage: 'It may have been deleted, or you may not have access to it.',
        })}
        actions={
          <EuiButton onClick={() => history.push(ROUTE_CONNECTED)}>
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.back', {
              defaultMessage: 'Back to connectors',
            })}
          </EuiButton>
        }
      />
    );
  }

  const hasOutbound = Boolean(connection.entry?.outbound);
  const hasInbound = Boolean(connection.health.inbound);

  const renderTab = () => {
    switch (tab) {
      case 'configuration':
        return (
          <ConfigurationTab
            connection={connection}
            onEdit={() => openEdit(connector, EditConnectorTabs.Configuration)}
          />
        );
      case 'activity':
        return <ActivityTab connection={connection} />;
      case 'used_by':
        return <UsedByPanel connection={connection} rules={rules} />;
      default:
        return (
          <>
            <ActivityChart connection={connection} onViewActivity={() => goToTab('activity')} />
            <EuiSpacer size="l" />
            <EuiFlexGrid columns={hasOutbound && hasInbound ? 2 : 1} gutterSize="l">
              {hasOutbound && (
                <EuiFlexItem>
                  <OutboundCard connection={connection} />
                </EuiFlexItem>
              )}
              {hasInbound && (
                <EuiFlexItem>
                  <InboundCard connection={connection} onInspect={() => goToTab('activity')} />
                </EuiFlexItem>
              )}
            </EuiFlexGrid>
            <EuiSpacer size="l" />
            <UsedByPanel connection={connection} rules={rules} />
          </>
        );
    }
  };

  return (
    <div data-test-subj="connectionDetailsPage">
      <DetailsHeader
        connection={connection}
        tab={tab}
        onTabChange={goToTab}
        onEdit={() => openEdit(connector, EditConnectorTabs.Configuration)}
        onTest={hasOutbound ? () => openEdit(connector, EditConnectorTabs.Test) : undefined}
        onDelete={() => requestDelete(connector)}
      />
      <EuiSpacer size="l" />
      {renderTab()}
      {elements}
    </div>
  );
};
