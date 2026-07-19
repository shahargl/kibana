/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { renderHook, waitFor } from '@testing-library/react';
import { parseDocument } from 'yaml';
import type { monaco } from '@kbn/code-editor';
import { useExecutionIdentityDecorations } from './use_execution_identity_decorations';

let mockExecutionIdentity: {
  id: string;
  name: string;
  description?: string;
  projectAssignments: Array<{
    projectType: string;
    projectIds: string[];
    roleNames: string[];
  }>;
} | null = null;

jest.mock('../../../../entities/execution_identities/model/use_execution_identities', () => ({
  getExecutionIdentityProjectLogoDataUrl: () => 'data:image/svg+xml,security-logo',
  useExecutionIdentity: (identityId?: string) => ({
    data: mockExecutionIdentity?.id === identityId ? mockExecutionIdentity : undefined,
  }),
}));

jest.mock('@kbn/code-editor', () => {
  const actualCodeEditor = jest.requireActual('@kbn/code-editor');
  return {
    ...actualCodeEditor,
    monaco: {
      ...actualCodeEditor.monaco,
      Range: jest.fn((startLine: number, startCol: number, endLine: number, endCol: number) => ({
        startLineNumber: startLine,
        startColumn: startCol,
        endLineNumber: endLine,
        endColumn: endCol,
      })),
    },
  };
});

const createMockEditor = (value: string) => {
  const lines = value.split('\n');
  const model = {
    getValue: jest.fn(() => value),
    getLineContent: jest.fn((lineNumber: number) => lines[lineNumber - 1] ?? ''),
    getPositionAt: jest.fn((offset: number) => {
      let remaining = offset;
      for (let index = 0; index < lines.length; index++) {
        if (remaining <= lines[index].length) {
          return { lineNumber: index + 1, column: remaining + 1 };
        }
        remaining -= lines[index].length + 1;
      }
      return { lineNumber: lines.length, column: lines.at(-1)!.length + 1 };
    }),
  } as unknown as monaco.editor.ITextModel;
  return {
    getModel: jest.fn(() => model),
    createDecorationsCollection: jest.fn(),
  } as unknown as monaco.editor.IStandaloneCodeEditor;
};

describe('useExecutionIdentityDecorations', () => {
  beforeEach(() => {
    mockExecutionIdentity = null;
  });

  it('shows the resolved service account name before settings.run_as', async () => {
    const identityId = '11b7b80f-2675-4b5e-bd0f-9a197c768ae2';
    const yaml = `name: test
settings:
  run_as: ${identityId}
triggers:
  - type: manual
steps: []`;
    const editor = createMockEditor(yaml);
    mockExecutionIdentity = {
      id: identityId,
      name: 'Workflow reader',
      description: 'Reads workflow data',
      projectAssignments: [
        {
          projectType: 'security',
          projectIds: ['project-1'],
          roleNames: ['viewer'],
        },
      ],
    };

    renderHook(() =>
      useExecutionIdentityDecorations({
        editor,
        yamlDocument: parseDocument(yaml, { keepSourceTokens: true }),
        isEditorMounted: true,
      })
    );

    await waitFor(() => expect(editor.createDecorationsCollection).toHaveBeenCalledTimes(1));
    expect(editor.createDecorationsCollection).toHaveBeenCalledWith([
      expect.objectContaining({
        options: expect.objectContaining({
          before: expect.objectContaining({
            content: '✓\u00a0Workflow reader',
            inlineClassName: 'execution-identity-name-badge',
          }),
          hoverMessage: expect.objectContaining({
            value: expect.stringContaining(
              '**Roles:** `viewer`\n\n**Projects:**\n\n- <img src="data:image/svg+xml,'
            ),
            supportHtml: true,
            isTrusted: true,
          }),
        }),
      }),
    ]);
  });

  it('does not decorate an unknown service account ID', async () => {
    const yaml = `name: test
settings:
  run_as: missing-id
triggers:
  - type: manual
steps: []`;
    const editor = createMockEditor(yaml);
    mockExecutionIdentity = {
      id: 'another-id',
      name: 'Another identity',
      projectAssignments: [],
    };

    renderHook(() =>
      useExecutionIdentityDecorations({
        editor,
        yamlDocument: parseDocument(yaml, { keepSourceTokens: true }),
        isEditorMounted: true,
      })
    );

    await waitFor(() => expect(editor.getModel).toHaveBeenCalled());
    expect(editor.createDecorationsCollection).not.toHaveBeenCalled();
  });
});
