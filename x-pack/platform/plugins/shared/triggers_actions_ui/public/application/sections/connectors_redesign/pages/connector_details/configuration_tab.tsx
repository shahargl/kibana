/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiButton,
  EuiCallOut,
  EuiCode,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from '@elastic/eui';
import type { EuiDescriptionListProps } from '@elastic/eui';
import { InboundIngressCredentials } from '../../../action_connector_form/inbound_ingress_credentials';
import { isInboundIngressConnector } from '../../../../lib/inbound_ingress';
import type { Connection } from '../../types';

const MAX_VALUE_LENGTH = 120;

const formatValue = (value: unknown): string => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text;
};

interface ConfigurationTabProps {
  readonly connection: Connection;
  readonly onEdit: () => void;
}

export const ConfigurationTab = ({ connection, onEdit }: ConfigurationTabProps) => {
  const { connector, entry } = connection;
  const config: Record<string, unknown> =
    'config' in connector && connector.config ? connector.config : {};

  const listItems: EuiDescriptionListProps['listItems'] = [
    {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.type', {
        defaultMessage: 'Connector type',
      }),
      description: entry?.name ?? connector.actionTypeId,
    },
    {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.id', {
        defaultMessage: 'Connector ID',
      }),
      description: <EuiCode>{connector.id}</EuiCode>,
    },
    {
      title: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.authMode', {
        defaultMessage: 'Authentication',
      }),
      description:
        connector.authMode === 'per-user'
          ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.perUser', {
              defaultMessage: 'Per-user credentials',
            })
          : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.shared', {
              defaultMessage: 'Shared credentials (stored encrypted)',
            }),
    },
    ...Object.entries(config)
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({ title: key, description: formatValue(value) })),
  ];

  return (
    <>
      {connector.isPreconfigured && (
        <>
          <EuiCallOut
            announceOnMount={false}
            size="s"
            iconType="lock"
            title={i18n.translate(
              'xpack.triggersActionsUI.connectorsRedesign.config.preconfigured',
              {
                defaultMessage:
                  'This connection is preconfigured in kibana.yml and cannot be edited here.',
              }
            )}
          />
          <EuiSpacer size="m" />
        </>
      )}
      {connector.isMissingSecrets && (
        <>
          <EuiCallOut
            announceOnMount
            size="s"
            color="warning"
            iconType="warning"
            title={i18n.translate(
              'xpack.triggersActionsUI.connectorsRedesign.config.missingSecrets',
              {
                defaultMessage: 'Credentials are missing. Edit the connection to add them again.',
              }
            )}
          />
          <EuiSpacer size="m" />
        </>
      )}
      <EuiPanel hasBorder paddingSize="l" data-test-subj="configurationPanel">
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.title', {
                  defaultMessage: 'Configuration',
                })}
              </h3>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              iconType="pencil"
              onClick={onEdit}
              isDisabled={connector.isPreconfigured}
              data-test-subj="editConfigurationButton"
            >
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.config.edit', {
                defaultMessage: 'Edit configuration',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        <EuiDescriptionList type="column" columnWidths={[1, 3]} compressed listItems={listItems} />
      </EuiPanel>
      {isInboundIngressConnector(connector) && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel hasBorder paddingSize="l">
            <InboundIngressCredentials allowRotate connector={connector} />
          </EuiPanel>
        </>
      )}
    </>
  );
};
