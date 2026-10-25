/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import moment from 'moment';
import { Axis, BarSeries, Chart, Position, ScaleType, Settings } from '@elastic/charts';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { useKibana } from '../../../../../common/lib/kibana';
import { useDirectionColors } from '../../components/activity_sparkline';
import type { Connection } from '../../types';

const Y_AXIS_WIDTH = 44;

const OUTBOUND_SERIES = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.details.outboundSeries',
  { defaultMessage: 'Outbound actions' }
);
const INBOUND_SERIES = i18n.translate(
  'xpack.triggersActionsUI.connectorsRedesign.details.inboundSeries',
  { defaultMessage: 'Inbound events' }
);

const LegendItem = ({ color, label, value }: { color: string; label: string; value: string }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <span
          css={css`
            display: inline-block;
            width: ${euiTheme.size.m};
            height: ${euiTheme.size.m};
            border-radius: 50%;
            background: ${color};
          `}
        />
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiText size="s">
          {label} · <strong>{value}</strong>
        </EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface ActivityChartProps {
  readonly connection: Connection;
  readonly onViewActivity?: () => void;
  readonly height?: number;
}

export const ActivityChart = ({ connection, onViewActivity, height = 180 }: ActivityChartProps) => {
  const { charts } = useKibana().services;
  const baseTheme = charts.theme.useChartsBaseTheme();
  const colors = useDirectionColors();
  const { daily, totals, entry } = connection;
  const hasOutbound = Boolean(entry?.outbound);
  const hasInbound = Boolean(entry?.inbound);

  const data = useMemo(
    () =>
      daily.flatMap(({ day, outbound, inbound }) => [
        ...(hasOutbound ? [{ day, series: OUTBOUND_SERIES, count: outbound }] : []),
        ...(hasInbound ? [{ day, series: INBOUND_SERIES, count: inbound }] : []),
      ]),
    [daily, hasOutbound, hasInbound]
  );

  return (
    <EuiPanel hasBorder paddingSize="l" data-test-subj="connectionActivityPanel">
      <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.activityTitle', {
                defaultMessage: 'Activity (last 7 days)',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
        {onViewActivity && (
          <EuiFlexItem grow={false}>
            <EuiLink onClick={onViewActivity} data-test-subj="viewActivityLink">
              {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.viewActivity', {
                defaultMessage: 'View activity →',
              })}
            </EuiLink>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="xl" alignItems="center">
        <EuiFlexItem grow={4} css={{ minWidth: 0 }}>
          <Chart size={{ height }}>
            <Settings
              baseTheme={baseTheme}
              locale={i18n.getLocale()}
              showLegend={false}
              theme={{
                barSeriesStyle: { rect: { widthRatio: 0.55 } },
                chartMargins: { left: 0, right: 0, top: 4, bottom: 0 },
              }}
            />
            <Axis
              id="day"
              position={Position.Bottom}
              tickFormat={(value: number) => moment(value).format('MMM D')}
              gridLine={{ visible: false }}
            />
            <Axis
              id="count"
              position={Position.Left}
              ticks={5}
              gridLine={{ visible: true, dash: [2, 3] }}
              style={{ axisLine: { visible: false }, tickLine: { visible: false } }}
              tickFormat={(value: number) => value.toLocaleString()}
            />
            <BarSeries
              id="activity"
              xScaleType={ScaleType.Ordinal}
              yScaleType={ScaleType.Linear}
              xAccessor="day"
              yAccessors={['count']}
              splitSeriesAccessors={['series']}
              data={data}
              color={({ splitAccessors }) =>
                splitAccessors.get('series') === INBOUND_SERIES ? colors.inbound : colors.outbound
              }
            />
          </Chart>
          {hasOutbound && (
            <EuiFlexGroup
              gutterSize="none"
              responsive={false}
              css={css`
                padding-left: ${Y_AXIS_WIDTH}px;
              `}
            >
              {daily.map(({ day, outboundFailures }) => (
                <EuiFlexItem key={day}>
                  <EuiText size="xs" color="subdued" textAlign="center">
                    {i18n.translate('xpack.triggersActionsUI.connectorsRedesign.details.failures', {
                      defaultMessage: '{count, plural, one {# failure} other {# failures}}',
                      values: { count: outboundFailures },
                    })}
                  </EuiText>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={1} css={{ minWidth: 220 }}>
          <EuiFlexGroup direction="column" gutterSize="m">
            {hasOutbound && (
              <LegendItem
                color={colors.outbound}
                label={OUTBOUND_SERIES}
                value={i18n.translate(
                  'xpack.triggersActionsUI.connectorsRedesign.details.executedCount',
                  {
                    defaultMessage: '{count} executed',
                    values: { count: totals.outbound.toLocaleString() },
                  }
                )}
              />
            )}
            {hasInbound && (
              <LegendItem
                color={colors.inbound}
                label={INBOUND_SERIES}
                value={i18n.translate(
                  'xpack.triggersActionsUI.connectorsRedesign.details.receivedCount',
                  {
                    defaultMessage: '{count} received',
                    values: { count: totals.inbound.toLocaleString() },
                  }
                )}
              />
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};
