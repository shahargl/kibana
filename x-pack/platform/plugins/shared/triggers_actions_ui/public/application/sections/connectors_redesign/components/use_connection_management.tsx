/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../../../../common/lib/kibana';
import { deleteActions } from '../../../lib/action_connector_api';
import { DeleteModalConfirmation } from '../../../components/delete_modal_confirmation';
import { EditConnectorFlyout } from '../../action_connector_form/edit_connector_flyout';
import type { ActionConnector } from '../../../../types';
import { EditConnectorTabs } from '../../../../types';

interface UseConnectionManagementOptions {
  readonly onChanged: () => void;
  readonly onDeleted?: (connectorId: string) => void;
}

/** Edit and delete flows shared by the connections table and the detail page. */
export const useConnectionManagement = ({
  onChanged,
  onDeleted,
}: UseConnectionManagementOptions) => {
  const { actionTypeRegistry } = useKibana().services;
  const [editing, setEditing] = useState<{ connector: ActionConnector; tab: EditConnectorTabs }>();
  const [deleting, setDeleting] = useState<ActionConnector>();

  const openEdit = useCallback(
    (connector: ActionConnector, tab: EditConnectorTabs = EditConnectorTabs.Configuration) =>
      setEditing({ connector, tab }),
    []
  );

  const requestDelete = useCallback((connector: ActionConnector) => setDeleting(connector), []);

  const elements = (
    <>
      {editing && (
        <EditConnectorFlyout
          key={`${editing.connector.id}:${editing.tab}`}
          connector={editing.connector}
          tab={editing.tab}
          actionTypeRegistry={actionTypeRegistry}
          onClose={() => {
            setEditing(undefined);
            onChanged();
          }}
          onConnectorUpdated={(connector) => {
            setEditing({ connector, tab: editing.tab });
            onChanged();
          }}
        />
      )}
      <DeleteModalConfirmation
        idsToDelete={deleting ? [deleting.id] : []}
        apiDeleteCall={deleteActions}
        onDeleted={([deletedId]) => {
          setDeleting(undefined);
          onChanged();
          if (deletedId) onDeleted?.(deletedId);
        }}
        onErrors={() => {
          setDeleting(undefined);
          onChanged();
        }}
        onCancel={() => setDeleting(undefined)}
        singleTitle={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.delete.single', {
          defaultMessage: 'connection',
        })}
        multipleTitle={i18n.translate(
          'xpack.triggersActionsUI.connectorsRedesign.delete.multiple',
          {
            defaultMessage: 'connections',
          }
        )}
        showWarningText={(deleting?.referencedByCount ?? 0) > 0}
        warningText={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.delete.inUse', {
          defaultMessage: 'This connection is currently used by rules.',
        })}
        setIsLoadingState={() => {}}
      />
    </>
  );

  return { openEdit, requestDelete, elements };
};
