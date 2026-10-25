/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiAvatar,
  EuiBadge,
  EuiCallOut,
  EuiComboBox,
  EuiFieldPassword,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHorizontalRule,
  EuiIcon,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { CatalogEntry, Direction } from '../../types';
import { Pill } from '../../components/pill';
import {
  ADD_SOURCE,
  ALLOWED_SOURCES,
  ALLOWED_SOURCES_HELP,
  PREVIEW_BADGE,
  PREVIEW_NOT_SAVED,
  TAB_INBOUND,
  TAB_OUTBOUND,
} from './wizard_translations';

export interface InboundDraft {
  readonly signingKey: string;
  readonly allowedSources: readonly string[];
}

export interface CurrentUserSummary {
  readonly name: string;
  readonly email?: string;
}

interface ConfigureAccessStepProps {
  readonly entry: CatalogEntry;
  readonly selected: ReadonlySet<Direction>;
  readonly activeTab: Direction;
  readonly onTabChange: (tab: Direction) => void;
  /** The real connector form; rendered once and kept mounted while the user switches tabs. */
  readonly connectorForm: ReactNode;
  /** Whether the connector form belongs to the inbound tab (inbound-only types). */
  readonly formDirection: Direction;
  /** True when inbound delivery is backed by the actions plugin (e.g. `.inboundWebhook`). */
  readonly hasRealInbound: boolean;
  readonly isPerUser: boolean;
  readonly inboundDraft: InboundDraft;
  readonly onInboundDraftChange: (draft: InboundDraft) => void;
  readonly currentUser?: CurrentUserSummary;
}

const SectionTitle = ({ title, description }: { title: string; description: string }) => (
  <>
    <EuiTitle size="xs">
      <h3>{title}</h3>
    </EuiTitle>
    <EuiText size="s" color="subdued">
      {description}
    </EuiText>
    <EuiSpacer size="m" />
  </>
);

const AllowedSourcesField = ({
  value,
  onChange,
}: {
  readonly value: readonly string[];
  readonly onChange: (value: string[]) => void;
}) => (
  <EuiFormRow
    fullWidth
    label={
      <span>
        {ALLOWED_SOURCES}{' '}
        <EuiIconTip type="info" size="s" color="subdued" content={ALLOWED_SOURCES_HELP} />
      </span>
    }
    helpText={ALLOWED_SOURCES_HELP}
  >
    <EuiComboBox
      fullWidth
      noSuggestions
      placeholder={ADD_SOURCE}
      selectedOptions={value.map((label) => ({ label }))}
      onCreateOption={(source) => onChange([...value, source.trim()].filter(Boolean))}
      onChange={(options) => onChange(options.map(({ label }) => label))}
      data-test-subj="allowedSourcesInput"
    />
  </EuiFormRow>
);

const PermissionReview = ({ entry }: { readonly entry: CatalogEntry }) => (
  <EuiPanel hasBorder paddingSize="m" data-test-subj="permissionReview">
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="document" color="subdued" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.permissionReview', {
              defaultMessage: 'Permission review',
            })}
          </h4>
        </EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="m" />
    <EuiText size="xs">
      <strong>
        {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.requestedAccess', {
          defaultMessage: 'Requested access',
        })}
      </strong>
    </EuiText>
    <EuiSpacer size="s" />
    <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
      {(entry.outbound?.scopes.length ? entry.outbound.scopes : ['api']).map((scope) => (
        <EuiFlexItem grow={false} key={scope}>
          <Pill color="neutral">{scope}</Pill>
        </EuiFlexItem>
      ))}
    </EuiFlexGroup>
    <EuiSpacer size="m" />
    <Pill color="warning" dot tinted={false}>
      {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.notVerified', {
        defaultMessage: 'Not yet verified',
      })}
    </Pill>
    <EuiSpacer size="s" />
    <EuiText size="xs" color="subdued">
      {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.verifyExplain', {
        defaultMessage:
          'Elastic will check read access; write access requires a safe test or first execution.',
      })}
    </EuiText>
  </EuiPanel>
);

const ConnectionDetails = ({
  entry,
  isPerUser,
  currentUser,
}: {
  readonly entry: CatalogEntry;
  readonly isPerUser: boolean;
  readonly currentUser?: CurrentUserSummary;
}) => (
  <EuiPanel hasBorder paddingSize="m" data-test-subj="connectionDetails">
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="user" color="subdued" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiTitle size="xxs">
          <h4>
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.connectionDetails', {
              defaultMessage: 'Connection details',
            })}
          </h4>
        </EuiTitle>
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="m" />
    <EuiText size="xs" color="subdued">
      {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.configuredBy', {
        defaultMessage: 'Configured by',
      })}
    </EuiText>
    <EuiSpacer size="xs" />
    {currentUser && (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiAvatar name={currentUser.name} size="m" />
        </EuiFlexItem>
        <EuiFlexItem css={{ minWidth: 0 }}>
          <EuiText size="s">
            <strong>{currentUser.name}</strong>
          </EuiText>
          {currentUser.email && (
            <EuiText size="xs" color="subdued">
              {currentUser.email}
            </EuiText>
          )}
          <EuiText size="xs" color="subdued">
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.justNow', {
              defaultMessage: 'Configured just now',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    )}
    <EuiHorizontalRule margin="m" />
    <EuiText size="xs" color="subdued">
      {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.connectedAs', {
        defaultMessage: 'Connected as',
      })}
    </EuiText>
    <EuiSpacer size="xs" />
    <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiIcon type="gear" size="l" color="subdued" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size="s">
          <strong>
            {isPerUser
              ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.perUser', {
                  defaultMessage: 'Each user (per-user credentials)',
                })
              : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.serviceAccount', {
                  defaultMessage: 'Service account (runtime)',
                })}
          </strong>
        </EuiText>
        <EuiText size="xs" color="subdued">
          {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.connectedAsDesc', {
            defaultMessage: 'Used by Elastic to make API requests to {vendor}.',
            values: { vendor: entry.vendorName },
          })}
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  </EuiPanel>
);

const InboundPreviewFields = ({
  entry,
  draft,
  onChange,
}: {
  readonly entry: CatalogEntry;
  readonly draft: InboundDraft;
  readonly onChange: (draft: InboundDraft) => void;
}) => (
  <>
    <EuiCallOut announceOnMount={false} size="s" iconType="flask" title={PREVIEW_NOT_SAVED} />
    <EuiSpacer size="m" />
    <EuiFormRow
      fullWidth
      label={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.signingKey', {
        defaultMessage: 'Webhook signing key',
      })}
      helpText={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.signingKeyHelp', {
        defaultMessage: 'Copy the signing secret from the {vendor} webhook settings.',
        values: { vendor: entry.vendorName },
      })}
    >
      <EuiFieldPassword
        fullWidth
        type="dual"
        value={draft.signingKey}
        onChange={(event) => onChange({ ...draft, signingKey: event.target.value })}
        data-test-subj="webhookSigningKeyInput"
      />
    </EuiFormRow>
    <EuiFormRow
      fullWidth
      label={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.endpoint', {
        defaultMessage: 'Elastic endpoint',
      })}
      helpText={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.endpointHelp', {
        defaultMessage: 'Paste this URL into {vendor} after you save.',
        values: { vendor: entry.vendorName },
      })}
    >
      <EuiFieldText
        fullWidth
        readOnly
        placeholder={i18n.translate(
          'xpack.triggersActionsUI.connectorsRedesign.wizard.endpointPlaceholder',
          { defaultMessage: 'Generated when you save' }
        )}
        prepend={<EuiIcon type="link" aria-hidden={true} />}
      />
    </EuiFormRow>
    <AllowedSourcesField
      value={draft.allowedSources}
      onChange={(allowedSources) => onChange({ ...draft, allowedSources })}
    />
  </>
);

export const ConfigureAccessStep = ({
  entry,
  selected,
  activeTab,
  onTabChange,
  connectorForm,
  formDirection,
  hasRealInbound,
  isPerUser,
  inboundDraft,
  onInboundDraftChange,
  currentUser,
}: ConfigureAccessStepProps) => {
  const tabs = (['outbound', 'inbound'] as const).filter((direction) => selected.has(direction));
  const vendor = entry.vendorName;

  const outboundPanel = (
    <EuiPanel hasBorder paddingSize="l">
      <SectionTitle
        title={i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.apiAccess', {
          defaultMessage: '{vendor} API access',
          values: { vendor },
        })}
        description={i18n.translate(
          'xpack.triggersActionsUI.connectorsRedesign.wizard.apiAccessDesc',
          { defaultMessage: 'Provide a service account with the minimum required permissions.' }
        )}
      />
      {formDirection === 'outbound' && connectorForm}
    </EuiPanel>
  );

  const inboundPanel = (
    <EuiPanel hasBorder paddingSize="l">
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.webhookDelivery', {
                defaultMessage: '{vendor} webhook delivery',
                values: { vendor },
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        {!hasRealInbound && (
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{PREVIEW_BADGE}</EuiBadge>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiText size="s" color="subdued">
        {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.webhookDeliveryDesc', {
          defaultMessage: 'Receive events from {vendor} through a dedicated Elastic endpoint.',
          values: { vendor },
        })}
      </EuiText>
      <EuiSpacer size="m" />
      {formDirection === 'inbound' && connectorForm}
      {hasRealInbound ? (
        <EuiCallOut
          announceOnMount={false}
          size="s"
          iconType="info"
          title={i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.wizard.realInboundToken',
            {
              defaultMessage:
                'The webhook URL and ingest token are generated when you save. The token is shown only once.',
            }
          )}
        />
      ) : (
        <InboundPreviewFields entry={entry} draft={inboundDraft} onChange={onInboundDraftChange} />
      )}
    </EuiPanel>
  );

  return (
    <>
      {tabs.length > 1 && (
        <>
          <EuiTabs size="s">
            {tabs.map((direction) => (
              <EuiTab
                key={direction}
                isSelected={activeTab === direction}
                onClick={() => onTabChange(direction)}
                data-test-subj={`configureTab-${direction}`}
              >
                {direction === 'outbound' ? TAB_OUTBOUND : TAB_INBOUND}
              </EuiTab>
            ))}
          </EuiTabs>
          <EuiSpacer size="m" />
        </>
      )}
      <EuiFlexGroup gutterSize="m" alignItems="flexStart">
        <EuiFlexItem grow={3} css={{ minWidth: 0 }}>
          {selected.has('outbound') && <div hidden={activeTab !== 'outbound'}>{outboundPanel}</div>}
          {selected.has('inbound') && <div hidden={activeTab !== 'inbound'}>{inboundPanel}</div>}
        </EuiFlexItem>
        <EuiFlexItem grow={2}>
          {activeTab === 'outbound' && (
            <>
              <PermissionReview entry={entry} />
              <EuiSpacer size="m" />
            </>
          )}
          <ConnectionDetails entry={entry} isPerUser={isPerUser} currentUser={currentUser} />
        </EuiFlexItem>
      </EuiFlexGroup>
      {activeTab === 'outbound' && selected.has('inbound') && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel hasBorder paddingSize="m" data-test-subj="inboundSummaryPanel">
            <EuiFlexGroup gutterSize="m" alignItems="flexStart">
              <EuiFlexItem>
                <EuiFlexGroup gutterSize="m" alignItems="flexStart" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiIcon type="logoWebhook" size="l" aria-hidden={true} />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiTitle size="xxs">
                      <h4>
                        {i18n.translate(
                          'xpack.triggersActionsUI.connectorsRedesign.wizard.inboundWebhooks',
                          { defaultMessage: 'Inbound events (webhooks)' }
                        )}
                      </h4>
                    </EuiTitle>
                    <EuiText size="xs" color="subdued">
                      {i18n.translate(
                        'xpack.triggersActionsUI.connectorsRedesign.wizard.inboundWebhooksDesc',
                        {
                          defaultMessage:
                            'Webhook signing key and endpoint configured in next section.',
                        }
                      )}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
              {!hasRealInbound && (
                <EuiFlexItem>
                  <AllowedSourcesField
                    value={inboundDraft.allowedSources}
                    onChange={(allowedSources) =>
                      onInboundDraftChange({ ...inboundDraft, allowedSources })
                    }
                  />
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </EuiPanel>
        </>
      )}
    </>
  );
};
