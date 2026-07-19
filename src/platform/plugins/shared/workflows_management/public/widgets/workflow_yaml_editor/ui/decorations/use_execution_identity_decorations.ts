/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useMemo, useRef } from 'react';
import type { Document, Pair, Scalar } from 'yaml';
import { isMap, isPair, isScalar } from 'yaml';
import { monaco } from '@kbn/code-editor';
import {
  type ExecutionIdentitySummary,
  getExecutionIdentityProjectLogoDataUrl,
  useExecutionIdentity,
} from '../../../../entities/execution_identities/model/use_execution_identities';
import { getMonacoRangeFromYamlNode } from '../../lib/utils';

interface UseExecutionIdentityDecorationsProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  yamlDocument: Document | null;
  isEditorMounted: boolean;
}

type ScalarPair = Pair<Scalar, Scalar> & { value: Scalar };

const asInlineCode = (value: string): string => `\`${value.replaceAll('`', "'")}\``;

export const getExecutionIdentityHoverMessage = (
  identity: ExecutionIdentitySummary
): monaco.IMarkdownString => {
  const roleNames = [
    ...new Set(identity.projectAssignments.flatMap((assignment) => assignment.roleNames)),
  ];
  const projectLines = identity.projectAssignments.flatMap((assignment) =>
    assignment.projectIds.map(
      (projectId) =>
        `- <img src="${getExecutionIdentityProjectLogoDataUrl(
          assignment.projectType
        )}" alt="" width="16" height="16"> ${assignment.projectType}: ${asInlineCode(projectId)}`
    )
  );
  return {
    value: [
      `**Service account:** ${identity.name}`,
      identity.description ? `\n\n${identity.description}` : '',
      `\n\n**Roles:** ${roleNames.length > 0 ? roleNames.map(asInlineCode).join(', ') : 'None'}`,
      `\n\n**Projects:**\n\n${projectLines.length > 0 ? projectLines.join('\n') : 'None'}`,
    ].join(''),
    supportHtml: true,
    isTrusted: true,
  };
};

const findRunAsPair = (yamlDocument: Document): ScalarPair | null => {
  if (!isMap(yamlDocument.contents)) {
    return null;
  }
  const settingsPair = yamlDocument.contents.items.find(
    (item) => isPair(item) && isScalar(item.key) && item.key.value === 'settings'
  );
  if (!settingsPair || !isMap(settingsPair.value)) {
    return null;
  }
  const runAsPair = settingsPair.value.items.find(
    (item): item is Pair<Scalar, Scalar> =>
      isPair(item) && isScalar(item.key) && item.key.value === 'run_as'
  );
  return runAsPair && isScalar(runAsPair.value) ? (runAsPair as ScalarPair) : null;
};

const createExecutionIdentityDecoration = (
  model: monaco.editor.ITextModel,
  runAsPair: ScalarPair,
  identity: ExecutionIdentitySummary
): monaco.editor.IModelDeltaDecoration | null => {
  const valueRange = getMonacoRangeFromYamlNode(model, runAsPair.value);
  if (!valueRange) {
    return null;
  }
  return {
    range: new monaco.Range(
      valueRange.startLineNumber,
      valueRange.startColumn,
      valueRange.startLineNumber,
      valueRange.startColumn + 1
    ),
    options: {
      stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      hoverMessage: getExecutionIdentityHoverMessage(identity),
      before: {
        content: `✓\u00a0${identity.name}`,
        cursorStops: monaco.editor.InjectedTextCursorStops.None,
        inlineClassName: 'execution-identity-name-badge',
      },
    },
  };
};

export const useExecutionIdentityDecorations = ({
  editor,
  yamlDocument,
  isEditorMounted,
}: UseExecutionIdentityDecorationsProps): void => {
  const runAsPair = useMemo(
    () => (yamlDocument ? findRunAsPair(yamlDocument) : null),
    [yamlDocument]
  );
  const identityId = typeof runAsPair?.value.value === 'string' ? runAsPair.value.value : undefined;
  const { data: identity } = useExecutionIdentity(identityId);
  const decorationCollectionRef = useRef<monaco.editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    if (!isEditorMounted || !editor || !yamlDocument) {
      return;
    }
    decorationCollectionRef.current?.clear();
    decorationCollectionRef.current = null;

    const model = editor.getModel();
    if (!model || !runAsPair) {
      return;
    }
    if (!identity) {
      return;
    }
    const decoration = createExecutionIdentityDecoration(model, runAsPair, identity);
    if (decoration) {
      decorationCollectionRef.current = editor.createDecorationsCollection([decoration]);
    }
  }, [editor, identity, isEditorMounted, runAsPair, yamlDocument]);
};
