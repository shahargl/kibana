/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { WorkflowDetailDto, WorkflowYaml } from '@kbn/workflows';
import { selectRunAsIdentityId } from './selectors';
import type { ComputedData } from './types';

const workflowWithRunAs = (runAs: string): WorkflowDetailDto =>
  ({
    definition: {
      settings: { run_as: runAs },
    } as WorkflowYaml,
  } as WorkflowDetailDto);

describe('selectRunAsIdentityId', () => {
  it('uses the persisted definition while computed data is temporarily unavailable', () => {
    expect(selectRunAsIdentityId.resultFunc({}, workflowWithRunAs('persisted-identity'))).toBe(
      'persisted-identity'
    );
  });

  it('uses the current computed definition after it is available', () => {
    const computed: ComputedData = {
      workflowDefinition: {
        settings: { run_as: 'edited-identity' },
      } as WorkflowYaml,
    };

    expect(
      selectRunAsIdentityId.resultFunc(computed, workflowWithRunAs('persisted-identity'))
    ).toBe('edited-identity');
  });

  it('does not fall back when a valid current definition removes run_as', () => {
    const computed: ComputedData = {
      workflowDefinition: {
        settings: {},
      } as WorkflowYaml,
    };

    expect(
      selectRunAsIdentityId.resultFunc(computed, workflowWithRunAs('persisted-identity'))
    ).toBeUndefined();
  });
});
