'use client';

/**
 * MatchQualityBadge
 *
 * Displays a coloured badge representing the match quality tier
 * (excellent / good / fair / poor) with an optional score tooltip.
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { MatchQuality } from '@/types/matching';

const QUALITY_STYLES: Record<MatchQuality, string> = {
  excellent: 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-700',
  good:      'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-700',
  fair:      'bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-700',
  poor:      'bg-gray-50 text-gray-500 border-gray-300 dark:bg-gray-900/20 dark:text-gray-400 dark:border-gray-600',
};

const QUALITY_LABELS: Record<MatchQuality, string> = {
  excellent: '★ Excellent match',
  good:      '✓ Good match',
  fair:      '~ Fair match',
  poor:      '○ Poor match',
};

interface MatchQualityBadgeProps {
  quality: MatchQuality;
  /** When provided, appended as "(score)" in the badge text. */
  score?: number;
  className?: string;
  /** Render a compact version without the label prefix. */
  compact?: boolean;
}

export function MatchQualityBadge({
  quality,
  score,
  className,
  compact = false,
}: MatchQualityBadgeProps) {
  const label = compact
    ? quality.charAt(0).toUpperCase() + quality.slice(1)
    : QUALITY_LABELS[quality];

  return (
    <Badge
      variant="outline"
      className={cn(
        'font-medium text-xs whitespace-nowrap',
        QUALITY_STYLES[quality],
        className,
      )}
      title={score !== undefined ? `Match score: ${score}/100` : undefined}
    >
      {label}
      {score !== undefined && !compact && (
        <span className="ms-1 opacity-60">({score})</span>
      )}
    </Badge>
  );
}
