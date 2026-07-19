/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const EXECUTION_IDENTITY_SAVED_OBJECT_TYPE = 'execution-identity';
export const EXECUTION_IDENTITY_PLUGIN_ID = 'executionIdentity';
export const EXECUTION_IDENTITY_PLUGIN_NAME = 'Service accounts';

export type ExecutionIdentityProjectType =
  | 'elasticsearch'
  | 'observability'
  | 'security'
  | 'workplaceai'
  | 'vectordb';

export interface ExecutionIdentityProjectAssignment {
  projectType: ExecutionIdentityProjectType;
  projectIds: string[];
  roleNames: string[];
}

export interface ExecutionIdentity {
  id: string;
  name: string;
  description: string;
  projectAssignments: ExecutionIdentityProjectAssignment[];
  allowedProjectAssignments: ExecutionIdentityProjectAssignment[];
  /** @deprecated Kept only to read identities created by the earlier people-based PoC. */
  allowedUserIds: number[];
  apiKeyId: string;
  createdBy: string;
  createdByDisplayName?: string;
  createdAt: string;
}

export interface CreateExecutionIdentityRequest {
  name: string;
  description: string;
  projectAssignments: ExecutionIdentityProjectAssignment[];
  allowedProjectAssignments?: ExecutionIdentityProjectAssignment[];
  /** @deprecated Role-based delegation should be used for new identities. */
  allowedUserIds?: number[];
}

export type UpdateExecutionIdentityRequest = CreateExecutionIdentityRequest;

export interface ExecutionIdentityUseAuthorization {
  allowed: boolean;
  reason: string;
}

export interface ExecutionIdentityAssignableRole {
  name: string;
  kind: 'built_in' | 'custom';
}

export interface ResolvedExecutionIdentity {
  id: string;
  name: string;
  spaceId: string;
  authorization: string;
  apiKeyId: string;
}
