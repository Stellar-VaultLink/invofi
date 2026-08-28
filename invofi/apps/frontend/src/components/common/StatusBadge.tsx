'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  Pending:   'bg-yellow-50 text-yellow-700 border-yellow-200',
  Financed:  'bg-blue-50 text-blue-700 border-blue-200',
  Repaid:    'bg-green-50 text-green-700 border-green-200',
  Overdue:   'bg-red-50 text-red-700 border-red-200',
  Cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
  Accepted:  'bg-blue-50 text-blue-700 border-blue-200',
  Rejected:  'bg-red-50 text-red-700 border-red-200',
  Defaulted: 'bg-orange-50 text-orange-700 border-orange-200',
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
      className={cn('font-medium text-xs', STATUS_STYLES[status] ?? 'bg-gray-50 text-gray-500', className)}
    >
      {status in STATUS_STYLES ? t(status as keyof typeof STATUS_STYLES) : status}
    </Badge>
  );
}
