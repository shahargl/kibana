/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with,
 * at your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JsonValue } from '@kbn/utility-types';
import type { StepInfo } from '../../../entities/workflows/store';
import { getValueFromValueNode } from '../../../entities/workflows/store/workflow_detail/utils/build_workflow_lookup';
import type { StepExecutionData } from '../lib/execution_context/build_execution_context';

export interface AiStepConversation {
  stepId: string;
  conversationId: string;
  agentId?: string;
}

const AI_AGENT_STEP_TYPE = 'ai.agent';
const CONVERSATION_ID_PATH = 'with.conversation_id';
const AGENT_ID_PATH = 'agent-id';

const isRecord = (value: JsonValue | undefined): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isConcreteString = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  !value.includes('{{') &&
  !value.includes('{%');

const getConcreteStepValue = (stepInfo: StepInfo, path: string): string | undefined => {
  const valueNode = stepInfo.propInfos[path]?.valueNode;
  if (!valueNode) {
    return undefined;
  }

  const value = getValueFromValueNode(valueNode);
  return isConcreteString(value) ? value.trim() : undefined;
};

const getStepAgentId = (stepInfo: StepInfo): string | undefined =>
  getConcreteStepValue(stepInfo, AGENT_ID_PATH);

export const getAiStepConversationFromLiteralInput = (
  stepInfo: StepInfo | undefined
): AiStepConversation | undefined => {
  if (!stepInfo || stepInfo.stepType !== AI_AGENT_STEP_TYPE) {
    return undefined;
  }

  const conversationId = getConcreteStepValue(stepInfo, CONVERSATION_ID_PATH);
  if (!conversationId) {
    return undefined;
  }

  return {
    stepId: stepInfo.stepId,
    conversationId,
    agentId: getStepAgentId(stepInfo),
  };
};

export const getAiStepConversationFromExecutionOutput = (
  stepInfo: StepInfo | undefined,
  stepExecutionData: StepExecutionData | null
): AiStepConversation | undefined => {
  if (
    !stepInfo ||
    stepInfo.stepType !== AI_AGENT_STEP_TYPE ||
    !isRecord(stepExecutionData?.output)
  ) {
    return undefined;
  }

  const conversationId = stepExecutionData.output.conversation_id;
  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    return undefined;
  }

  return {
    stepId: stepInfo.stepId,
    conversationId: conversationId.trim(),
    agentId: getStepAgentId(stepInfo),
  };
};
