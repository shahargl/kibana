/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const PAGE_TITLE = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.pageTitle', {
  defaultMessage: 'Connectors',
});

export const PAGE_DESCRIPTION = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.pageDescription',
  { defaultMessage: 'Monitor traffic, access, and dependencies across connected services.' }
);

export const TAB_CONNECTED = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.tabConnected',
  { defaultMessage: 'Connected' }
);

export const TAB_CATALOG = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.tabCatalog', {
  defaultMessage: 'Explore catalog',
});

export const ADD_CONNECTION = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.addConnection',
  { defaultMessage: 'Add connection' }
);

export const OUTBOUND = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.outbound', {
  defaultMessage: 'Outbound',
});

export const INBOUND = i18n.translate('xpack.triggersActionsUI.connectorsRedesign.inbound', {
  defaultMessage: 'Inbound',
});

export const OUTBOUND_ONLY = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.outboundOnly',
  { defaultMessage: '(outbound only)' }
);

export const INBOUND_ONLY = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.inboundOnly',
  { defaultMessage: '(inbound only)' }
);

export const ACTIONS_OUTBOUND = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.actionsOutbound',
  { defaultMessage: 'Actions (outbound)' }
);

export const EVENTS_INBOUND = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.eventsInbound',
  { defaultMessage: 'Events (inbound)' }
);

export const PLACEHOLDER_TOOLTIP = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.placeholderTooltip',
  { defaultMessage: 'Preview data. This value is not yet backed by a Kibana API.' }
);

export const getHealthLabel = (
  direction: 'outbound' | 'inbound',
  status: 'healthy' | 'delayed' | 'failed' | 'unknown'
): string => {
  if (status === 'failed') {
    return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.failed', {
      defaultMessage: 'Check failed',
    });
  }
  if (direction === 'outbound') {
    switch (status) {
      case 'healthy':
        return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.outboundHealthy', {
          defaultMessage: 'Outbound healthy',
        });
      case 'delayed':
        return i18n.translate(
          'xpack.triggersActionsUI.connectorsRedesign.health.outboundDegraded',
          {
            defaultMessage: 'Outbound degraded',
          }
        );
      default:
        return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.outboundNoData', {
          defaultMessage: 'Outbound idle',
        });
    }
  }
  switch (status) {
    case 'healthy':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.inboundHealthy', {
        defaultMessage: 'Inbound healthy',
      });
    case 'delayed':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.inboundDelayed', {
        defaultMessage: 'Inbound delayed',
      });
    default:
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.health.inboundNoData', {
        defaultMessage: 'Inbound idle',
      });
  }
};

export const getHealthWord = (status: 'healthy' | 'delayed' | 'failed' | 'unknown'): string => {
  switch (status) {
    case 'healthy':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.healthWord.healthy', {
        defaultMessage: 'Healthy',
      });
    case 'delayed':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.healthWord.delayed', {
        defaultMessage: 'Delayed',
      });
    case 'failed':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.healthWord.failed', {
        defaultMessage: 'Failing',
      });
    default:
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.healthWord.unknown', {
        defaultMessage: 'No activity',
      });
  }
};

export const getAclLabel = (status: 'verified' | 'partial' | 'unknown'): string => {
  switch (status) {
    case 'verified':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.acl.verified', {
        defaultMessage: 'ACL verified',
      });
    case 'partial':
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.acl.partial', {
        defaultMessage: 'ACL partial',
      });
    default:
      return i18n.translate('xpack.triggersActionsUI.connectorsRedesign.acl.unknown', {
        defaultMessage: 'ACL unknown',
      });
  }
};
