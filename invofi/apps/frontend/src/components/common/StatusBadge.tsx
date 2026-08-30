'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  Pending:   'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800',
  Financed:  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
  Repaid:    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800',
  Overdue:   'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
  Cancelled: 'bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700',
  Accepted:  'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
  Rejected:  'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800',
  Defaulted: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400 dark:border-orange-800',
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  // `status` is the contract's own identifier (`Pending`, `Financed`, …); the
  // catalogue turns it into display text. An unknown status falls through to
  // the raw identifier rather than rendering an empty badge.
  const t = useTranslations('Status');

  return (
    <Badge
      variant="outline"
      className={cn('font-medium text-xs', STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400', className)}
    >
      {status in STATUS_STYLES ? t(status as keyof typeof STATUS_STYLES) : status}
    </Badge>
  );
}
