/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  Chart,
  CurveType,
  LineSeries,
  ScaleType,
  Settings,
  Tooltip,
  TooltipType,
} from '@elastic/charts';
import { i18n } from '@kbn/i18n';
import { useEuiTheme } from '@elastic/eui';
import { useKibana } from '../../../../common/lib/kibana';
import type { DailyActivity } from '../types';

interface ActivitySparklineProps {
  readonly daily: readonly DailyActivity[];
  readonly showOutbound: boolean;
  readonly showInbound: boolean;
  readonly width?: number;
  readonly height?: number;
}

/** Each series is normalized to its own peak so both shapes stay readable. */
const normalize = (values: readonly number[]): number[] => {
  const peak = Math.max(...values);
  return values.map((value) => (peak > 0 ? value / peak : 0));
};

export const useDirectionColors = () => {
  const { euiTheme } = useEuiTheme();
  return {
    outbound: euiTheme.colors.vis.euiColorVis2,
    inbound: euiTheme.colors.vis.euiColorVis0,
  };
};

export const ActivitySparkline = ({
  daily,
  showOutbound,
  showInbound,
  width = 120,
  height = 40,
}: ActivitySparklineProps) => {
  const { charts } = useKibana().services;
  const baseTheme = charts.theme.useChartsBaseTheme();
  const sparklineTheme = charts.theme.useSparklineOverrides();
  const colors = useDirectionColors();

  const data = useMemo(() => {
    const outbound = normalize(daily.map((day) => day.outbound));
    const inbound = normalize(daily.map((day) => day.inbound));
    return daily.map(({ day }, index) => ({
      day,
      outbound: outbound[index],
      // Keeps the two lines from overlapping when both are flat.
      inbound: inbound[index] * 0.9 + 0.05,
    }));
  }, [daily]);

  return (
    <Chart size={{ width, height }}>
      <Tooltip type={TooltipType.None} />
      <Settings
        baseTheme={baseTheme}
        theme={[sparklineTheme, { chartMargins: { left: 1, right: 1, top: 3, bottom: 3 } }]}
        locale={i18n.getLocale()}
      />
      {showInbound && (
        <LineSeries
          id="inbound"
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="day"
          yAccessors={['inbound']}
          data={data}
          curve={CurveType.CURVE_MONOTONE_X}
          lineSeriesStyle={{
            line: { strokeWidth: 1.5, stroke: colors.inbound },
            point: { visible: 'never' },
          }}
        />
      )}
      {showOutbound && (
        <LineSeries
          id="outbound"
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="day"
          yAccessors={['outbound']}
          data={data}
          curve={CurveType.CURVE_MONOTONE_X}
          lineSeriesStyle={{
            line: { strokeWidth: 1.5, stroke: colors.outbound },
            point: { visible: 'never' },
          }}
        />
      )}
    </Chart>
  );
};
