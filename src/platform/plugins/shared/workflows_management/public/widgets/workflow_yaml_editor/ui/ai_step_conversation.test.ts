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

import {
  getAiStepConversationFromExecutionOutput,
  getAiStepConversationFromLiteralInput,
} from './ai_step_conversation';
import type { StepInfo } from '../../../entities/workflows/store';

const scalar = (value: unknown) => ({ value });

const createStepInfo = ({
  stepType = 'ai.agent',
  conversationId,
  agentId,
}: {
  stepType?: string;
  conversationId?: unknown;
  agentId?: unknown;
} = {}): StepInfo =>
  ({
    stepId: 'analyze',
    stepType,
    lineStart: 1,
    lineEnd: 5,
    propInfos: {
      ...(conversationId !== undefined
        ? {
            'with.conversation_id': {
              path: ['with', 'conversation_id'],
              valueNode: scalar(conversationId),
            },
          }
        : {}),
      ...(agentId !== undefined
        ? {
            'agent-id': {
              path: ['agent-id'],
              valueNode: scalar(agentId),
            },
          }
        : {}),
    },
  } as StepInfo);

describe('ai step conversation helpers', () => {
  it('returns a literal ai.agent conversation id and agent id', () => {
    expect(
      getAiStepConversationFromLiteralInput(
        createStepInfo({ conversationId: ' conversation-1 ', agentId: 'agent-1' })
      )
    ).toEqual({
      stepId: 'analyze',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
    });
  });

  it('ignores templated literal conversation ids', () => {
    expect(
      getAiStepConversationFromLiteralInput(
        createStepInfo({ conversationId: '{{ steps.previous.output.conversation_id }}' })
      )
    ).toBeUndefined();
  });

  it('ignores non-agent steps', () => {
    expect(
      getAiStepConversationFromLiteralInput(
        createStepInfo({ stepType: 'console', conversationId: 'conversation-1' })
      )
    ).toBeUndefined();
  });

  it('returns an ai.agent conversation id from execution output', () => {
    expect(
      getAiStepConversationFromExecutionOutput(createStepInfo({ agentId: 'agent-1' }), {
        output: {
          conversation_id: ' conversation-1 ',
          message: 'Hello',
        },
      })
    ).toEqual({
      stepId: 'analyze',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
    });
  });

  it('ignores execution output without a concrete conversation id', () => {
    expect(
      getAiStepConversationFromExecutionOutput(createStepInfo(), {
        output: {
          message: 'Hello',
        },
      })
    ).toBeUndefined();
  });
});
