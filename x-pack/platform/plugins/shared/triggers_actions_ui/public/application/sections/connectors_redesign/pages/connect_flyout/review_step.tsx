/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiCallOut,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { ActionConnector } from '../../../../../types';
import { InboundIngressCredentials } from '../../../action_connector_form/inbound_ingress_credentials';
import type { CatalogEntry, Direction } from '../../types';
import { DirectionTile } from '../../components/connector_icon';
import type { InboundDraft } from './configure_access_step';
import { getDirectionTitle, PREVIEW_BADGE } from './wizard_translations';

interface ReviewStepProps {
  readonly entry: CatalogEntry;
  readonly selected: ReadonlySet<Direction>;
  readonly connectionName?: string;
  readonly hasRealInbound: boolean;
  readonly inboundDraft: InboundDraft;
  readonly isTestable: boolean;
  readonly createError?: { title: string; message: string };
  /** Set once an inbound-capable connector is saved; its ingest token is shown only here. */
  readonly createdInboundConnector?: ActionConnector;
}

const NOT_SET = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.review.notSet', {
  defaultMessage: 'Not set',
});

export const ReviewStep = ({
  entry,
  selected,
  connectionName,
  hasRealInbound,
  inboundDraft,
  isTestable,
  createError,
  createdInboundConnector,
}: ReviewStepProps) => {
  if (createdInboundConnector) {
    return (
      <>
        <EuiCallOut
          announceOnMount
          color="success"
          iconType="check"
          title={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.review.saved', {
            defaultMessage: 'Connection saved. Copy the ingest token now; it is shown only once.',
          })}
        />
        <EuiSpacer size="m" />
        <InboundIngressCredentials allowRotate connector={createdInboundConnector} />
      </>
    );
  }

  return (
    <>
      <EuiTitle size="xs">
        <h3>
          {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.review.title', {
            defaultMessage: 'Review and save',
          })}
        </h3>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        {isTestable
          ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.review.testableDesc', {
              defaultMessage:
                'Save the connection, or save and run a test action to verify outbound access.',
            })
          : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.review.desc', {
              defaultMessage: 'Save the connection to enable the selected paths.',
            })}
      </EuiText>
      <EuiSpacer size="m" />
      {createError && (
        <>
          <EuiCallOut
            announceOnMount
            color="danger"
            iconType="error"
            size="s"
            title={createError.title}
            data-test-subj="create-connector-api-error"
          >
            <p>{createError.message}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}
      {(['outbound', 'inbound'] as const)
        .filter((direction) => selected.has(direction))
        .map((direction) => (
          <React.Fragment key={direction}>
            <EuiPanel hasBorder paddingSize="m" data-test-subj={`reviewPanel-${direction}`}>
              <EuiFlexGroup gutterSize="m" alignItems="flexStart" responsive={false}>
                <EuiFlexItem grow={false}>
                  <DirectionTile
                    direction={direction}
                    color={direction === 'outbound' ? 'success' : 'primary'}
                  />
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiTitle size="xxs">
                    <h4>{getDirectionTitle(direction, entry.vendorName)}</h4>
                  </EuiTitle>
                  <EuiSpacer size="s" />
                  <EuiDescriptionList
                    compressed
                    type="column"
                    columnWidths={[1, 2]}
                    listItems={
                      direction === 'outbound'
                        ? [
                            {
                              title: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.name',
                                { defaultMessage: 'Name' }
                              ),
                              description: connectionName || NOT_SET,
                            },
                            {
                              title: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.operations',
                                { defaultMessage: 'Operations' }
                              ),
                              description: entry.outbound?.operations.join(', ') || NOT_SET,
                            },
                            {
                              title: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.scopes',
                                { defaultMessage: 'Requested access' }
                              ),
                              description: entry.outbound?.scopes.join(', ') || NOT_SET,
                            },
                          ]
                        : [
                            {
                              title: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.endpoint',
                                { defaultMessage: 'Endpoint' }
                              ),
                              description: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.endpointValue',
                                { defaultMessage: 'Generated when you save' }
                              ),
                            },
                            {
                              title: i18n.translate(
                                'xpack.triggersActionsUI.connectorsRedesign.review.allowedSources',
                                { defaultMessage: 'Allowed sources' }
                              ),
                              description: hasRealInbound
                                ? i18n.translate(
                                    'xpack.triggersActionsUI.connectorsRedesign.review.tokenAuth',
                                    { defaultMessage: 'Any sender with the ingest token' }
                                  )
                                : inboundDraft.allowedSources.join(', ') ||
                                  `${NOT_SET} (${PREVIEW_BADGE})`,
                            },
                          ]
                    }
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
            <EuiSpacer size="m" />
          </React.Fragment>
        ))}
    </>
  );
};
