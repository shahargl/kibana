/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import {
  EuiCheckableCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { CatalogEntry, Direction, DirectionProfile } from '../../types';
import { DirectionTile } from '../../components/connector_icon';
import { getDirectionTitle } from './wizard_translations';

interface ChooseCapabilitiesStepProps {
  readonly entry: CatalogEntry;
  readonly selected: ReadonlySet<Direction>;
  readonly onToggle: (direction: Direction) => void;
}

const ACCESS_REQUIREMENTS = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.wizard.accessRequirements',
  { defaultMessage: 'Access requirements' }
);

const RequirementsPanel = ({ requirements }: { readonly requirements: readonly string[] }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiPanel hasBorder color="transparent" paddingSize="m">
      <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="key" color="subdued" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>{ACCESS_REQUIREMENTS}</strong>
            <ul
              css={css`
                margin-block: ${euiTheme.size.xs} 0;
              `}
            >
              {requirements.map((requirement, index) => (
                <li key={requirement}>
                  {requirement}
                  {index === requirements.length - 1 && (
                    <>
                      {' '}
                      <EuiIconTip
                        type="info"
                        size="s"
                        color="subdued"
                        content={i18n.translate(
                          'xpack.triggersActionsUI.connectorsRedesign.wizard.requirementsTip',
                          {
                            defaultMessage:
                              'You provide these in the next step. Elastic only requests the access listed here.',
                          }
                        )}
                      />
                    </>
                  )}
                </li>
              ))}
            </ul>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const CapabilityCard = ({
  entry,
  direction,
  profile,
  checked,
  onToggle,
}: {
  readonly entry: CatalogEntry;
  readonly direction: Direction;
  readonly profile: DirectionProfile;
  readonly checked: boolean;
  readonly onToggle: () => void;
}) => (
  <EuiCheckableCard
    id={`connect-${entry.id}-${direction}`}
    checkableType="checkbox"
    checked={checked}
    onChange={onToggle}
    data-test-subj={`capabilityCard-${direction}`}
    label={
      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <DirectionTile
            direction={direction}
            color={direction === 'outbound' ? 'success' : 'primary'}
            shape="square"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>{getDirectionTitle(direction, entry.vendorName)}</h4>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {direction === 'outbound'
              ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.outboundDesc', {
                  defaultMessage: 'Allow Elastic to {capability} in {vendor}.',
                  values: {
                    capability: profile.capability.label.toLowerCase(),
                    vendor: entry.vendorName,
                  },
                })
              : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.inboundDesc', {
                  defaultMessage: 'Allow {vendor} to send {capability} to Elastic.',
                  values: {
                    capability: profile.capability.label.replace(/^receive\s+/i, '').toLowerCase(),
                    vendor: entry.vendorName,
                  },
                })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    }
  >
    <RequirementsPanel requirements={profile.requirements} />
  </EuiCheckableCard>
);

export const ChooseCapabilitiesStep = ({
  entry,
  selected,
  onToggle,
}: ChooseCapabilitiesStepProps) => (
  <>
    <EuiTitle size="xs">
      <h3>
        {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.chooseTitle', {
          defaultMessage: 'Select the capabilities you want to configure',
        })}
      </h3>
    </EuiTitle>
    <EuiSpacer size="m" />
    {entry.outbound && (
      <>
        <CapabilityCard
          entry={entry}
          direction="outbound"
          profile={entry.outbound}
          checked={selected.has('outbound')}
          onToggle={() => onToggle('outbound')}
        />
        <EuiSpacer size="m" />
      </>
    )}
    {entry.inbound && (
      <>
        <CapabilityCard
          entry={entry}
          direction="inbound"
          profile={entry.inbound}
          checked={selected.has('inbound')}
          onToggle={() => onToggle('inbound')}
        />
        <EuiSpacer size="m" />
      </>
    )}
    <EuiPanel color="subdued" paddingSize="m">
      <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="info" color="subdued" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.pathsTitle', {
                defaultMessage: 'Configured connection paths',
              })}
            </strong>
          </EuiText>
          <EuiText size="s" color="subdued">
            {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.wizard.pathsBody', {
              defaultMessage:
                'Each capability is configured separately with its own authentication and settings. You can enable one or both, and add the other later.',
            })}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  </>
);
