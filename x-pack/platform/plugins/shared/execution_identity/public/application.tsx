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
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiCallOut,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiIcon,
  EuiIconTip,
  EuiPageTemplate,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import type { CoreStart } from '@kbn/core/public';
import type { ManagementAppMountParams } from '@kbn/management-plugin/public';
import type {
  ExecutionIdentity,
  ExecutionIdentityAssignableRole,
  ExecutionIdentityProjectAssignment,
  ExecutionIdentityProjectType,
} from '../common/types';

export interface CurrentProject {
  id: string;
  name: string;
  type?: ExecutionIdentityProjectType;
}

interface CpsProject {
  _id: string;
  _alias: string;
  _type: string;
}

interface ProjectTagsResponse {
  origin: Record<string, CpsProject>;
  linked_projects: Record<string, CpsProject>;
}

type AccessScope = 'single-project' | 'cross-project';

const accessScopeOptions = [
  {
    id: 'single-project',
    label: 'Single project',
    toolTipContent: 'Use this service account only in the current project',
  },
  {
    id: 'cross-project',
    label: 'Cross-project search',
    toolTipContent: 'Use this service account in the current and selected linked projects',
  },
];

const projectIconTypes: Record<ExecutionIdentityProjectType, string> = {
  elasticsearch: 'logoElasticsearch',
  observability: 'logoObservability',
  security: 'logoSecurity',
  workplaceai: 'logoElasticsearch',
  vectordb: 'logoElasticsearch',
};

const toProjectType = (projectType: string): ExecutionIdentityProjectType | undefined => {
  if (projectType === 'search') {
    return 'elasticsearch';
  }
  if (
    projectType === 'elasticsearch' ||
    projectType === 'observability' ||
    projectType === 'security' ||
    projectType === 'workplaceai' ||
    projectType === 'vectordb'
  ) {
    return projectType;
  }
};

const buildProjectAssignments = (
  currentProject: CurrentProject,
  linkedProjects: CpsProject[],
  roleNames: string[]
): ExecutionIdentityProjectAssignment[] => {
  const projectsByType = new Map<ExecutionIdentityProjectType, string[]>();
  const addProject = (projectType: ExecutionIdentityProjectType, projectId: string) => {
    projectsByType.set(projectType, [...(projectsByType.get(projectType) ?? []), projectId]);
  };

  if (!currentProject.type) {
    return [];
  }
  addProject(currentProject.type, currentProject.id);
  linkedProjects.forEach((project) => {
    const projectType = toProjectType(project._type);
    if (projectType) {
      addProject(projectType, project._id);
    }
  });

  return [...projectsByType.entries()].map(([projectType, projectIds]) => ({
    projectType,
    projectIds,
    roleNames,
  }));
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ExecutionIdentityApp = ({
  core,
  currentProject,
}: {
  core: CoreStart;
  currentProject?: CurrentProject;
}) => {
  const [identities, setIdentities] = useState<ExecutionIdentity[]>([]);
  const [roles, setRoles] = useState<ExecutionIdentityAssignableRole[]>([]);
  const [linkedProjects, setLinkedProjects] = useState<CpsProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingIdentity, setEditingIdentity] = useState<ExecutionIdentity>();
  const [error, setError] = useState<string>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRoleNames, setSelectedRoleNames] = useState<string[]>([]);
  const [delegateToAdditionalRoles, setDelegateToAdditionalRoles] = useState(false);
  const [allowedCallerRoleNames, setAllowedCallerRoleNames] = useState<string[]>([]);
  const [selectedLinkedProjectIds, setSelectedLinkedProjectIds] = useState<string[]>([]);
  const [accessScope, setAccessScope] = useState<AccessScope>('single-project');
  const flyoutTitleId = useGeneratedHtmlId();
  const selectedCustomRoleNames = selectedRoleNames.filter(
    (roleName) => roles.find(({ name: candidate }) => candidate === roleName)?.kind === 'custom'
  );
  const hasCustomIdentityRole = selectedCustomRoleNames.length > 0;

  const closeFlyout = () => {
    setShowCreate(false);
    setEditingIdentity(undefined);
    setName('');
    setDescription('');
    setSelectedRoleNames([]);
    setDelegateToAdditionalRoles(false);
    setAllowedCallerRoleNames([]);
    setSelectedLinkedProjectIds([]);
    setAccessScope('single-project');
  };

  const openCreateFlyout = () => {
    closeFlyout();
    setShowCreate(true);
  };

  const openEditFlyout = (identity: ExecutionIdentity) => {
    const projectIds = identity.projectAssignments.flatMap((assignment) => assignment.projectIds);
    const linkedProjectIds = projectIds.filter((projectId) => projectId !== currentProject?.id);
    setEditingIdentity(identity);
    setName(identity.name);
    setDescription(identity.description);
    setSelectedRoleNames([
      ...new Set(identity.projectAssignments.flatMap((assignment) => assignment.roleNames)),
    ]);
    const allowedRoleNames = [
      ...new Set(identity.allowedProjectAssignments.flatMap((assignment) => assignment.roleNames)),
    ];
    setAllowedCallerRoleNames(allowedRoleNames);
    setDelegateToAdditionalRoles(allowedRoleNames.length > 0);
    setSelectedLinkedProjectIds(linkedProjectIds);
    setAccessScope(linkedProjectIds.length > 0 ? 'cross-project' : 'single-project');
    setShowCreate(true);
  };

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [loadedIdentities, projects] = await Promise.all([
        core.http.get<ExecutionIdentity[]>('/internal/execution_identity'),
        core.http.post<ProjectTagsResponse>('/internal/cps/projects_tags', {
          body: JSON.stringify({ project_routing: '_alias:*' }),
        }),
      ]);
      setIdentities(loadedIdentities);
      setLinkedProjects(
        Object.values(projects.linked_projects).sort((first, second) =>
          first._alias.localeCompare(second._alias)
        )
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [core.http]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!currentProject?.type) {
      setRoles([]);
      return;
    }

    const selectedLinkedProjects =
      accessScope === 'cross-project'
        ? linkedProjects.filter((project) => selectedLinkedProjectIds.includes(project._id))
        : [];
    const assignments = buildProjectAssignments(currentProject, selectedLinkedProjects, []);

    Promise.all(
      assignments.map((assignment) =>
        core.http.get<ExecutionIdentityAssignableRole[]>('/internal/execution_identity/roles', {
          query: {
            projectType: assignment.projectType,
            projectIds: assignment.projectIds.join(','),
          },
        })
      )
    )
      .then((roleSets) => {
        const [firstRoleSet = [], ...remainingRoleSets] = roleSets;
        const commonRoles = firstRoleSet.filter((role) =>
          remainingRoleSets.every((set) => set.some(({ name: roleName }) => roleName === role.name))
        );
        setRoles(commonRoles);
        const commonRoleNames = new Set(commonRoles.map(({ name: roleName }) => roleName));
        setSelectedRoleNames((selected) =>
          selected.filter((roleName) => commonRoleNames.has(roleName))
        );
      })
      .catch((rolesError) => setError(errorMessage(rolesError)));
  }, [accessScope, core.http, currentProject, linkedProjects, selectedLinkedProjectIds]);

  useEffect(() => {
    if (hasCustomIdentityRole) {
      setAccessScope('single-project');
      setSelectedLinkedProjectIds([]);
    }
  }, [hasCustomIdentityRole]);

  const save = async () => {
    if (!currentProject) {
      setError('Current Serverless project information is unavailable');
      return;
    }
    setIsCreating(true);
    setError(undefined);
    try {
      const selectedLinkedProjects = linkedProjects.filter((project) =>
        selectedLinkedProjectIds.includes(project._id)
      );
      const body = JSON.stringify({
        name,
        description,
        projectAssignments: buildProjectAssignments(
          currentProject,
          selectedLinkedProjects,
          selectedRoleNames
        ),
        allowedProjectAssignments:
          hasCustomIdentityRole && delegateToAdditionalRoles
            ? buildProjectAssignments(currentProject, [], allowedCallerRoleNames)
            : [],
        allowedUserIds: [],
      });
      if (editingIdentity) {
        await core.http.put(
          `/internal/execution_identity/${encodeURIComponent(editingIdentity.id)}`,
          { body }
        );
      } else {
        await core.http.post('/internal/execution_identity', { body });
      }
      closeFlyout();
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError));
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

  const getProjectLabel = (projectId: string): string => {
    if (projectId === currentProject?.id) {
      return currentProject.name;
    }
    return linkedProjects.find((project) => project._id === projectId)?._alias ?? projectId;
  };

  return (
    <EuiPageTemplate>
      <EuiPageTemplate.Header
        pageTitle="Service accounts"
        description="Space-scoped identities for background execution"
        rightSideItems={[
          <EuiButton key="create" fill onClick={openCreateFlyout}>
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
              render: (identity: ExecutionIdentity) => (
                <EuiFlexGroup direction="column" gutterSize="xs">
                  {identity.projectAssignments.flatMap((assignment) =>
                    assignment.projectIds.map((projectId) => (
                      <EuiFlexItem key={`${assignment.projectType}:${projectId}`}>
                        <EuiToolTip content={projectId}>
                          <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                            <EuiFlexItem grow={false}>
                              <EuiIcon
                                type={projectIconTypes[assignment.projectType]}
                                size="s"
                                aria-hidden={true}
                              />
                            </EuiFlexItem>
                            <EuiFlexItem>
                              <EuiText size="xs">{getProjectLabel(projectId)}</EuiText>
                            </EuiFlexItem>
                          </EuiFlexGroup>
                        </EuiToolTip>
                      </EuiFlexItem>
                    ))
                  )}
                </EuiFlexGroup>
              ),
            },
            {
              name: 'Roles',
              render: (identity: ExecutionIdentity) => (
                <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                  {[
                    ...new Set(
                      identity.projectAssignments.flatMap((assignment) => assignment.roleNames)
                    ),
                  ].map((roleName) => (
                    <EuiFlexItem key={roleName} grow={false}>
                      <EuiBadge color="hollow">{roleName}</EuiBadge>
                    </EuiFlexItem>
                  ))}
                </EuiFlexGroup>
              ),
            },
            {
              name: 'Who can run',
              render: (identity: ExecutionIdentity) => {
                const allowedRoles = [
                  ...new Set(
                    identity.allowedProjectAssignments.flatMap((assignment) => assignment.roleNames)
                  ),
                ];
                if (allowedRoles.length > 0) {
                  return `Roles: ${allowedRoles.join(', ')}, plus organization admins`;
                }
                const identityRoles = identity.projectAssignments.flatMap(
                  (assignment) => assignment.roleNames
                );
                const customRoles = identityRoles.filter(
                  (roleName) =>
                    roles.find(({ name: candidate }) => candidate === roleName)?.kind === 'custom'
                );
                return customRoles.length > 0
                  ? `Holders of ${customRoles.join(', ')}, plus organization admins`
                  : 'Automatically determined by UIAM role containment';
              },
            },
            {
              name: 'Created by',
              render: (identity: ExecutionIdentity) =>
                identity.createdByDisplayName ?? identity.createdBy,
            },
            {
              name: 'Actions',
              actions: [
                {
                  name: 'Edit',
                  description: 'Edit service account',
                  type: 'icon',
                  icon: 'pencil',
                  onClick: openEditFlyout,
                },
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
        <EuiFlyout aria-labelledby={flyoutTitleId} onClose={closeFlyout} size="m">
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size="m">
              <h2 id={flyoutTitleId}>
                {editingIdentity ? 'Edit service account' : 'Create service account'}
              </h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <EuiForm>
              {!currentProject?.type && (
                <>
                  <EuiCallOut
                    announceOnMount
                    color="danger"
                    title="Current Serverless project information is unavailable"
                  />
                  <EuiSpacer />
                </>
              )}
              <EuiFormRow label="Name">
                <EuiFieldText value={name} onChange={(event) => setName(event.target.value)} />
              </EuiFormRow>
              <EuiFormRow label="Description">
                <EuiFieldText
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </EuiFormRow>
              <EuiFormRow
                label="Roles"
                helpText="Built-in roles come from UIAM's catalog and hierarchy. Custom roles come from the current project's Elasticsearch role catalog and are available to project admins or by exact assignment."
              >
                <EuiComboBox
                  options={roles.map((role) => ({ label: role.name, value: role.name }))}
                  selectedOptions={selectedRoleNames.map((roleName) => ({
                    label: roleName,
                    value: roleName,
                  }))}
                  renderOption={(option) => {
                    const kind = roles.find(
                      ({ name: roleName }) => roleName === option.label
                    )?.kind;
                    return (
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <EuiBadge color={kind === 'custom' ? 'accent' : 'hollow'}>
                            {kind === 'custom' ? 'Custom' : 'Built-in'}
                          </EuiBadge>
                        </EuiFlexItem>
                        <EuiFlexItem>{option.label}</EuiFlexItem>
                      </EuiFlexGroup>
                    );
                  }}
                  onChange={(selectedOptions: Array<EuiComboBoxOptionOption<string>>) =>
                    setSelectedRoleNames(selectedOptions.map((option) => option.label))
                  }
                  placeholder="Select one or more roles"
                  fullWidth
                />
              </EuiFormRow>
              {hasCustomIdentityRole ? (
                <>
                  <EuiFormRow
                    label="Execution delegation"
                    helpText={`By default, only organization administrators and principals that already hold ${selectedCustomRoleNames.join(
                      ', '
                    )} can use this identity.`}
                  >
                    <EuiSwitch
                      label="Allow principals with additional project roles"
                      checked={delegateToAdditionalRoles}
                      onChange={(event) => {
                        setDelegateToAdditionalRoles(event.target.checked);
                        if (!event.target.checked) {
                          setAllowedCallerRoleNames([]);
                        }
                      }}
                    />
                  </EuiFormRow>
                  {delegateToAdditionalRoles && (
                    <EuiFormRow
                      label="Roles allowed to use this identity"
                      helpText="A user or service-account API key must cover all selected roles on the current project to switch to this identity."
                      isInvalid={allowedCallerRoleNames.length === 0}
                      error={
                        allowedCallerRoleNames.length === 0
                          ? 'Select at least one caller role or disable delegation.'
                          : undefined
                      }
                    >
                      <EuiComboBox
                        isInvalid={allowedCallerRoleNames.length === 0}
                        options={roles
                          .filter(({ name: roleName }) => !selectedRoleNames.includes(roleName))
                          .map(({ name: roleName, kind }) => ({
                            label: roleName,
                            value: roleName,
                            append: (
                              <EuiBadge color={kind === 'custom' ? 'accent' : 'hollow'}>
                                {kind === 'custom' ? 'Custom' : 'Built-in'}
                              </EuiBadge>
                            ),
                          }))}
                        selectedOptions={allowedCallerRoleNames.map((roleName) => ({
                          label: roleName,
                          value: roleName,
                        }))}
                        onChange={(selectedOptions: EuiComboBoxOptionOption<string>[]) =>
                          setAllowedCallerRoleNames(
                            selectedOptions.flatMap(({ value }) => (value ? [value] : []))
                          )
                        }
                        placeholder="Select caller roles"
                        fullWidth
                      />
                    </EuiFormRow>
                  )}
                  <EuiText color="subdued" size="xs">
                    Delegated roles can exercise every permission of this identity through
                    workflows. Changing this policy affects new bindings and identity switches;
                    already scheduled workflows continue to run in this PoC.
                  </EuiText>
                </>
              ) : (
                <EuiText color="subdued" size="xs">
                  UIAM automatically permits only organization administrators and principals whose
                  current roles cover this identity. No additional delegation policy is needed.
                </EuiText>
              )}
              <EuiSpacer size="m" />
              <EuiFormRow
                label="Execution scope"
                helpText={
                  accessScope === 'single-project'
                    ? 'The service account can access only the current project.'
                    : 'The service account can access the current project and selected linked projects.'
                }
              >
                <EuiButtonGroup
                  legend="Select service account execution scope"
                  options={accessScopeOptions.map((option) =>
                    option.id === 'cross-project' && hasCustomIdentityRole
                      ? {
                          ...option,
                          isDisabled: true,
                          toolTipContent:
                            'Custom roles are resolved by one Elasticsearch project and cannot be used with cross-project search.',
                        }
                      : option
                  )}
                  idSelected={accessScope}
                  onChange={(optionId) => {
                    const nextScope = optionId as AccessScope;
                    setAccessScope(nextScope);
                    if (nextScope === 'single-project') {
                      setSelectedLinkedProjectIds([]);
                    }
                  }}
                  isFullWidth
                />
              </EuiFormRow>
              <EuiFormRow
                label="Current project"
                helpText="This project is always included in the service account's access."
              >
                <EuiFieldText
                  readOnly
                  value={
                    currentProject
                      ? `${currentProject.name} (${currentProject.id})`
                      : 'Project unavailable'
                  }
                />
              </EuiFormRow>
              {accessScope === 'cross-project' && (
                <EuiFormRow
                  label={
                    <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
                      <EuiFlexItem grow={false}>Linked projects</EuiFlexItem>
                      <EuiFlexItem grow={false}>
                        <EuiIconTip
                          type="question"
                          size="s"
                          color="subdued"
                          content="Linked projects are Serverless projects connected to this origin project for cross-project search. To add one, open the Elastic Cloud home page, choose Manage for this project, then go to Cross-project search and select Link projects."
                          anchorProps={{ 'data-test-subj': 'linkedProjectsHelp' }}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  }
                  helpText="Select at least one linked project for cross-project search."
                  isInvalid={selectedLinkedProjectIds.length === 0}
                  error={
                    selectedLinkedProjectIds.length === 0
                      ? 'Select at least one linked project'
                      : undefined
                  }
                >
                  <EuiComboBox
                    options={linkedProjects.map((project) => ({
                      label: project._alias,
                      value: project._id,
                    }))}
                    selectedOptions={linkedProjects
                      .filter((project) => selectedLinkedProjectIds.includes(project._id))
                      .map((project) => ({
                        label: project._alias,
                        value: project._id,
                      }))}
                    onChange={(selectedOptions: EuiComboBoxOptionOption<string>[]) =>
                      setSelectedLinkedProjectIds(
                        selectedOptions.flatMap((option) => (option.value ? [option.value] : []))
                      )
                    }
                    placeholder="Select linked projects"
                    isInvalid={selectedLinkedProjectIds.length === 0}
                    fullWidth
                  />
                </EuiFormRow>
              )}
            </EuiForm>
          </EuiFlyoutBody>
          <EuiFlyoutFooter>
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={closeFlyout}>Cancel</EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  isLoading={isCreating}
                  disabled={
                    !currentProject?.type ||
                    !name.trim() ||
                    selectedRoleNames.length === 0 ||
                    (hasCustomIdentityRole &&
                      delegateToAdditionalRoles &&
                      allowedCallerRoleNames.length === 0) ||
                    (accessScope === 'cross-project' && selectedLinkedProjectIds.length === 0)
                  }
                  onClick={save}
                >
                  {editingIdentity ? 'Save changes' : 'Create'}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutFooter>
        </EuiFlyout>
      )}
    </EuiPageTemplate>
  );
};

export const renderApp = (
  core: CoreStart,
  params: ManagementAppMountParams,
  currentProject?: CurrentProject
): (() => void) => {
  ReactDOM.render(
    core.rendering.addContext(<ExecutionIdentityApp core={core} currentProject={currentProject} />),
    params.element
  );
  return () => ReactDOM.unmountComponentAtNode(params.element);
};
