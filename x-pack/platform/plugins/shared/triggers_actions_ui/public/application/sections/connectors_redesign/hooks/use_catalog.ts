/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { useQuery } from '@kbn/react-query';
import { ACTION_TYPE_SOURCES } from '@kbn/actions-types';
import { shouldHideWorkflowsOnlyConnector } from '@kbn/alerts-ui-shared/src/common/utils/action_type_model_utils';
import { useKibana } from '../../../../common/lib/kibana';
import { loadActionTypes } from '../../../lib/action_connector_api';
import { getConnectorIcon } from '../../action_connector_form/action_type_menu';
import type { ActionType, ActionTypeRegistryContract } from '../../../../types';
import type { CatalogEntry } from '../types';
import { getTypeProfile, getVendorName } from '../lib/capabilities';

export const CATALOG_QUERY_KEY = ['connectorsRedesign', 'catalog'];

const toCatalogEntry = (
  actionType: ActionType,
  actionTypeRegistry: ActionTypeRegistryContract
): CatalogEntry => {
  const isSpec = actionType.source === ACTION_TYPE_SOURCES.spec;
  const model = actionTypeRegistry.has(actionType.id)
    ? actionTypeRegistry.get(actionType.id)
    : undefined;
  const { category, outbound, inbound } = getTypeProfile(
    actionType.id,
    actionType.name,
    actionType.supportedFeatureIds
  );

  return {
    actionType,
    id: actionType.id,
    name: actionType.name,
    vendorName: getVendorName(actionType.name),
    description: (isSpec ? actionType.description : model?.selectMessage) ?? '',
    category,
    icon: isSpec ? getConnectorIcon(actionType.id) : model?.iconClass ?? 'plugs',
    outbound,
    inbound,
    isEnabled: actionType.enabled,
  };
};

/** Connector types that can be created from the UI, keyed and sorted by name. */
export const useCatalog = () => {
  const {
    http,
    actionTypeRegistry,
    uiSettings,
    notifications: { toasts },
  } = useKibana().services;

  const { data: actionTypes = [], isLoading } = useQuery({
    queryKey: CATALOG_QUERY_KEY,
    queryFn: () => loadActionTypes({ http }),
    refetchOnWindowFocus: false,
    onError: () => {
      toasts.addDanger(
        i18n.translate('xpack.triggersActionsUI.connectorsRedesign.catalog.loadError', {
          defaultMessage: 'Unable to load connector types',
        })
      );
    },
  });

  return useMemo(() => {
    const entries = actionTypes
      .filter((actionType) => {
        if (actionType.isSystemActionType || actionType.isDeprecated) return false;
        if (!actionType.enabledInConfig) return false;
        if (actionType.source === ACTION_TYPE_SOURCES.spec) {
          return !shouldHideWorkflowsOnlyConnector(actionType.supportedFeatureIds, uiSettings);
        }
        if (!actionTypeRegistry.has(actionType.id)) return false;
        return !actionTypeRegistry.get(actionType.id).getHideInUi?.(actionTypes);
      })
      .map((actionType) => toCatalogEntry(actionType, actionTypeRegistry))
      .sort((a, b) => a.name.localeCompare(b.name));

    const byId = new Map<string, CatalogEntry>(
      actionTypes.map((actionType) => [
        actionType.id,
        toCatalogEntry(actionType, actionTypeRegistry),
      ])
    );

    return { entries, byId, isLoading };
  }, [actionTypes, actionTypeRegistry, uiSettings, isLoading]);
};
