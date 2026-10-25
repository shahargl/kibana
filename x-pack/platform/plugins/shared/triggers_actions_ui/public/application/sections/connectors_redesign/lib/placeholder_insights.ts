/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Placeholder data for connection properties that have no backing API yet:
 * ACL verification, inbound delivery health and volume, workflow usage, environment
 * and timestamps. Values are deterministic per connector id so the UI is stable
 * across reloads. Replace each field with a real source as the APIs land.
 */

import { i18n } from '@kbn/i18n';
import type { ActionConnector } from '../../../../types';
import { ACTIVITY_WINDOW_DAYS } from '../constants';
import type {
  AclStatus,
  CatalogEntry,
  ConnectionInsights,
  HealthStatus,
  WorkflowReference,
} from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const MODULUS = 2147483647;

/** Polynomial string hash; stable across sessions, good enough to spread placeholder values. */
export const hashString = (value: string): number => {
  let hash = 7;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) % MODULUS;
  }
  return hash;
};

/** Park–Miller generator yielding values in [0, 1). */
const seeded = (seed: number) => {
  let state = seed % MODULUS || 1;
  return (): number => {
    state = (state * 16807) % MODULUS;
    return (state - 1) / (MODULUS - 1);
  };
};

const IDENTITY_BY_TYPE: Readonly<Record<string, string>> = {
  '.pagerduty': 'svc-elastic-prod',
  '.pagerduty_mcp': 'svc-elastic-prod',
  '.slack': 'elastic-bot',
  '.slack_api': 'elastic-bot',
  '.slack2': 'elastic-bot',
  '.teams': 'elastic-bot',
  '.microsoft-teams': 'elastic-bot',
  '.1password': 'svc-user-admin',
  '.aws_cloudwatch': 'cross-account role',
};

const ACL_STATUSES: readonly AclStatus[] = ['verified', 'verified', 'partial', 'unknown'];

const WORKFLOW_POOL: readonly WorkflowReference[] = [
  {
    id: 'placeholder-incident-response',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf1', {
      defaultMessage: 'Incident response',
    }),
    description: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf1Desc', {
      defaultMessage: 'Automated incident creation and resolution',
    }),
  },
  {
    id: 'placeholder-security-incident-management',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf2', {
      defaultMessage: 'Security incident management',
    }),
    description: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf2Desc', {
      defaultMessage: 'Creates incidents for critical alerts',
    }),
  },
  {
    id: 'placeholder-on-call-escalation',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf3', {
      defaultMessage: 'On-call escalation',
    }),
    description: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf3Desc', {
      defaultMessage: 'Pages the next responder when an alert is not acknowledged',
    }),
  },
  {
    id: 'placeholder-alert-triage',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf4', {
      defaultMessage: 'Alert triage',
    }),
    description: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf4Desc', {
      defaultMessage: 'Enriches new alerts and routes them to the owning team',
    }),
  },
  {
    id: 'placeholder-user-offboarding',
    name: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf5', {
      defaultMessage: 'User offboarding',
    }),
    description: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.wf5Desc', {
      defaultMessage: 'Suspends accounts of departing employees',
    }),
  },
];

const getEnvironment = (name: string): string => {
  if (/stag|dev|test|sandbox/i.test(name)) {
    return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.envStaging', {
      defaultMessage: 'Staging',
    });
  }
  return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.envProduction', {
    defaultMessage: 'Production',
  });
};

const getInboundHealth = (random: () => number): HealthStatus => {
  const roll = random();
  if (roll < 0.6) return 'healthy';
  if (roll < 0.9) return 'delayed';
  return 'failed';
};

/** Builds the placeholder insights for a single connection. */
export const getPlaceholderInsights = (
  connector: ActionConnector,
  entry: CatalogEntry | undefined,
  now: number = Date.now()
): ConnectionInsights => {
  const random = seeded(hashString(connector.id));
  const vendor = entry?.vendorName ?? connector.name;
  const perUser = connector.authMode === 'per-user';

  const identity = perUser
    ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.perUserIdentity', {
        defaultMessage: 'Per-user credentials',
      })
    : IDENTITY_BY_TYPE[connector.actionTypeId] ?? 'svc-elastic';

  const createdAt = now - Math.round((200 + random() * 300) * DAY_MS);
  const updatedAt = now - Math.round((1 + random() * 30) * DAY_MS);

  const inbound = entry?.inbound
    ? {
        health: getInboundHealth(random),
        lastEventAt: now - Math.round((1 + random() * 60) * MINUTE_MS),
        sourceName: i18n.translate(
          'xpack.triggersActionsUI.connectorsRedesign.placeholder.webhookSource',
          { defaultMessage: '{vendor} webhook', values: { vendor } }
        ),
        allowedSources: [
          i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.signingKey', {
            defaultMessage: '{vendor} signing key',
            values: { vendor },
          }),
          i18n.translate(
            'xpack.triggersActionsUI.connectorsRedesign.placeholder.productionEndpoint',
            { defaultMessage: 'production endpoint' }
          ),
        ],
      }
    : undefined;

  const inboundBase = 200 + random() * 1800;
  const inboundDaily = inbound
    ? Array.from({ length: ACTIVITY_WINDOW_DAYS }, () =>
        Math.round(inboundBase * (0.55 + random() * 0.9))
      )
    : Array.from({ length: ACTIVITY_WINDOW_DAYS }, () => 0);

  const workflowCount = Math.floor(random() * 6);
  const offset = Math.floor(random() * WORKFLOW_POOL.length);
  const workflows = Array.from(
    { length: Math.min(workflowCount, WORKFLOW_POOL.length) },
    (_, index) => WORKFLOW_POOL[(offset + index) % WORKFLOW_POOL.length]
  );

  return {
    isPlaceholder: true,
    identity,
    identityDescription: perUser
      ? i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.perUserDesc', {
          defaultMessage: 'Each user authorizes with their own account',
        })
      : i18n.translate('xpack.triggersActionsUI.connectorsRedesign.placeholder.identityDesc', {
          defaultMessage: 'Used for authenticating outbound requests',
        }),
    acl: {
      status: entry?.outbound
        ? ACL_STATUSES[Math.floor(random() * ACL_STATUSES.length)]
        : 'verified',
      scopes: entry?.outbound?.scopes ?? [],
    },
    environment: getEnvironment(connector.name),
    createdAt,
    updatedAt,
    lastTestedAt: now - Math.round((1 + random() * 45) * MINUTE_MS),
    inbound,
    workflows,
    inboundDaily,
  };
};
