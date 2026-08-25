'use client';

import { cn } from '@/lib/utils';

interface ApprovalProgressProps {
  /** Distinct approvals collected so far. */
  received: number;
  /** Signatures required before the transaction can execute. */
  required: number;
  className?: string;
}

/**
 * "M of N approvals received" with a proportional bar — the at-a-glance
 * signing status for a queued transaction (issue #219). Turns green once the
 * threshold is met.
 */
export function ApprovalProgress({ received, required, className }: ApprovalProgressProps) {
  const safeRequired = Math.max(1, required);
  // Over-approval is possible (extra co-signers sign before execution); clamp so
  // the bar and the reported aria value never exceed the max.
  const valueNow = Math.min(received, safeRequired);
  const ratio = valueNow / safeRequired;
  const met = received >= safeRequired;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {received} of {safeRequired} approvals received
        </span>
        <span className={cn('text-muted-foreground', met && 'text-green-600 font-medium')}>
          {met ? 'Threshold met' : `${safeRequired - received} more needed`}
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeRequired}
        aria-valuenow={valueNow}
        aria-label={`${received} of ${safeRequired} approvals received`}
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            met ? 'bg-green-600' : 'bg-blue-600',
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
