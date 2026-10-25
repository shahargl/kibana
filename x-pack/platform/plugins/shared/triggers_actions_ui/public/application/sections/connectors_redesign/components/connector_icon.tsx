/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense } from 'react';
import { css } from '@emotion/react';
import type { IconSize, IconType } from '@elastic/eui';
import { EuiIcon, useEuiTheme } from '@elastic/eui';
import type { Direction } from '../types';
import { DIRECTION_ICON } from './status_pills';

interface ConnectorIconProps {
  readonly icon: IconType | undefined;
  readonly size?: IconSize;
  /** Wraps the icon in a rounded square tile, as used in flyout and detail headers. */
  readonly tile?: 'm' | 'l';
}

/** Brand icon for a connector type; lazy spec icons suspend locally, not the whole page. */
export const ConnectorIcon = ({ icon, size = 'xl', tile }: ConnectorIconProps) => {
  const { euiTheme } = useEuiTheme();
  const glyph = (
    <Suspense fallback={<EuiIcon type="empty" size={size} aria-hidden />}>
      <EuiIcon type={icon ?? 'plugs'} size={size} aria-hidden />
    </Suspense>
  );
  if (!tile) return glyph;

  const dimension = tile === 'l' ? euiTheme.size.xxxxl : euiTheme.size.xxxl;
  return (
    <span
      css={css`
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: ${dimension};
        height: ${dimension};
        border-radius: ${euiTheme.border.radius.medium};
        border: ${euiTheme.border.width.thin} solid ${euiTheme.colors.borderBaseSubdued};
        background: ${euiTheme.colors.backgroundBaseSubdued};
      `}
    >
      {glyph}
    </span>
  );
};

export type TileColor = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

interface DirectionTileProps {
  readonly direction: Direction;
  readonly color: TileColor;
  readonly shape?: 'circle' | 'square';
}

/** Arrow glyph on a tinted tile marking outbound (up) or inbound (down) traffic. */
export const DirectionTile = ({ direction, color, shape = 'circle' }: DirectionTileProps) => {
  const { euiTheme } = useEuiTheme();
  const { colors } = euiTheme;
  const tint: Record<TileColor, { background: string; foreground: string }> = {
    success: { background: colors.backgroundLightSuccess, foreground: colors.textSuccess },
    warning: { background: colors.backgroundLightWarning, foreground: colors.textWarning },
    danger: { background: colors.backgroundLightDanger, foreground: colors.textDanger },
    primary: { background: colors.backgroundLightPrimary, foreground: colors.textPrimary },
    neutral: { background: colors.backgroundBaseSubdued, foreground: colors.textSubdued },
  };
  return (
    <span
      css={css`
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: ${euiTheme.size.xxl};
        height: ${euiTheme.size.xxl};
        border-radius: ${shape === 'circle' ? '50%' : euiTheme.border.radius.medium};
        background: ${tint[color].background};
      `}
    >
      <EuiIcon
        type={DIRECTION_ICON[direction]}
        size="m"
        color={tint[color].foreground}
        aria-hidden
      />
    </span>
  );
};
