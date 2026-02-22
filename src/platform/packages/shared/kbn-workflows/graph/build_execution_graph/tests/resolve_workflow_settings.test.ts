/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowSettings } from '../../../spec/schema';
import { resolveWorklfowSettings } from '../build_execution_graph';

describe('resolveWorklfowSettings', () => {
  it('should use workflow timezone when both workflow and default settings have timezone', () => {
    const workflowSettings: WorkflowSettings = {
      timezone: 'America/New_York',
      timeout: '5m',
    };
    const defaultSettings: WorkflowSettings = {
      timezone: 'UTC',
      timeout: '10m',
    };

    const resolved = resolveWorklfowSettings(workflowSettings, defaultSettings);

    expect(resolved?.timezone).toBe('America/New_York');
  });

  it('should fall back to default timezone when workflow has no timezone', () => {
    const workflowSettings: WorkflowSettings = {
      timeout: '5m',
    };
    const defaultSettings: WorkflowSettings = {
      timezone: 'UTC',
    };

    const resolved = resolveWorklfowSettings(workflowSettings, defaultSettings);

    expect(resolved?.timezone).toBe('UTC');
  });

  it('should not set timezone to the timeout value', () => {
    const workflowSettings: WorkflowSettings = {
      timeout: '30s',
    };
    const defaultSettings: WorkflowSettings = {
      timezone: 'Europe/London',
    };

    const resolved = resolveWorklfowSettings(workflowSettings, defaultSettings);

    expect(resolved?.timezone).not.toBe('30s');
    expect(resolved?.timezone).toBe('Europe/London');
  });

  it('should return workflow settings when no defaults are provided', () => {
    const workflowSettings: WorkflowSettings = {
      timezone: 'Asia/Tokyo',
      timeout: '1m',
    };

    const resolved = resolveWorklfowSettings(workflowSettings, undefined);

    expect(resolved).toBe(workflowSettings);
  });

  it('should return default settings when no workflow settings are provided', () => {
    const defaultSettings: WorkflowSettings = {
      timezone: 'UTC',
      timeout: '10m',
    };

    const resolved = resolveWorklfowSettings(undefined, defaultSettings);

    expect(resolved).toBe(defaultSettings);
  });

  it('should correctly merge timeout from defaults when workflow has no timeout', () => {
    const workflowSettings: WorkflowSettings = {
      timezone: 'America/Chicago',
    };
    const defaultSettings: WorkflowSettings = {
      timeout: '10m',
      timezone: 'UTC',
    };

    const resolved = resolveWorklfowSettings(workflowSettings, defaultSettings);

    expect(resolved?.timeout).toBe('10m');
    expect(resolved?.timezone).toBe('America/Chicago');
  });
});
