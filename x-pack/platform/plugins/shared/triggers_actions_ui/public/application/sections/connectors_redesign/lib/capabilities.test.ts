/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getTypeProfile, getVendorName } from './capabilities';

describe('getVendorName', () => {
  it.each([
    ['PagerDuty', 'PagerDuty'],
    ['PagerDuty (MCP)', 'PagerDuty'],
    ['Slack connector', 'Slack'],
    ['Jira (Preview)', 'Jira'],
  ])('%s -> %s', (name, expected) => {
    expect(getVendorName(name)).toBe(expected);
  });
});

describe('getTypeProfile', () => {
  it('uses curated copy for PagerDuty with both directions', () => {
    const { outbound, inbound } = getTypeProfile('.pagerduty', 'PagerDuty', ['alerting']);
    expect(outbound?.capability).toEqual({
      direction: 'outbound',
      label: 'Create and resolve incidents',
      shortLabel: 'Create incidents',
    });
    expect(outbound?.scopes).toEqual(['incidents.read', 'incidents.write']);
    expect(inbound?.capability.direction).toBe('inbound');
  });

  it('marks inbound-only types without an outbound profile', () => {
    const { outbound, inbound } = getTypeProfile('.inboundWebhook', 'Inbound webhook', []);
    expect(outbound).toBeUndefined();
    expect(inbound?.capability.label).toBe('Receive webhook events');
  });

  it('falls back to a generic outbound-only profile for legacy types', () => {
    const { category, outbound, inbound } = getTypeProfile('.email', 'Email', ['alerting']);
    expect(category).toBe('Integration');
    expect(outbound?.capability.label).toBe('Run actions in Email');
    expect(inbound).toBeUndefined();
  });

  it('derives the category from supported features', () => {
    expect(getTypeProfile('.gen-ai', 'OpenAI', ['generativeAIForSecurity']).category).toBe('AI');
    expect(getTypeProfile('.jira', 'Jira', ['alerting', 'cases']).category).toBe(
      'IT service management'
    );
  });
});
