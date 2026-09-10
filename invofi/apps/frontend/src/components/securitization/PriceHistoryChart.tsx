'use client';

/**
 * PriceHistoryChart
 *
 * Renders a lightweight SVG sparkline of fraction token price over time.
 * No external charting library — built with raw SVG path commands to keep
 * the bundle light and fully accessible.
 *
 * Features:
 *  - Polyline with gradient fill
 *  - Hover crosshair with price/date tooltip
 *  - Last-price and change badges
 *  - Loading / empty states
 */

import { useEffect, useRef, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PriceHistoryPoint } from '@/types/securitization';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPrice(p: string): string {
  const n = parseFloat(p);
  if (isNaN(n)) return p;
  return n.toFixed(n < 1 ? 4 : 2);
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildPath(points: { x: number; y: number }[], close = false): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const line = `M ${first.x} ${first.y} ` + rest.map(p => `L ${p.x} ${p.y}`).join(' ');
  return close ? line + ` L ${points[points.length - 1].x} 100 L ${first.x} 100 Z` : line;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PriceHistoryChartProps {
  data: PriceHistoryPoint[];
  currency: string;
  isLoading?: boolean;
  className?: string;
  height?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PriceHistoryChart({
  data,
  currency,
  isLoading = false,
  className,
  height = 120,
}: PriceHistoryChartProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    price: string;
    date: string;
    svgX: number;
  } | null>(null);

  // Derived
  const WIDTH = 500; // viewBox units
  const HEIGHT = 100;
  const PAD = 6;

  const prices = data.map(d => parseFloat(d.price));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const priceRange = maxPrice - minPrice || 1;

  const svgPoints = data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (WIDTH - PAD * 2),
    y: PAD + (1 - (parseFloat(d.price) - minPrice) / priceRange) * (HEIGHT - PAD * 2),
  }));

  const firstPrice = prices[0] ?? 0;
  const lastPrice = prices[prices.length - 1] ?? 0;
  const change = firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0;
  const isUp = change >= 0;

  const lineColor = isUp ? '#22c55e' : '#ef4444';
  const gradientId = `ph-grad-${Math.random().toString(36).slice(2, 7)}`;

  // Mouse tracking
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || data.length < 2) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    // Find nearest data point
    const idx = Math.min(
      Math.max(0, Math.round(((relX - PAD) / (WIDTH - PAD * 2)) * (data.length - 1))),
      data.length - 1,
    );
    const pt = svgPoints[idx];
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      price: data[idx].price,
      date: data[idx].recorded_at,
      svgX: pt.x,
    });
  };

  if (isLoading) {
    return (
      <div
        className={cn('rounded-lg border bg-card animate-pulse', className)}
        style={{ height }}
        aria-busy="true"
        aria-label="Loading price history"
      />
    );
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border bg-card flex items-center justify-center text-xs text-muted-foreground',
          className,
        )}
        style={{ height }}
      >
        No price history yet
      </div>
    );
  }

  return (
    <div className={cn('rounded-lg border bg-card p-3 space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground font-medium">Price history</span>
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold text-foreground">
            {formatPrice(String(lastPrice))} {currency}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium',
              isUp ? 'text-green-600' : 'text-red-500',
            )}
          >
            {isUp ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {isUp ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative select-none" style={{ height }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full h-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Price history chart for ${currency} fraction token`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Fill under line */}
          {svgPoints.length > 1 && (
            <path
              d={buildPath(svgPoints, true)}
              fill={`url(#${gradientId})`}
              strokeWidth="0"
            />
          )}

          {/* Line */}
          {svgPoints.length > 1 && (
            <path
              d={buildPath(svgPoints)}
              fill="none"
              stroke={lineColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Single-point dot */}
          {svgPoints.length === 1 && (
            <circle cx={svgPoints[0].x} cy={svgPoints[0].y} r="3" fill={lineColor} />
          )}

          {/* Hover crosshair vertical line */}
          {hover && (
            <line
              x1={hover.svgX}
              y1={PAD}
              x2={hover.svgX}
              y2={HEIGHT - PAD}
              stroke="currentColor"
              strokeWidth="0.75"
              strokeDasharray="3,2"
              className="text-muted-foreground/60"
            />
          )}
        </svg>

        {/* Tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 rounded border bg-popover shadow px-2 py-1 text-xs text-popover-foreground whitespace-nowrap"
            style={{
              left: Math.min(hover.x + 8, (svgRef.current?.clientWidth ?? 400) - 120),
              top: Math.max(hover.y - 36, 0),
            }}
          >
            <span className="font-mono font-semibold">{formatPrice(hover.price)} {currency}</span>
            <span className="ml-2 text-muted-foreground">{formatDateShort(hover.date)}</span>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      {data.length > 1 && (
        <div className="flex justify-between text-[10px] text-muted-foreground px-1">
          <span>{formatDateShort(data[0].recorded_at)}</span>
          {data.length > 2 && (
            <span>{formatDateShort(data[Math.floor(data.length / 2)].recorded_at)}</span>
          )}
          <span>{formatDateShort(data[data.length - 1].recorded_at)}</span>
        </div>
      )}
    </div>
  );
}
