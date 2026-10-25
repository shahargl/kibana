/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import {
  connectorTypeHasInboundEvents,
  getConnectorSpec,
  isInboundOnlyConnectorSpec,
} from '@kbn/connector-specs';
import type { Direction, DirectionProfile } from '../types';

interface TypeProfile {
  readonly category: string;
  readonly outbound?: DirectionProfile;
  readonly inbound?: DirectionProfile;
}

const profile = (
  direction: Direction,
  label: string,
  shortLabel: string,
  operations: readonly string[],
  requirements: readonly string[],
  scopes: readonly string[] = []
): DirectionProfile => ({
  capability: { direction, label, shortLabel },
  operations,
  requirements,
  scopes,
});

const CATEGORY = {
  incidents: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.incidents', {
    defaultMessage: 'Incident management',
  }),
  collaboration: i18n.translate(
    'xpack.triggersActionsUI.connectorsRedesign.category.collaboration',
    { defaultMessage: 'Team collaboration' }
  ),
  identity: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.identity', {
    defaultMessage: 'Identity management',
  }),
  monitoring: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.monitoring', {
    defaultMessage: 'Monitoring',
  }),
  itsm: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.itsm', {
    defaultMessage: 'IT service management',
  }),
  messaging: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.messaging', {
    defaultMessage: 'Messaging',
  }),
  security: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.security', {
    defaultMessage: 'Security',
  }),
  ai: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.ai', {
    defaultMessage: 'AI',
  }),
  custom: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.custom', {
    defaultMessage: 'Custom',
  }),
  integration: i18n.translate('xpack.triggersActionsUI.connectorsRedesign.category.integration', {
    defaultMessage: 'Integration',
  }),
};

const WEBHOOK_SIGNING_KEY = (vendor: string) =>
  i18n.translate('xpack.triggersActionsUI.connectorsRedesign.requirements.webhookSigningKey', {
    defaultMessage: 'Webhook signing key (from {vendor})',
    values: { vendor },
  });

const CONFIGURE_ENDPOINT = (vendor: string) =>
  i18n.translate('xpack.triggersActionsUI.connectorsRedesign.requirements.configureEndpoint', {
    defaultMessage: 'Configure the provided Elastic endpoint in {vendor}',
    values: { vendor },
  });

const pagerDuty: TypeProfile = {
  category: CATEGORY.incidents,
  outbound: profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.outbound', {
      defaultMessage: 'Create and resolve incidents',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.outboundShort', {
      defaultMessage: 'Create incidents',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.opCreate', {
        defaultMessage: 'Create incident',
      }),
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.opResolve', {
        defaultMessage: 'Resolve incident',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.reqServiceAccount', {
        defaultMessage: 'PagerDuty API service account (user or integration)',
      }),
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.reqScopes', {
        defaultMessage: 'Required scopes: incidents:write, incidents:read',
      }),
    ],
    ['incidents.read', 'incidents.write']
  ),
  inbound: profile(
    'inbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.inbound', {
      defaultMessage: 'Receive incident updates',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.inboundShort', {
      defaultMessage: 'Receive updates',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pagerduty.opReceive', {
        defaultMessage: 'Receive incident updates',
      }),
    ],
    [WEBHOOK_SIGNING_KEY('PagerDuty'), CONFIGURE_ENDPOINT('PagerDuty')]
  ),
};

const chatProfile = (vendor: string, category: string): TypeProfile => ({
  category,
  outbound: profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.outbound', {
      defaultMessage: 'Send messages',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.outboundShort', {
      defaultMessage: 'Send messages',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.opPost', {
        defaultMessage: 'Post message',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.reqBot', {
        defaultMessage: '{vendor} bot token or incoming webhook URL',
        values: { vendor },
      }),
    ],
    ['chat:write']
  ),
  inbound: profile(
    'inbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.inbound', {
      defaultMessage: 'Receive channel events',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.inboundShort', {
      defaultMessage: 'Receive events',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.chat.opReceive', {
        defaultMessage: 'Receive channel events',
      }),
    ],
    [WEBHOOK_SIGNING_KEY(vendor), CONFIGURE_ENDPOINT(vendor)]
  ),
});

const serviceNow: TypeProfile = {
  category: CATEGORY.itsm,
  outbound: profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.outbound', {
      defaultMessage: 'Create and update records',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.outboundShort', {
      defaultMessage: 'Update records',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.opCreate', {
        defaultMessage: 'Create record',
      }),
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.opUpdate', {
        defaultMessage: 'Update record',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.reqAccount', {
        defaultMessage: 'ServiceNow integration user with table API access',
      }),
    ],
    ['incident.read', 'incident.write']
  ),
  inbound: profile(
    'inbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.inbound', {
      defaultMessage: 'Receive record updates',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.inboundShort', {
      defaultMessage: 'Receive updates',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.servicenow.opReceive', {
        defaultMessage: 'Receive record updates',
      }),
    ],
    [WEBHOOK_SIGNING_KEY('ServiceNow'), CONFIGURE_ENDPOINT('ServiceNow')]
  ),
};

const onePassword: TypeProfile = {
  category: CATEGORY.identity,
  outbound: profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.onePassword.outbound', {
      defaultMessage: 'Find and suspend users',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.onePassword.outboundShort', {
      defaultMessage: 'Suspend users',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.onePassword.opFind', {
        defaultMessage: 'Find user',
      }),
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.onePassword.opSuspend', {
        defaultMessage: 'Suspend user',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.onePassword.reqToken', {
        defaultMessage: '1Password SCIM bridge bearer token',
      }),
    ],
    ['users.read', 'users.suspend']
  ),
};

const cloudWatch: TypeProfile = {
  category: CATEGORY.monitoring,
  outbound: profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.outbound', {
      defaultMessage: 'Query alarms, metrics, and logs',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.outboundShort', {
      defaultMessage: 'Query alarms',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.opListAlarms', {
        defaultMessage: 'List alarms',
      }),
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.opQueryLogs', {
        defaultMessage: 'Query Logs Insights',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.reqCredentials', {
        defaultMessage: 'AWS access key with CloudWatch read permissions',
      }),
    ],
    ['cloudwatch:DescribeAlarms', 'logs:StartQuery']
  ),
  inbound: profile(
    'inbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.inbound', {
      defaultMessage: 'Receive alarms',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.inboundShort', {
      defaultMessage: 'Receive alarms',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.opReceive', {
        defaultMessage: 'Receive alarm state changes',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.cloudwatch.reqRole', {
        defaultMessage: 'Cross-account IAM role for Amazon SNS delivery',
      }),
      CONFIGURE_ENDPOINT('AWS'),
    ]
  ),
};

const inboundWebhook: TypeProfile = {
  category: CATEGORY.custom,
  inbound: profile(
    'inbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.inboundWebhook.inbound', {
      defaultMessage: 'Receive webhook events',
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.inboundWebhook.inboundShort', {
      defaultMessage: 'Receive events',
    }),
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.inboundWebhook.opReceive', {
        defaultMessage: 'Receive webhook events',
      }),
    ],
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.inboundWebhook.reqToken', {
        defaultMessage: 'Ingest token (generated when you save)',
      }),
      CONFIGURE_ENDPOINT('the sending service'),
    ]
  ),
};

const CURATED_PROFILES: Readonly<Record<string, TypeProfile>> = {
  '.pagerduty': pagerDuty,
  '.pagerduty_mcp': pagerDuty,
  '.slack': chatProfile('Slack', CATEGORY.collaboration),
  '.slack_api': chatProfile('Slack', CATEGORY.collaboration),
  '.slack2': chatProfile('Slack', CATEGORY.collaboration),
  '.teams': chatProfile('Microsoft Teams', CATEGORY.collaboration),
  '.microsoft-teams': chatProfile('Microsoft Teams', CATEGORY.collaboration),
  '.servicenow': serviceNow,
  '.servicenow-sir': serviceNow,
  '.servicenow-itom': serviceNow,
  '.servicenow_search': serviceNow,
  '.1password': onePassword,
  '.aws_cloudwatch': cloudWatch,
  '.inboundWebhook': inboundWebhook,
};

const humanize = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (char) => char.toUpperCase());

const genericCategory = (supportedFeatureIds: readonly string[]): string => {
  if (supportedFeatureIds.some((id) => id.startsWith('generativeAI'))) return CATEGORY.ai;
  if (supportedFeatureIds.includes('siem') || supportedFeatureIds.includes('endpointSecurity')) {
    return CATEGORY.security;
  }
  if (supportedFeatureIds.includes('cases')) return CATEGORY.itsm;
  return CATEGORY.integration;
};

const genericOutbound = (actionTypeId: string, vendor: string): DirectionProfile => {
  const spec = getConnectorSpec(actionTypeId);
  const operations = spec ? Object.keys(spec.actions).slice(0, 3).map(humanize) : [];
  return profile(
    'outbound',
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.generic.outbound', {
      defaultMessage: 'Run actions in {vendor}',
      values: { vendor },
    }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.generic.outboundShort', {
      defaultMessage: 'Run actions',
    }),
    operations,
    [
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.generic.reqCredentials', {
        defaultMessage: 'Credentials for the {vendor} API',
        values: { vendor },
      }),
    ]
  );
};

const genericInbound = (actionTypeId: string, vendor: string): DirectionProfile => {
  const definitions = Object.values(getConnectorSpec(actionTypeId)?.events?.definitions ?? {});
  return profile(
    'inbound',
    definitions[0]?.title ??
      i18n.translate('xpack.triggersActionsUI.connectorsRedesign.generic.inbound', {
        defaultMessage: 'Receive events',
      }),
    i18n.translate('xpack.triggersActionsUI.connectorsRedesign.generic.inboundShort', {
      defaultMessage: 'Receive events',
    }),
    definitions.map(({ title }) => title),
    [WEBHOOK_SIGNING_KEY(vendor), CONFIGURE_ENDPOINT(vendor)]
  );
};

const isInboundOnlyType = (actionTypeId: string): boolean => {
  const spec = getConnectorSpec(actionTypeId);
  return spec !== undefined && isInboundOnlyConnectorSpec(spec);
};

/** Strips suffixes such as "(MCP)" or "connector" so copy reads "Connect PagerDuty". */
export const getVendorName = (name: string): string =>
  name
    .replace(/\s*\((mcp|preview|beta|legacy)\)\s*$/i, '')
    .replace(/\s+connector$/i, '')
    .trim();

/** Resolves the capability profile of a connector type from curated copy or its spec. */
export const getTypeProfile = (
  actionTypeId: string,
  name: string,
  supportedFeatureIds: readonly string[]
): TypeProfile => {
  const curated = CURATED_PROFILES[actionTypeId];
  if (curated) return curated;

  const vendor = getVendorName(name);
  return {
    category: genericCategory(supportedFeatureIds),
    outbound: isInboundOnlyType(actionTypeId) ? undefined : genericOutbound(actionTypeId, vendor),
    inbound: connectorTypeHasInboundEvents(actionTypeId)
      ? genericInbound(actionTypeId, vendor)
      : undefined,
  };
};
