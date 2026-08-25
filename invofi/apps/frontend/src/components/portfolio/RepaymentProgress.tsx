'use client';

// ── Streaming repayment progress bar (issue #221) ────────────────────────────
// Fills as repayments stream in, animating the width transition so partial
// repayments are visually obvious without a full refresh.

import { cn } from '@/lib/utils';

interface RepaymentProgressProps {
  /** Ratio 0..1 of total due already repaid. */
  value: number;
  className?: string;
  label?: string;
}

export function RepaymentProgress({ value, className, label = 'Repayment progress' }: RepaymentProgressProps) {
  const clamped = Math.min(1, Math.max(0, value));
  const pct = Math.round(clamped * 100);

  return (
    <div
      className={cn('w-full', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-500 transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}