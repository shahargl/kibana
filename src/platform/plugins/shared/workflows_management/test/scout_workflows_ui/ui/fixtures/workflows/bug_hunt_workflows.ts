/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License, v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Rich workflow YAML for save/load roundtrip and clone preservation tests.
 * Includes comments, consts, inputs, tags, description, triggers with inputs,
 * and steps with various field types.
 */
export const getRichWorkflowForRoundtripYaml = (name: string) => `# Header comment for roundtrip test
name: ${name}
description: Workflow with rich content for roundtrip preservation
tags:
  - tag1
  - tag2
enabled: false

consts:
  api_key: "secret-123"
  timeout_sec: 30
  retries: 3

# Trigger section comment
triggers:
  - type: manual

inputs:
  - name: message
    type: string
    default: "default message"
  - name: count
    type: number
    default: 1

# Steps section
steps:
  - name: first_step
    type: console
    with:
      message: "Step 1: {{ inputs.message }}"
  - name: second_step
    type: console
    with:
      message: "Step 2: count={{ inputs.count }}, timeout={{ consts.timeout_sec }}"
`;

/**
 * Workflow with duplicate step names - triggers schema validation error.
 */
export const getDuplicateStepNamesYaml = (name: string) => `
name: ${name}
enabled: false
triggers:
  - type: manual
steps:
  - name: duplicate_name
    type: console
    with:
      message: "first"
  - name: duplicate_name
    type: console
    with:
      message: "second"
`;

/**
 * Workflow with many sequential steps (no foreach) to test editor behavior
 * with a large number of steps.
 */
export const getManyStepsWorkflowYaml = (name: string) => {
  const steps = Array.from({ length: 25 }, (_, i) => `  - name: step_${i + 1}
    type: console
    with:
      message: "Step ${i + 1}"`).join('\n');

  return `name: ${name}
enabled: false
description: Workflow with many steps for editor load test
triggers:
  - type: manual
inputs:
  - name: message
    type: string
    default: "x"
steps:
${steps}
`;
};
