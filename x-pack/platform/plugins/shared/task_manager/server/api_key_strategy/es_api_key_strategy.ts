/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Logger,
  SecurityServiceStart,
  KibanaRequest,
  SavedObjectsClientContract,
} from '@kbn/core/server';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';
import { ApiKeyType } from '../config';
import type { ConcreteTaskInstance, TaskInstance } from '../task';
import { getApiKeyAndUserScope, getUiamApiKeySecret } from '../lib/api_key_utils';
import type {
  ApiKeyInvalidationSource,
  ApiKeySOFields,
  ApiKeyStrategy,
  GrantApiKeysOpts,
  InvalidationTarget,
} from './api_key_strategy';
import { markApiKeysForInvalidation, recordTaskRunCredentialUsage } from './api_key_strategy';
import { EsAndUiamApiKeyStrategy } from './es_and_uiam_api_key_strategy';

export class EsApiKeyStrategy implements ApiKeyStrategy {
  public readonly shouldGrantUiam = false;
  public readonly typeToUse = ApiKeyType.ES;
  private readonly uiamServiceAccountStrategy?: EsAndUiamApiKeyStrategy;

  constructor(security?: SecurityServiceStart, logger?: Logger) {
    // Elasticsearch can't grant a key for a UIAM service account, so its tasks get a UIAM key even
    // when UIAM keys aren't granted for other callers. Those tasks then schedule follow-up tasks
    // with that UIAM key, which only the UIAM strategy can grant from.
    if (security?.authc.apiKeys.uiam && logger) {
      this.uiamServiceAccountStrategy = new EsAndUiamApiKeyStrategy(
        ApiKeyType.ES,
        security,
        logger
      );
    }
  }

  async grantApiKeys(
    taskInstances: TaskInstance[],
    request: KibanaRequest,
    security: SecurityServiceStart,
    opts?: GrantApiKeysOpts
  ): Promise<Map<string, ApiKeySOFields>> {
    if (this.uiamServiceAccountStrategy && this.needsUiamKey(request, security)) {
      return this.uiamServiceAccountStrategy.grantApiKeys(taskInstances, request, security, opts);
    }
    return getApiKeyAndUserScope(taskInstances, request, security, opts);
  }

  private needsUiamKey(request: KibanaRequest, security: SecurityServiceStart): boolean {
    const principal = security.authc.getPrincipal(request);
    if (principal?.type === 'service_account' && principal.variant === 'uiam') {
      return true;
    }
    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    return request.isFakeRequest && !!authorizationHeader && isUiamCredential(authorizationHeader);
  }

  getApiKeyForFakeRequest(taskInstance: ConcreteTaskInstance): string | undefined {
    const record = recordTaskRunCredentialUsage(taskInstance);
    if (taskInstance.apiKey) {
      record('es_api_key', 'config');
      return taskInstance.apiKey;
    }
    if (taskInstance.uiamApiKey) {
      record('uiam_api_key', 'provisioned');
      return getUiamApiKeySecret(taskInstance.uiamApiKey);
    }
    record('none', 'not_set');
    return undefined;
  }

  getApiKeyIdsForInvalidation(source: ApiKeyInvalidationSource): InvalidationTarget[] {
    const { userScope, uiamApiKey, apiKey } = source;
    if (!userScope || userScope.apiKeyCreatedByUser) {
      return [];
    }

    // A UIAM service account's task has only a UIAM key, whose id is mirrored in `apiKeyId`.
    const targets: InvalidationTarget[] =
      apiKey || !uiamApiKey ? [{ apiKeyId: userScope.apiKeyId }] : [];

    // Defense-in-depth for rollbacks / config changes: a deployment may have
    // previously run with `EsAndUiamApiKeyStrategy` and persisted a UIAM key
    // alongside the ES key on existing tasks. If the deployment later falls
    // back to `EsApiKeyStrategy` (e.g., `api_key_type` flipped back to `es`,
    // or UIAM disabled), those UIAM keys would otherwise become orphaned and
    // never be invalidated. Still emit an invalidation target for them so the
    // invalidation task can clean them up. Invalidation is best-effort and
    // idempotent, so it is safe to always emit when both values are present.
    if (userScope.uiamApiKeyId && uiamApiKey) {
      targets.push({ apiKeyId: userScope.uiamApiKeyId, uiamApiKey });
    }

    return targets;
  }

  async markForInvalidation(
    targets: InvalidationTarget[],
    logger: Logger,
    savedObjectsClient: SavedObjectsClientContract
  ): Promise<void> {
    return markApiKeysForInvalidation(targets, logger, savedObjectsClient);
  }
}
