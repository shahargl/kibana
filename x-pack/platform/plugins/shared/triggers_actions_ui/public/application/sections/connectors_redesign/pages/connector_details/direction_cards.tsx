/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { css } from '@emotion/react';
import moment from 'moment';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiIconTip,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { Connection, Direction, HealthStatus } from '../../types';
import { DirectionTile } from '../../components/connector_icon';
import { Pill } from '../../components/pill';
import { HEALTH_COLOR } from '../../components/status_pills';
import { getHealthWord, PLACEHOLDER_TOOLTIP } from '../../translations';

const LABEL = {
  operations: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.operations', {
    defaultMessage: 'Operations',
  }),
  identity: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.identity', {
    defaultMessage: 'Identity',
  }),
  credentialsHealth: i18n.translate(
    'xpack.triggersActionsUI.connectorsRedesign.details.credentialsHealth',
    { defaultMessage: 'Credentials health' }
  ),
  deliveryHealth: i18n.translate(
    'xpack.triggersActionsUI.connectorsRedesign.details.deliveryHealth',
    { defaultMessage: 'Delivery health' }
  ),
  acl: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.acl', {
    defaultMessage: 'Access control (ACL)',
  }),
};

const Row = ({ label, children }: { readonly label: string; readonly children: ReactNode }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <div
      css={css`
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: ${euiTheme.size.m};
        align-items: start;
        padding-block: ${euiTheme.size.s};
      `}
    >
      <EuiText size="s" color="subdued">
        {label}
      </EuiText>
      <div css={{ minWidth: 0 }}>{children}</div>
    </div>
  );
};

const IconValue = ({
  iconType,
  primary,
  secondary,
  italic,
}: {
  readonly iconType: string;
  readonly primary: ReactNode;
  readonly secondary?: ReactNode;
  readonly italic?: boolean;
}) => (
  <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
    <EuiFlexItem grow={false}>
      <EuiIcon type={iconType} color="subdued" aria-hidden={true} />
    </EuiFlexItem>
    <EuiFlexItem css={{ minWidth: 0 }}>
      <EuiText size="s">{italic ? <em>{primary}</em> : primary}</EuiText>
      {secondary && (
        <EuiText size="xs" color="subdued">
          {secondary}
        </EuiText>
      )}
    </EuiFlexItem>
  </EuiFlexGroup>
);

const HealthValue = ({
  status,
  detail,
  isPlaceholder,
}: {
  readonly status: HealthStatus;
  readonly detail: string;
  readonly isPlaceholder?: boolean;
}) => (
  <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
    <EuiFlexItem grow={false}>
      <Pill color={HEALTH_COLOR[status]} dot tinted={false}>
        {getHealthWord(status)}
      </Pill>
    </EuiFlexItem>
    <EuiFlexItem grow={false}>
      <EuiText size="xs" color="subdued">
        {detail}
      </EuiText>
    </EuiFlexItem>
    {isPlaceholder && (
      <EuiFlexItem grow={false}>
        <EuiIconTip type="info" size="s" color="subdued" content={PLACEHOLDER_TOOLTIP} />
      </EuiFlexItem>
    )}
  </EuiFlexGroup>
);

const CardHeader = ({
  direction,
  vendor,
  status,
}: {
  readonly direction: Direction;
  readonly vendor: string;
  readonly status: HealthStatus;
}) => (
  <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
    <EuiFlexItem grow={false}>
      <DirectionTile direction={direction} color={HEALTH_COLOR[status]} />
    </EuiFlexItem>
    <EuiFlexItem>
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {direction === 'outbound'
                ? i18n.translate(
                    'xpack.triggersActionsUI.connectorsRedesign.details.outboundCard',
                    {
                      defaultMessage: 'Outbound · Elastic → {vendor}',
                      values: { vendor },
                    }
                  )
                : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.inboundCard', {
                    defaultMessage: 'Inbound · {vendor} → Elastic',
                    values: { vendor },
                  })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <Pill color={HEALTH_COLOR[status]}>{getHealthWord(status)}</Pill>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size="s" color="subdued">
        {direction === 'outbound'
          ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.outboundCardDesc', {
              defaultMessage: 'Sends actions from Elastic to {vendor}',
              values: { vendor },
            })
          : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.inboundCardDesc', {
              defaultMessage: 'Receives events from {vendor} into Elastic',
              values: { vendor },
            })}
      </EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);

const Operations = ({ operations }: { readonly operations: readonly string[] }) => (
  <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
    {operations.map((operation) => (
      <EuiFlexItem grow={false} key={operation}>
        <Pill color="neutral">{operation}</Pill>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

export const OutboundCard = ({ connection }: { readonly connection: Connection }) => {
  const { entry, health, insights } = connection;
  if (!entry?.outbound) return null;
  const vendor = entry.vendorName;
  const status = health.outbound ?? 'unknown';
  const scopes = insights.acl.scopes.join(', ');
  const aclText =
    insights.acl.status === 'verified'
      ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.aclVerified', {
          defaultMessage: 'Verified: {scopes}',
          values: { scopes: scopes || '—' },
        })
      : insights.acl.status === 'partial'
      ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.aclPartial', {
          defaultMessage: 'Partially verified: {scopes}',
          values: { scopes: scopes || '—' },
        })
      : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.aclUnknown', {
          defaultMessage: 'Not verified yet',
        });

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="outboundCard">
      <CardHeader direction="outbound" vendor={vendor} status={status} />
      <EuiHorizontalRule margin="m" />
      <Row label={LABEL.operations}>
        <Operations operations={entry.outbound.operations} />
      </Row>
      <Row label={LABEL.identity}>
        <IconValue
          iconType="user"
          primary={insights.identity}
          secondary={insights.identityDescription}
        />
      </Row>
      <Row label={LABEL.credentialsHealth}>
        <HealthValue
          status={status}
          isPlaceholder
          detail={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.lastTested', {
            defaultMessage: 'Last tested {time}',
            values: { time: moment(insights.lastTestedAt).fromNow() },
          })}
        />
      </Row>
      <Row label={LABEL.acl}>
        <IconValue
          iconType="lock"
          italic
          primary={aclText}
          secondary={i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.details.aclScopesVerified',
            { defaultMessage: 'Scopes verified with {vendor}', values: { vendor } }
          )}
        />
      </Row>
    </EuiPanel>
  );
};

export const InboundCard = ({
  connection,
  onInspect,
}: {
  readonly connection: Connection;
  readonly onInspect: () => void;
}) => {
  const { entry, insights } = connection;
  if (!entry?.inbound || !insights.inbound) return null;
  const vendor = entry.vendorName;
  const { health, lastEventAt, sourceName, allowedSources } = insights.inbound;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="inboundCard">
      <CardHeader direction="inbound" vendor={vendor} status={health} />
      <EuiHorizontalRule margin="m" />
      <Row label={LABEL.operations}>
        <Operations operations={entry.inbound.operations} />
      </Row>
      <Row label={LABEL.identity}>
        <IconValue
          iconType="logoWebhook"
          primary={sourceName}
          secondary={i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.details.dedicatedEndpoint',
            { defaultMessage: 'Dedicated inbound endpoint (no shared credentials)' }
          )}
        />
      </Row>
      <Row label={LABEL.deliveryHealth}>
        <HealthValue
          status={health}
          isPlaceholder
          detail={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.lastEvent', {
            defaultMessage: 'Last event {time}',
            values: { time: moment(lastEventAt).fromNow() },
          })}
        />
      </Row>
      <Row label={LABEL.acl}>
        <IconValue
          iconType="lock"
          italic
          primary={i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.details.allowedSources',
            {
              defaultMessage: 'Allowed sources: {sources}',
              values: { sources: allowedSources.join(', ') },
            }
          )}
          secondary={i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.details.signatureVerified',
            { defaultMessage: 'Requests verified using {vendor} signature', values: { vendor } }
          )}
        />
      </Row>
      <EuiSpacer size="s" />
      <EuiLink onClick={onInspect} data-test-subj="inspectDeliveryLink">
        {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.inspectDelivery', {
          defaultMessage: 'Inspect delivery →',
        })}
      </EuiLink>
    </EuiPanel>
  );
};
