/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ACTIVITY_WINDOW_DAYS } from '../constants';
import type { ActivityTotals, DailyActivity, HealthStatus } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExecutionSample {
  readonly connectorId: string;
  readonly timestamp: string;
  readonly status: string;
}

export interface DayCounts {
  outbound: number;
  outboundFailures: number;
}

const startOfDay = (time: number): number => {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Start-of-day timestamps for the activity window, oldest first, ending today. */
export const getActivityDays = (now: number = Date.now()): number[] => {
  const today = startOfDay(now);
  return Array.from(
    { length: ACTIVITY_WINDOW_DAYS },
    (_, index) => today - (ACTIVITY_WINDOW_DAYS - 1 - index) * DAY_MS
  );
};

export const getActivityWindowStart = (now: number = Date.now()): string =>
  new Date(getActivityDays(now)[0]).toISOString();

/** Groups execution log entries into per-connector, per-day outbound counts. */
export const bucketExecutions = (
  samples: readonly ExecutionSample[],
  days: readonly number[]
): Map<string, DayCounts[]> => {
  const byConnector = new Map<string, DayCounts[]>();
  for (const { connectorId, timestamp, status } of samples) {
    const dayIndex = days.indexOf(startOfDay(Date.parse(timestamp)));
    if (dayIndex === -1 || !connectorId) continue;
    let buckets = byConnector.get(connectorId);
    if (!buckets) {
      buckets = days.map(() => ({ outbound: 0, outboundFailures: 0 }));
      byConnector.set(connectorId, buckets);
    }
    buckets[dayIndex].outbound += 1;
    if (status === 'failure') buckets[dayIndex].outboundFailures += 1;
  }
  return byConnector;
};

export const mergeDaily = (
  days: readonly number[],
  outbound: readonly DayCounts[] | undefined,
  inbound: readonly number[]
): DailyActivity[] =>
  days.map((day, index) => ({
    day,
    outbound: outbound?.[index]?.outbound ?? 0,
    outboundFailures: outbound?.[index]?.outboundFailures ?? 0,
    inbound: inbound[index] ?? 0,
  }));

export const sumDaily = (daily: readonly DailyActivity[]): ActivityTotals =>
  daily.reduce<ActivityTotals>(
    (totals, { outbound, inbound, outboundFailures }) => ({
      outbound: totals.outbound + outbound,
      inbound: totals.inbound + inbound,
      outboundFailures: totals.outboundFailures + outboundFailures,
    }),
    { outbound: 0, inbound: 0, outboundFailures: 0 }
  );

/**
 * Outbound health from real execution outcomes: a connector whose latest-day
 * executions mostly fail, or with a failure ratio above 25% over the window, needs attention.
 */
export const getOutboundHealth = (
  daily: readonly DailyActivity[],
  isMissingSecrets?: boolean
): HealthStatus => {
  if (isMissingSecrets) return 'failed';
  const { outbound, outboundFailures } = sumDaily(daily);
  if (outbound === 0) return 'unknown';
  const latest = [...daily].reverse().find((day) => day.outbound > 0);
  if (latest && latest.outboundFailures === latest.outbound) return 'failed';
  return outboundFailures / outbound > 0.25 ? 'delayed' : 'healthy';
};

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export const formatCompact = (value: number): string =>
  compactFormatter.format(value).toLowerCase();
