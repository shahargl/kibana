/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiBadge,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  type ExecutionIdentitySummary,
  getExecutionIdentityProjectIconType,
} from '../../../entities/execution_identities/model/use_execution_identities';

export const ExecutionIdentityDetails = ({ identity }: { identity: ExecutionIdentitySummary }) => {
  const roles = [
    ...new Set(identity.projectAssignments.flatMap((assignment) => assignment.roleNames)),
  ];
  return (
    <EuiPanel
      color="subdued"
      paddingSize="s"
      hasShadow={false}
      data-test-subj="workflowExecutionIdentityDetails"
    >
      <EuiFlexGroup direction="column" gutterSize="s">
        <EuiFlexItem>
          <EuiTitle size="xxs">
            <h4>
              {i18n.translate(
                'workflowsManagement.executionOverview.serviceAccountPermissionsTitle',
                {
                  defaultMessage: 'Service account permissions',
                }
              )}
            </h4>
          </EuiTitle>
          <EuiText size="s">
            <strong>{identity.name}</strong>
            {identity.description ? <p>{identity.description}</p> : null}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiDescriptionList
            compressed
            type="column"
            listItems={[
              {
                title: 'Roles',
                description:
                  roles.length > 0 ? (
                    <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                      {roles.map((role) => (
                        <EuiFlexItem key={role} grow={false}>
                          <EuiBadge color="hollow">{role}</EuiBadge>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                  ) : (
                    'None'
                  ),
              },
              {
                title: 'Projects',
                description:
                  identity.projectAssignments.length > 0 ? (
                    <EuiFlexGroup direction="column" gutterSize="xs">
                      {identity.projectAssignments.map((assignment) => (
                        <EuiFlexItem
                          key={`${assignment.projectType}:${assignment.projectIds.join(',')}`}
                        >
                          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                            <EuiFlexItem grow={false}>
                              <EuiIcon
                                type={getExecutionIdentityProjectIconType(assignment.projectType)}
                                size="s"
                                aria-hidden={true}
                              />
                            </EuiFlexItem>
                            <EuiFlexItem>
                              <EuiText size="xs">
                                <strong>{assignment.projectType}</strong>
                                {`: ${assignment.projectIds.join(', ')}`}
                              </EuiText>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiFlexItem>
                      ))}
                    </EuiFlexGroup>
                  ) : (
                    'None'
                  ),
              },
            ]}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
