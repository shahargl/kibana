/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { IconType } from '@elastic/eui';
import { useQuery } from '@kbn/react-query';
import { useKibana } from '../../../hooks/use_kibana';

export interface ExecutionIdentityProjectAssignment {
  projectType: string;
  projectIds: string[];
  roleNames: string[];
}

export interface ExecutionIdentitySummary {
  id: string;
  name: string;
  description?: string;
  projectAssignments: ExecutionIdentityProjectAssignment[];
}

export interface ExecutionIdentityUseAuthorization {
  allowed: boolean;
  reason: string;
}

const projectIconTypes: Record<string, IconType> = {
  elasticsearch: 'logoElasticsearch',
  observability: 'logoObservability',
  security: 'logoSecurity',
  workplaceai: 'logoElasticsearch',
  vectordb: 'logoElasticsearch',
};

const elasticsearchLogoSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><g fill="none" fill-rule="evenodd" transform="translate(2)"><path fill="#0B1F33" d="M0 16c0 1.384.194 2.72.524 4H20a4 4 0 1 0 0-8H.524A16.1 16.1 0 0 0 0 16"/><path fill="#FEC514" d="M26.924 7.662A16.1 16.1 0 0 0 28.48 6 15.97 15.97 0 0 0 1.644 9H23.51c1.267 0 2.483-.481 3.414-1.338"/><path fill="#00BFB3" d="M23.51 23H1.644A15.97 15.97 0 0 0 28.48 26a16.1 16.1 0 0 0-1.556-1.662A5.02 5.02 0 0 0 23.51 23"/></g></svg>';

const projectLogoSvgs: Record<string, string> = {
  elasticsearch: elasticsearchLogoSvg,
  observability:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#F04E98" d="M10 32H7.238C3.793 32 1 28.865 1 24.998V15h9v17Z"/><path fill="#0B1F33" d="M10 8h9v24h-9z"/><path fill="#0077CC" d="M31 32h-9V0l1.973.024C27.866.072 31 3.731 31 8.228V32Z"/></svg>',
  security:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#FA744E" d="M9 7.008V0h20v16.744c0 3.913-6.378 6.477-9.015 7.256V7.008H9Z"/><path fill="#1DBAB0" d="M3 20.073V10h14v22C7.667 27.98 3 24.004 3 20.073Z"/><path fill="#0B1F33" d="M9 10h8v14c-2.983-1.14-8-3.756-8-7.043V10Z"/></svg>',
  workplaceai: elasticsearchLogoSvg,
  vectordb: elasticsearchLogoSvg,
};

export const getExecutionIdentityProjectIconType = (projectType: string): IconType =>
  projectIconTypes[projectType] ?? 'logoElasticsearch';

export const getExecutionIdentityProjectLogoDataUrl = (projectType: string): string =>
  `data:image/svg+xml,${encodeURIComponent(projectLogoSvgs[projectType] ?? elasticsearchLogoSvg)}`;

export const useExecutionIdentities = (enabled = true) => {
  const { http } = useKibana().services;
  return useQuery({
    queryKey: ['executionIdentities'],
    queryFn: () => http.get<ExecutionIdentitySummary[]>('/internal/execution_identity'),
    enabled,
    staleTime: 30_000,
  });
};

export const useExecutionIdentity = (identityId?: string) => {
  const { http } = useKibana().services;
  return useQuery({
    queryKey: ['executionIdentity', identityId],
    queryFn: () => {
      if (!identityId) {
        return Promise.resolve(undefined);
      }
      return http.get<ExecutionIdentitySummary>(
        `/internal/execution_identity/${encodeURIComponent(identityId)}`
      );
    },
    enabled: Boolean(identityId),
    staleTime: 30_000,
  });
};

export const useExecutionIdentityCanUse = (identityId?: string) => {
  const { http } = useKibana().services;
  return useQuery({
    queryKey: ['executionIdentity', identityId, 'canUse'],
    queryFn: () => {
      if (!identityId) {
        return Promise.resolve({ allowed: true, reason: 'no_execution_identity' });
      }
      return http.get<ExecutionIdentityUseAuthorization>(
        `/internal/execution_identity/${encodeURIComponent(identityId)}/can_use`
      );
    },
    enabled: Boolean(identityId),
    staleTime: 10_000,
  });
};
