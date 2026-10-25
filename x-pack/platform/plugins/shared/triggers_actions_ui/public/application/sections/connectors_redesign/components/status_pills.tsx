/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiIconTip, EuiToolTip } from '@elastic/eui';
import type { AclStatus, Capability, Direction, HealthStatus } from '../types';
import { getAclLabel, getHealthLabel, PLACEHOLDER_TOOLTIP } from '../translations';
import type { PillColor } from './pill';
import { Pill } from './pill';

const CHECK_FAILED_TOOLTIP = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.health.failedTooltip',
  {
    defaultMessage:
      'Recent executions failed or credentials are missing. Open the connection to review errors.',
  }
);

export const DIRECTION_ICON: Record<Direction, string> = {
  outbound: 'sortUp',
  inbound: 'sortDown',
};

export const HEALTH_COLOR: Record<HealthStatus, PillColor> = {
  healthy: 'success',
  delayed: 'warning',
  failed: 'danger',
  unknown: 'neutral',
};

const ACL_COLOR: Record<AclStatus, PillColor> = {
  verified: 'success',
  partial: 'warning',
  unknown: 'neutral',
};

const ACL_ICON: Record<AclStatus, string> = {
  verified: 'checkCircleFill',
  partial: 'warningFill',
  unknown: 'question',
};

interface CapabilityPillProps {
  readonly capability: Capability;
  /** Catalog cards use the long label and direction colors; the table stays neutral. */
  readonly variant?: 'table' | 'catalog';
}

export const CapabilityPill = ({ capability, variant = 'table' }: CapabilityPillProps) => {
  const isCatalog = variant === 'catalog';
  return (
    <Pill
      color={capability.direction === 'outbound' ? 'success' : 'primary'}
      tinted={isCatalog}
      iconType={DIRECTION_ICON[capability.direction]}
      data-test-subj={`capabilityPill-${capability.direction}`}
    >
      {isCatalog ? capability.label : capability.shortLabel}
    </Pill>
  );
};

interface HealthPillProps {
  readonly direction: Direction;
  readonly status: HealthStatus;
  readonly isPlaceholder?: boolean;
}

export const HealthPill = ({ direction, status, isPlaceholder }: HealthPillProps) => {
  const pill = (
    <Pill color={HEALTH_COLOR[status]} dot data-test-subj={`healthPill-${direction}-${status}`}>
      {getHealthLabel(direction, status)}
      {status === 'failed' && (
        <>
          {' '}
          <EuiIconTip type="info" size="s" color="danger" content={CHECK_FAILED_TOOLTIP} />
        </>
      )}
    </Pill>
  );
  return isPlaceholder ? <EuiToolTip content={PLACEHOLDER_TOOLTIP}>{pill}</EuiToolTip> : pill;
};

export const AclPill = ({ status }: { readonly status: AclStatus }) => (
  <EuiToolTip content={PLACEHOLDER_TOOLTIP}>
    <Pill
      color={ACL_COLOR[status]}
      iconType={ACL_ICON[status]}
      data-test-subj={`aclPill-${status}`}
    >
      {getAclLabel(status)}
    </Pill>
  </EuiToolTip>
);
