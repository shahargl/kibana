/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ReactNode } from 'react';
import { css } from '@emotion/react';
import type { IconType } from '@elastic/eui';
import { EuiIcon, useEuiFontSize, useEuiTheme } from '@elastic/eui';

export type PillColor = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

export interface PillProps {
  readonly color: PillColor;
  readonly iconType?: IconType;
  /** Renders a filled status dot instead of an icon. */
  readonly dot?: boolean;
  /** Tints border and background with `color`; neutral pills only tint the icon. */
  readonly tinted?: boolean;
  readonly children: ReactNode;
  readonly 'data-test-subj'?: string;
}

/** Compact bordered label used for capabilities, health and ACL status. */
export const Pill = ({
  color,
  iconType,
  dot,
  tinted = true,
  children,
  'data-test-subj': dataTestSubj,
}: PillProps) => {
  const { euiTheme } = useEuiTheme();
  const { colors, border, size, font } = euiTheme;
  const { fontSize } = useEuiFontSize('xs');

  const foreground: Record<PillColor, string> = {
    success: colors.textSuccess,
    warning: colors.textWarning,
    danger: colors.textDanger,
    primary: colors.textPrimary,
    neutral: colors.textSubdued,
  };
  const background: Record<PillColor, string> = {
    success: colors.backgroundBaseSuccess,
    warning: colors.backgroundBaseWarning,
    danger: colors.backgroundBaseDanger,
    primary: colors.backgroundBasePrimary,
    neutral: colors.backgroundBaseSubdued,
  };
  const borderColor: Record<PillColor, string> = {
    success: colors.borderBaseSuccess,
    warning: colors.borderBaseWarning,
    danger: colors.borderBaseDanger,
    primary: colors.borderBasePrimary,
    neutral: colors.borderBasePlain,
  };
  const dotColor: Record<PillColor, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    primary: colors.primary,
    neutral: colors.mediumShade,
  };

  const tint = tinted ? color : 'neutral';

  return (
    <span
      data-test-subj={dataTestSubj}
      css={css`
        display: inline-flex;
        align-items: center;
        gap: ${size.xs};
        max-width: 100%;
        padding: 0 ${size.s};
        min-height: ${size.l};
        border: ${border.width.thin} solid ${borderColor[tint]};
        border-radius: ${border.radius.small};
        background: ${background[tint]};
        color: ${tinted ? foreground[color] : colors.textParagraph};
        font-size: ${fontSize};
        font-weight: ${font.weight.medium};
        line-height: ${size.base};
        white-space: nowrap;
      `}
    >
      {dot && (
        <span
          aria-hidden
          css={css`
            flex: none;
            width: ${size.s};
            height: ${size.s};
            border-radius: 50%;
            background: ${dotColor[color]};
          `}
        />
      )}
      {!dot && iconType && (
        <EuiIcon type={iconType} size="s" color={foreground[color]} aria-hidden />
      )}
      <span
        css={css`
          overflow: hidden;
          text-overflow: ellipsis;
        `}
      >
        {children}
      </span>
    </span>
  );
};
