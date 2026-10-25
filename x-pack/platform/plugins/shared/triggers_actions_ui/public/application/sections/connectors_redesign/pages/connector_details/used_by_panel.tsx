/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { getRuleDetailsRoute, getTriggersActionsManagementPath } from '@kbn/rule-data-utils';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { useKibana } from '../../../../../common/lib/kibana';
import type { Connection, RuleReference, WorkflowReference } from '../../types';
import { Pill } from '../../components/pill';
import { PLACEHOLDER_TOOLTIP } from '../../translations';

interface ReferenceRowProps {
  readonly iconType: string;
  readonly name: string;
  readonly description: string;
  readonly kind: string;
  readonly href?: string;
  readonly isPlaceholder?: boolean;
}

const ReferenceRow = ({
  iconType,
  name,
  description,
  kind,
  href,
  isPlaceholder,
}: ReferenceRowProps) => {
  const { euiTheme } = useEuiTheme();
  const row = (
    <EuiFlexGroup
      gutterSize="m"
      alignItems="center"
      responsive={false}
      css={css`
        padding-block: ${euiTheme.size.s};
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiIcon type={iconType} color="primary" size="m" aria-hidden={true} />
      </EuiFlexItem>
      <EuiFlexItem css={{ minWidth: 0 }}>
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false} css={{ minWidth: 0 }}>
            <EuiText size="s">
              {href ? <EuiLink href={href}>{name}</EuiLink> : <strong>{name}</strong>}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <Pill color="neutral">{kind}</Pill>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiText size="xs" color="subdued">
          {description}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiIcon type="sortRight" color="subdued" aria-hidden={true} />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
  return isPlaceholder ? (
    <EuiToolTip content={PLACEHOLDER_TOOLTIP} display="block">
      {row}
    </EuiToolTip>
  ) : (
    row
  );
};

const WORKFLOW = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.workflow', {
  defaultMessage: 'Workflow',
});
const RULE = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.rule', {
  defaultMessage: 'Rule',
});

interface UsedByPanelProps {
  readonly connection: Connection;
  readonly rules: readonly RuleReference[];
}

export const UsedByPanel = ({ connection, rules }: UsedByPanelProps) => {
  const {
    application: { getUrlForApp },
  } = useKibana().services;
  const workflows: readonly WorkflowReference[] = connection.insights.workflows;
  const { rulesCount } = connection;

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="usedByPanel">
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="baseline" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="baseline" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <h3>
                  {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.title', {
                    defaultMessage: 'Used by',
                  })}
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.subtitle', {
                  defaultMessage: 'Workflows and rules that use this connector.',
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="l" responsive={false}>
            <EuiText size="s" color="subdued">
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.workflowCount', {
                defaultMessage: '{count, plural, one {# workflow} other {# workflows}}',
                values: { count: workflows.length },
              })}
            </EuiText>
            <EuiText size="s" color="subdued">
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.ruleCount', {
                defaultMessage: '{count, plural, one {# rule} other {# rules}}',
                values: { count: rulesCount },
              })}
            </EuiText>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="xl">
        <EuiFlexItem>
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.workflows', {
                defaultMessage: 'Workflows ({count})',
                values: { count: workflows.length },
              })}
            </strong>
          </EuiText>
          {workflows.map((workflow) => (
            <ReferenceRow
              key={workflow.id}
              iconType="branch"
              name={workflow.name}
              description={workflow.description}
              kind={WORKFLOW}
              isPlaceholder
            />
          ))}
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiText size="s">
            <strong>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.usedBy.rules', {
                defaultMessage: 'Rules ({count})',
                values: { count: rulesCount },
              })}
            </strong>
          </EuiText>
          {rules.map((rule) => (
            <ReferenceRow
              key={rule.id}
              iconType="bell"
              name={rule.name}
              description={rule.description}
              kind={RULE}
              href={getUrlForApp('management', {
                path: getTriggersActionsManagementPath(getRuleDetailsRoute(rule.id)),
              })}
            />
          ))}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
