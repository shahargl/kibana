/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const ROUTE_CONNECTED = '/connectors';
export const ROUTE_CATALOG = '/catalog';
export const ROUTE_DETAILS =
  '/connectors/:connectorId/:tab(overview|configuration|activity|used_by)?';

export const DETAIL_TABS = ['overview', 'configuration', 'activity', 'used_by'] as const;
export type DetailTab = (typeof DETAIL_TABS)[number];

export const getDetailsPath = (connectorId: string, tab?: DetailTab): string =>
  `/connectors/${encodeURIComponent(connectorId)}${tab && tab !== 'overview' ? `/${tab}` : ''}`;

export const ACTIVITY_WINDOW_DAYS = 7;

/** Upper bound of execution log pages fetched for the list sparklines (100 executions each). */
export const MAX_ACTIVITY_LOG_PAGES = 10;

export const ACTIVITY_LOG_PAGE_SIZE = 100;
