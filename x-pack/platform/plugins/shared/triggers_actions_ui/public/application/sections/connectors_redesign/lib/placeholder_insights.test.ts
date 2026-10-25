/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionConnector } from '../../../../types';
import type { CatalogEntry } from '../types';
import { getPlaceholderInsights, hashString } from './placeholder_insights';

const NOW = new Date(2026, 8, 23).getTime();

const connector = (overrides: Partial<ActionConnector> = {}): ActionConnector =>
  ({
    id: 'pd-prod',
    name: 'PagerDuty',
    actionTypeId: '.pagerduty',
    config: {},
    isPreconfigured: false,
    isDeprecated: false,
    isSystemAction: false,
    isMissingSecrets: false,
    isConnectorTypeDeprecated: false,
    referencedByCount: 0,
    secrets: {},
    ...overrides,
  } as ActionConnector);

const entry = (withInbound: boolean): CatalogEntry => ({
  actionType: {
    id: '.pagerduty',
    name: 'PagerDuty',
    enabled: true,
    enabledInConfig: true,
    enabledInLicense: true,
    minimumLicenseRequired: 'gold',
    supportedFeatureIds: ['alerting'],
    isSystemActionType: false,
    isDeprecated: false,
  },
  id: '.pagerduty',
  name: 'PagerDuty',
  vendorName: 'PagerDuty',
  description: '',
  category: 'Incident management',
  icon: 'plugs',
  isEnabled: true,
  outbound: {
    capability: { direction: 'outbound', label: 'Create', shortLabel: 'Create' },
    operations: [],
    requirements: [],
    scopes: ['incidents.write'],
  },
  ...(withInbound
    ? {
        inbound: {
          capability: { direction: 'inbound', label: 'Receive', shortLabel: 'Receive' },
          operations: [],
          requirements: [],
          scopes: [],
        },
      }
    : {}),
});

describe('hashString', () => {
  it('is stable and spreads different inputs', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('getPlaceholderInsights', () => {
  it('is deterministic for the same connector', () => {
    expect(getPlaceholderInsights(connector(), entry(true), NOW)).toEqual(
      getPlaceholderInsights(connector(), entry(true), NOW)
    );
  });

  it('marks the result as placeholder and uses the type identity and spec scopes', () => {
    const insights = getPlaceholderInsights(connector(), entry(false), NOW);
    expect(insights.isPlaceholder).toBe(true);
    expect(insights.identity).toBe('svc-elastic-prod');
    expect(insights.acl.scopes).toEqual(['incidents.write']);
    expect(insights.environment).toBe('Production');
  });

  it('only produces inbound data when the type receives events', () => {
    const outboundOnly = getPlaceholderInsights(connector(), entry(false), NOW);
    expect(outboundOnly.inbound).toBeUndefined();
    expect(outboundOnly.inboundDaily.every((count) => count === 0)).toBe(true);

    const both = getPlaceholderInsights(connector(), entry(true), NOW);
    expect(both.inbound?.sourceName).toBe('PagerDuty webhook');
    expect(both.inboundDaily).toHaveLength(7);
    expect(both.inboundDaily.every((count) => count > 0)).toBe(true);
  });

  it('describes per-user connectors and staging names', () => {
    const insights = getPlaceholderInsights(
      connector({ name: 'PagerDuty staging', authMode: 'per-user' }),
      entry(false),
      NOW
    );
    expect(insights.identity).toBe('Per-user credentials');
    expect(insights.environment).toBe('Staging');
  });
});
