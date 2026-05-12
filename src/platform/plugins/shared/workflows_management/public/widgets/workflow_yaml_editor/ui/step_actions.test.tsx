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

import { EuiProvider } from '@elastic/eui';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { StepActions } from './step_actions';
import type { StepInfo } from '../../../entities/workflows/store';
import {
  _setComputedDataInternal,
  setActiveTab,
  setCursorPosition,
} from '../../../entities/workflows/store';
import { createMockStore } from '../../../entities/workflows/store/__mocks__/store.mock';
import { getTestProvider } from '../../../shared/mocks/test_providers';

const focusedStepInfo: StepInfo = {
  stepId: 'analyze',
  stepType: 'ai.agent',
  lineStart: 1,
  lineEnd: 5,
  propInfos: {},
} as StepInfo;

const createStoreWithFocusedStep = () => {
  const store = createMockStore();
  store.dispatch(setActiveTab('workflow'));
  store.dispatch(
    _setComputedDataInternal({
      workflowLookup: {
        steps: {
          analyze: focusedStepInfo,
        },
      },
    })
  );
  store.dispatch(setCursorPosition({ lineNumber: 1, column: 1 }));
  return store;
};

const getWrapper = (store: ReturnType<typeof createStoreWithFocusedStep>) => {
  const TestProvider = getTestProvider({ store });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <EuiProvider>
        <TestProvider>{children}</TestProvider>
      </EuiProvider>
    );
  };
};

describe('StepActions', () => {
  it('renders and invokes the continue conversation action', () => {
    const store = createStoreWithFocusedStep();
    const onContinueConversation = jest.fn();
    const aiStepConversation = {
      stepId: 'analyze',
      conversationId: 'conversation-1',
      agentId: 'agent-1',
    };

    render(
      <StepActions
        aiStepConversation={aiStepConversation}
        onContinueConversation={onContinueConversation}
      />,
      { wrapper: getWrapper(store) }
    );

    fireEvent.click(screen.getByLabelText('Continue conversation'));

    expect(onContinueConversation).toHaveBeenCalledWith(aiStepConversation);
  });

  it('hides the continue conversation action when no conversation is available', () => {
    const store = createStoreWithFocusedStep();

    render(<StepActions />, { wrapper: getWrapper(store) });

    expect(screen.queryByLabelText('Continue conversation')).not.toBeInTheDocument();
  });
});
