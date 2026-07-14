/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiPageTemplate,
  EuiSelect,
  EuiSpacer,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import type { ExecutionIdentity, ExecutionIdentityProjectType } from '../common/types';

const projectTypeOptions: Array<{ value: ExecutionIdentityProjectType; text: string }> = [
  { value: 'elasticsearch', text: 'Elasticsearch' },
  { value: 'observability', text: 'Observability' },
  { value: 'security', text: 'Security' },
  { value: 'workplaceai', text: 'Workplace AI' },
  { value: 'vectordb', text: 'Vector DB' },
];

const commaSeparatedValues = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ExecutionIdentityApp = ({ core }: { core: CoreStart }) => {
  const [identities, setIdentities] = useState<ExecutionIdentity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<ExecutionIdentityProjectType>('security');
  const [projectIds, setProjectIds] = useState('');
  const [roleNames, setRoleNames] = useState('');
  const flyoutTitleId = useGeneratedHtmlId();

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setIdentities(await core.http.get<ExecutionIdentity[]>('/internal/execution_identity'));
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [core.http]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setIsCreating(true);
    setError(undefined);
    try {
      await core.http.post('/internal/execution_identity', {
        body: JSON.stringify({
          name,
          description,
          projectAssignments: [
            {
              projectType,
              projectIds: commaSeparatedValues(projectIds),
              roleNames: commaSeparatedValues(roleNames),
            },
          ],
        }),
      });
      setShowCreate(false);
      setName('');
      setDescription('');
      setProjectIds('');
      setRoleNames('');
      await load();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setIsCreating(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await core.http.delete(`/internal/execution_identity/${encodeURIComponent(id)}`);
      await load();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  return (
    <EuiPageTemplate>
      <EuiPageTemplate.Header
        pageTitle="Service accounts"
        description="Space-scoped identities for background execution"
        rightSideItems={[
          <EuiButton key="create" fill onClick={() => setShowCreate(true)}>
            Create service account
          </EuiButton>,
        ]}
      />
      <EuiPageTemplate.Section>
        {error && (
          <>
            <EuiCallOut announceOnMount color="danger" title={error} />
            <EuiSpacer />
          </>
        )}
        <EuiBasicTable
          tableCaption="Service accounts in this space"
          items={identities}
          loading={isLoading}
          rowHeader="name"
          noItemsMessage="No service accounts in this space"
          columns={[
            { field: 'name', name: 'Name' },
            { field: 'description', name: 'Description' },
            {
              name: 'Projects',
              render: (identity: ExecutionIdentity) =>
                identity.projectAssignments
                  .flatMap((assignment) => assignment.projectIds)
                  .join(', '),
            },
            {
              name: 'Roles',
              render: (identity: ExecutionIdentity) =>
                identity.projectAssignments
                  .flatMap((assignment) => assignment.roleNames)
                  .join(', '),
            },
            { field: 'createdBy', name: 'Created by' },
            {
              name: 'Actions',
              actions: [
                {
                  name: 'Delete',
                  description: 'Delete service account',
                  type: 'icon',
                  icon: 'trash',
                  color: 'danger',
                  onClick: (identity: ExecutionIdentity) => remove(identity.id),
                },
              ],
            },
          ]}
        />
      </EuiPageTemplate.Section>

      {showCreate && (
        <EuiFlyout aria-labelledby={flyoutTitleId} onClose={() => setShowCreate(false)} size="m">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id={flyoutTitleId}>Create service account</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiForm>
              <EuiFormRow label="Name">
                <EuiFieldText value={name} onChange={(event) => setName(event.target.value)} />
              </EuiFormRow>
              <EuiFormRow label="Description">
                <EuiFieldText
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Project type">
                <EuiSelect
                  value={projectType}
                  options={projectTypeOptions}
                  onChange={(event) =>
                    setProjectType(event.target.value as ExecutionIdentityProjectType)
                  }
                />
              </EuiFormRow>
              <EuiFormRow
                label="Project IDs"
                helpText="Comma-separated origin and linked project IDs"
              >
                <EuiFieldText
                  value={projectIds}
                  onChange={(event) => setProjectIds(event.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow label="Role names" helpText="Comma-separated Kibana custom role names">
                <EuiFieldText
                  value={roleNames}
                  onChange={(event) => setRoleNames(event.target.value)}
                />
              </EuiFormRow>
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={() => setShowCreate(false)}>Cancel</EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  isLoading={isCreating}
                  disabled={
                    !name.trim() ||
                    commaSeparatedValues(projectIds).length === 0 ||
                    commaSeparatedValues(roleNames).length === 0
                  }
                  onClick={create}
                >
                  Create
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </EuiPageTemplate>
  );
};

export const renderApp = (core: CoreStart, params: ManagementAppMountParams): (() => void) => {
  ReactDOM.render(core.rendering.addContext(<ExecutionIdentityApp core={core} />), params.element);
  return () => ReactDOM.unmountComponentAtNode(params.element);
};
