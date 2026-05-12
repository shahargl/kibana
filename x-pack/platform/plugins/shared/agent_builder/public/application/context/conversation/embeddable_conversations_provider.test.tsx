/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { EmbeddableConversationsProvider } from './embeddable_conversations_provider';
import { useConversationContext } from './conversation_context';
import type { AgentBuilderInternalService } from '../../../services';

jest.mock('@kbn/kibana-react-plugin/public', () => {
  const ReactActual = jest.requireActual<typeof React>('react');

  return {
    KibanaContextProvider: ({ children }: { children: React.ReactNode }) =>
      ReactActual.createElement(ReactActual.Fragment, null, children),
    useKibana: () => ({
      services: {
        notifications: { toasts: {} },
        plugins: {},
      },
    }),
  };
});

jest.mock('./conversation_change_notifier', () => ({
  ConversationChangeNotifier: () => null,
}));

jest.mock('../../hooks/use_persisted_conversation_id', () => {
  const ReactActual = jest.requireActual<typeof React>('react');

  return {
    usePersistedConversationId: () => {
      const [persistedConversationId, setPersistedConversationId] = ReactActual.useState<string>();

      return {
        persistedConversationId,
        updatePersistedConversationId: setPersistedConversationId,
      };
    },
  };
});

const ContextProbe = ({
  onContext,
}: {
  onContext?: (context: ConversationContextValue) => void;
}) => {
  const context = useConversationContext();

  useEffect(() => {
    onContext?.(context);
  }, [context, onContext]);

  return <span data-test-subj="conversation-id">{context.conversationId ?? ''}</span>;
};

type ConversationContextValue = ReturnType<typeof useConversationContext>;

const createServices = (getConversation: jest.Mock): AgentBuilderInternalService =>
  ({
    conversationsService: {
      get: getConversation,
    },
    startDependencies: {},
    chatService: {},
    eventsService: {},
  } as unknown as AgentBuilderInternalService);

describe('EmbeddableConversationsProvider', () => {
  it('validates and restores an explicit conversation ID', async () => {
    const getConversation = jest.fn().mockResolvedValue({
      id: 'conversation-1',
      agent_id: 'agent-1',
    });
    const onContext = jest.fn();

    render(
      <EmbeddableConversationsProvider
        coreStart={{} as never}
        services={createServices(getConversation)}
        conversationId="conversation-1"
        agentId="agent-1"
        onClose={jest.fn()}
        ariaLabelledBy="agent-builder-sidebar"
      >
        <ContextProbe onContext={onContext} />
      </EmbeddableConversationsProvider>
    );

    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith({ conversationId: 'conversation-1' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('conversation-id')).toHaveTextContent('conversation-1');
    });

    expect(onContext).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: 'conversation-1',
        agentId: 'agent-1',
      })
    );
  });

  it('does not restore an invalid explicit conversation ID', async () => {
    const getConversation = jest.fn().mockRejectedValue(new Error('Not found'));

    render(
      <EmbeddableConversationsProvider
        coreStart={{} as never}
        services={createServices(getConversation)}
        conversationId="missing-conversation"
        onClose={jest.fn()}
        ariaLabelledBy="agent-builder-sidebar"
      >
        <ContextProbe />
      </EmbeddableConversationsProvider>
    );

    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith({ conversationId: 'missing-conversation' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('conversation-id')).toHaveTextContent('');
    });
  });
});
