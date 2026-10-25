/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IconType } from '@elastic/eui';
import type { ActionConnector, ActionType } from '../../../types';

export type Direction = 'outbound' | 'inbound';

export type DirectionFilter = 'all' | 'outbound' | 'inbound' | 'both';

export type CatalogFilter = 'all' | 'actions' | 'events' | 'both';

export type HealthStatus = 'healthy' | 'delayed' | 'failed' | 'unknown';

export type HealthFilter = 'all' | 'healthy' | 'attention';

export type AclStatus = 'verified' | 'partial' | 'unknown';

export type SortOption = 'name_asc' | 'name_desc' | 'activity_desc';

export interface Capability {
  readonly direction: Direction;
  /** Long form used in the catalog, e.g. "Create and resolve incidents". */
  readonly label: string;
  /** Compact form used in the connections table, e.g. "Create incidents". */
  readonly shortLabel: string;
}

/** Per-direction product copy for a connector type. */
export interface DirectionProfile {
  readonly capability: Capability;
  /** Individual operations shown on the detail page, e.g. "Create incident". */
  readonly operations: readonly string[];
  /** Bullets shown under "Access requirements" in the connect wizard. */
  readonly requirements: readonly string[];
  /** Permission scopes requested from the third party (outbound only). */
  readonly scopes: readonly string[];
}

export interface CatalogEntry {
  readonly actionType: ActionType;
  readonly id: string;
  readonly name: string;
  /** Brand name without the "(MCP)" / "connector" suffixes, e.g. "PagerDuty". */
  readonly vendorName: string;
  readonly description: string;
  readonly category: string;
  readonly icon: IconType;
  readonly outbound?: DirectionProfile;
  readonly inbound?: DirectionProfile;
  readonly isEnabled: boolean;
}

export interface DailyActivity {
  /** Start of the day, as epoch millis. */
  readonly day: number;
  readonly outbound: number;
  readonly inbound: number;
  readonly outboundFailures: number;
}

export interface ActivityTotals {
  readonly outbound: number;
  readonly inbound: number;
  readonly outboundFailures: number;
}

export interface ConnectionHealth {
  readonly outbound?: HealthStatus;
  readonly inbound?: HealthStatus;
}

export interface WorkflowReference {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface RuleReference {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Connection metadata with no backing API yet (ACL verification, inbound delivery,
 * workflow usage, environment). Produced by `placeholder_insights.ts`.
 */
export interface ConnectionInsights {
  readonly isPlaceholder: true;
  readonly identity: string;
  readonly identityDescription: string;
  readonly acl: { readonly status: AclStatus; readonly scopes: readonly string[] };
  readonly environment: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastTestedAt: number;
  readonly inbound?: {
    readonly health: HealthStatus;
    readonly lastEventAt: number;
    readonly sourceName: string;
    readonly allowedSources: readonly string[];
  };
  readonly workflows: readonly WorkflowReference[];
  readonly inboundDaily: readonly number[];
}

export interface Connection {
  readonly connector: ActionConnector;
  readonly entry?: CatalogEntry;
  readonly daily: readonly DailyActivity[];
  readonly totals: ActivityTotals;
  readonly health: ConnectionHealth;
  readonly insights: ConnectionInsights;
  readonly rulesCount: number;
}
