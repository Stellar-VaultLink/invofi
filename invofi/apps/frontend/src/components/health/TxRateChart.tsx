'use client';

// TxRateChart — pure-SVG transaction success/failure rate chart.
//
// Renders a stacked bar chart showing hourly tx_success / tx_failure counts
// from `health_metrics` rows. No external chart library — only SVG primitives
// and CSS.  Responsive via a viewBox approach; the outer <div> controls the
// visual width and the SVG scales inside it.
//
// Used by: src/app/dashboard/health/page.tsx

import { useMemo } from 'react';
import type { HealthMetric } from '@/lib/health/types';
import { txFailureRate } from '@/lib/health/types';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Format a bucket_start ISO string as a short label (e.g. "14:00", "Mon"). */
function bucketLabel(iso: string, showDate: boolean): string {
  const d = new Date(iso);
  if (showDate) {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface TxRateChartProps {
  /** Health metric rows, ordered oldest → newest. */
  metrics: HealthMetric[];
  /** Whether to show date labels on X axis (vs. time labels for <24h view). */
  showDateLabels?: boolean;
  /** Chart height in px (default 180). */
  height?: number;
  /** Max bars to display — sampled evenly from the full array (default 40). */
  maxBars?: number;
}

// ── constants ─────────────────────────────────────────────────────────────────

const VIEWBOX_W = 640;
const BAR_GAP = 2;
const LABEL_H = 18;
const Y_AXIS_W = 34;
const COLOR_SUCCESS = '#22c55e'; // green-500
const COLOR_FAILURE = '#ef4444'; // red-500
const COLOR_GRID = '#e5e7eb';    // gray-200 (dark: handled via CSS var)

// ── component ─────────────────────────────────────────────────────────────────

export function TxRateChart({
  metrics,
  showDateLabels = false,
  height = 180,
  maxBars = 40,
}: TxRateChartProps) {
  // Sample evenly if there are too many bars.
  const sampled = useMemo<HealthMetric[]>(() => {
    if (metrics.length <= maxBars) return metrics;
    const step = metrics.length / maxBars;
    return Array.from({ length: maxBars }, (_, i) => metrics[Math.floor(i * step)]);
  }, [metrics, maxBars]);

  const plotH = height - LABEL_H;
  const totalW = VIEWBOX_W - Y_AXIS_W;
  const barW = sampled.length > 0
    ? Math.max(2, Math.floor((totalW - BAR_GAP) / sampled.length) - BAR_GAP)
    : 10;

  const maxTotal = useMemo(
    () => Math.max(1, ...sampled.map(m => m.tx_success + m.tx_failure)),
    [sampled],
  );

  // Build bar data.
  const bars = useMemo(
    () =>
      sampled.map((m, i) => {
        const total = m.tx_success + m.tx_failure;
        const successH = total === 0 ? 0 : Math.round((m.tx_success / maxTotal) * plotH);
        const failureH = total === 0 ? 0 : Math.round((m.tx_failure / maxTotal) * plotH);
        const x = Y_AXIS_W + i * (barW + BAR_GAP);
        return { m, x, successH, failureH, total };
      }),
    [sampled, barW, maxTotal, plotH],
  );

  // Y-axis grid lines at 0%, 25%, 50%, 75%, 100%.
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
    y: Math.round(plotH * (1 - pct)),
    label: `${Math.round(pct * maxTotal)}`,
  }));

  // Build label positions — only show ~5 labels to avoid crowding.
  const labelStep = Math.max(1, Math.floor(sampled.length / 5));
  const labels = sampled
    .filter((_, i) => i % labelStep === 0)
    .map((m, i) => ({
      x: Y_AXIS_W + (i * labelStep) * (barW + BAR_GAP) + barW / 2,
      text: bucketLabel(m.bucket_start, showDateLabels),
    }));

  if (sampled.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground"
        style={{ height }}
        role="img"
        aria-label="No transaction data available"
      >
        No data for this time range
      </div>
    );
  }

  // Overall failure rate for the summary text.
  const totalSuccess = sampled.reduce((s, m) => s + m.tx_success, 0);
  const totalFailure = sampled.reduce((s, m) => s + m.tx_failure, 0);
  const overallFailRate = txFailureRate({
    tx_success: totalSuccess,
    tx_failure: totalFailure,
  } as HealthMetric);

  return (
    <div className="space-y-2">
      {/* Summary line */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: COLOR_SUCCESS }}
            aria-hidden="true"
          />
          Success: {totalSuccess.toLocaleString()}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ background: COLOR_FAILURE }}
            aria-hidden="true"
          />
          Failure: {totalFailure.toLocaleString()}
        </span>
        <span
          className={
            overallFailRate > 0.1
              ? 'text-red-600 dark:text-red-400 font-medium'
              : 'text-green-600 dark:text-green-400 font-medium'
          }
        >
          Failure rate: {(overallFailRate * 100).toFixed(1)}%
        </span>
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={`Transaction success/failure bar chart. Overall failure rate ${(overallFailRate * 100).toFixed(1)}%.`}
        className="overflow-visible"
      >
        {/* Grid lines */}
        {gridLines.map(({ y, label }) => (
          <g key={y}>
            <line
              x1={Y_AXIS_W}
              y1={y}
              x2={VIEWBOX_W}
              y2={y}
              stroke={COLOR_GRID}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
            <text
              x={Y_AXIS_W - 4}
              y={y + 4}
              textAnchor="end"
              fontSize={10}
              className="fill-muted-foreground"
            >
              {label}
            </text>
          </g>
        ))}

        {/* Bars */}
        {bars.map(({ m, x, successH, failureH }) => {
          const successY = plotH - successH - failureH;
          const failureY = plotH - failureH;
          return (
            <g key={m.bucket_start} role="graphics-symbol" aria-label={`${m.bucket_start}: ${m.tx_success} success, ${m.tx_failure} failure`}>
              {successH > 0 && (
                <rect
                  x={x}
                  y={successY}
                  width={barW}
                  height={successH}
                  fill={COLOR_SUCCESS}
                  opacity={0.85}
                  rx={1}
                >
                  <title>{`${bucketLabel(m.bucket_start, showDateLabels)}: ${m.tx_success} success`}</title>
                </rect>
              )}
              {failureH > 0 && (
                <rect
                  x={x}
                  y={failureY}
                  width={barW}
                  height={failureH}
                  fill={COLOR_FAILURE}
                  opacity={0.85}
                  rx={1}
                >
                  <title>{`${bucketLabel(m.bucket_start, showDateLabels)}: ${m.tx_failure} failure`}</title>
                </rect>
              )}
            </g>
          );
        })}

        {/* X-axis labels */}
        {labels.map(({ x, text }) => (
          <text
            key={x}
            x={x}
            y={plotH + LABEL_H - 2}
            textAnchor="middle"
            fontSize={9}
            className="fill-muted-foreground"
          >
            {text}
          </text>
        ))}
      </svg>
    </div>
  );
}

// ── Sparkline (mini single-line trend) ───────────────────────────────────────

export interface SparklineProps {
  /** Values from oldest to newest. */
  values: number[];
  /** Stroke colour (default: currentColor). */
  color?: string;
  width?: number;
  height?: number;
  /** Fill under the line (default false). */
  fill?: boolean;
}

/**
 * A minimal SVG polyline sparkline — used inside KPI cards for trend lines.
 */
export function Sparkline({
  values,
  color = 'currentColor',
  width = 80,
  height = 28,
  fill = false,
}: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const step = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const polyline = points.join(' ');

  const areaPoints = [
    `0,${height}`,
    ...points,
    `${width},${height}`,
  ].join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className="overflow-visible"
    >
      {fill && (
        <polygon points={areaPoints} fill={color} opacity={0.12} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
