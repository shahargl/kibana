/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  bucketExecutions,
  formatCompact,
  getActivityDays,
  getOutboundHealth,
  mergeDaily,
  sumDaily,
} from './activity';
import type { DailyActivity } from '../types';

const NOW = new Date(2026, 8, 23, 15, 30).getTime();

const day = (outbound: number, outboundFailures = 0, inbound = 0): DailyActivity => ({
  day: 0,
  outbound,
  outboundFailures,
  inbound,
});

describe('getActivityDays', () => {
  it('returns seven local start-of-day timestamps ending today', () => {
    const days = getActivityDays(NOW);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(new Date(2026, 8, 23).getTime());
    expect(days[0]).toBe(new Date(2026, 8, 17).getTime());
  });
});

describe('bucketExecutions', () => {
  it('counts executions and failures per connector and day, ignoring out-of-window entries', () => {
    const days = getActivityDays(NOW);
    const buckets = bucketExecutions(
      [
        { connectorId: 'a', timestamp: new Date(2026, 8, 23, 9).toISOString(), status: 'success' },
        { connectorId: 'a', timestamp: new Date(2026, 8, 23, 10).toISOString(), status: 'failure' },
        { connectorId: 'a', timestamp: new Date(2026, 8, 18, 10).toISOString(), status: 'success' },
        { connectorId: 'b', timestamp: new Date(2026, 8, 1, 10).toISOString(), status: 'success' },
        { connectorId: '', timestamp: new Date(2026, 8, 23, 10).toISOString(), status: 'success' },
      ],
      days
    );

    expect([...buckets.keys()]).toEqual(['a']);
    expect(buckets.get('a')?.[6]).toEqual({ outbound: 2, outboundFailures: 1 });
    expect(buckets.get('a')?.[1]).toEqual({ outbound: 1, outboundFailures: 0 });
  });
});

describe('mergeDaily and sumDaily', () => {
  it('zips outbound and inbound counts and totals them', () => {
    const merged = mergeDaily(
      [1, 2],
      [
        { outbound: 3, outboundFailures: 1 },
        { outbound: 4, outboundFailures: 0 },
      ],
      [10, 20]
    );
    expect(merged).toEqual([
      { day: 1, outbound: 3, outboundFailures: 1, inbound: 10 },
      { day: 2, outbound: 4, outboundFailures: 0, inbound: 20 },
    ]);
    expect(sumDaily(merged)).toEqual({ outbound: 7, outboundFailures: 1, inbound: 30 });
  });

  it('treats missing outbound data as zero', () => {
    expect(mergeDaily([1], undefined, [])).toEqual([
      { day: 1, outbound: 0, outboundFailures: 0, inbound: 0 },
    ]);
  });
});

describe('getOutboundHealth', () => {
  it('is failed when secrets are missing', () => {
    expect(getOutboundHealth([day(10)], true)).toBe('failed');
  });

  it('is unknown without executions', () => {
    expect(getOutboundHealth([day(0), day(0)])).toBe('unknown');
  });

  it('is failed when every execution on the latest active day failed', () => {
    expect(getOutboundHealth([day(10), day(2, 2), day(0)])).toBe('failed');
  });

  it('is delayed when more than a quarter of executions failed', () => {
    expect(getOutboundHealth([day(10, 5), day(2)])).toBe('delayed');
  });

  it('is healthy otherwise', () => {
    expect(getOutboundHealth([day(10, 1), day(10)])).toBe('healthy');
  });
});

describe('formatCompact', () => {
  it('formats large numbers compactly in lowercase', () => {
    expect(formatCompact(8400)).toBe('8.4k');
    expect(formatCompact(12)).toBe('12');
  });
});
