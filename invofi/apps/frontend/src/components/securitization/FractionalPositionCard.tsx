'use client';

/**
 * FractionalPositionCard
 *
 * Portfolio card for a single fractional position.
 * Displays:
 *  - Token symbol + name
 *  - Fractions held and ownership %
 *  - Current estimated value
 *  - Dividends earned
 *  - Link to the source invoice
 *  - Link to the secondary market to list
 */

import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeDollarSign,
  ChartLine,
  Layers,
  Tag,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FractionalPositionView } from '@/types/securitization';

interface FractionalPositionCardProps {
  view: FractionalPositionView;
  className?: string;
}

export function FractionalPositionCard({ view, className }: FractionalPositionCardProps) {
  const { position, record, currentValue, totalDividendsEarned, ownershipPercent } = view;

  const statusStyles: Record<string, string> = {
    active:   'bg-green-50 text-green-700 border-green-200',
    sold_out: 'bg-gray-50 text-gray-500 border-gray-200',
    cancelled:'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <Card className={cn('flex flex-col hover:shadow-md transition-all', className)}>
      <CardContent className="pt-5 flex-1 flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="font-mono font-semibold text-sm text-foreground truncate">
                {record?.token_symbol ?? '—'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {record?.token_name ?? ''}
            </p>
          </div>
          <Badge
            variant="outline"
            className={`text-xs shrink-0 ${statusStyles[record?.status ?? 'active'] ?? ''}`}
          >
            {record?.status ?? 'active'}
          </Badge>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-4 flex-1">
          <div className="rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <Layers className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Fractions</span>
            </div>
            <p className="text-lg font-bold font-mono text-foreground leading-none">
              {position.fraction_count.toLocaleString()}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {ownershipPercent.toFixed(2)}% of supply
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <ChartLine className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Est. value</span>
            </div>
            <p className="text-base font-bold font-mono text-foreground leading-none">
              {parseFloat(currentValue).toFixed(2)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {position.purchase_currency}
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <BadgeDollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Dividends</span>
            </div>
            <p className="text-base font-bold font-mono text-green-700 dark:text-green-400 leading-none">
              {parseFloat(totalDividendsEarned).toFixed(4)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {position.purchase_currency} earned
            </p>
          </div>

          <div className="rounded-lg border bg-muted/30 p-2.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide block mb-0.5">Purchase price</span>
            <p className="text-base font-bold font-mono text-foreground leading-none">
              {parseFloat(position.purchase_price_per_fraction).toFixed(4)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {position.purchase_currency} / fraction
            </p>
          </div>
        </div>

        {/* Invoice link */}
        {record?.invoice_id && (
          <p className="text-xs text-muted-foreground font-mono mb-3 truncate">
            Invoice:{' '}
            <Link
              href={`/invoices/${record.invoice_id}`}
              className="text-blue-500 hover:underline"
            >
              {record.invoice_id}
            </Link>
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {record?.invoice_id && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/invoices/${record.invoice_id}`}>
                View invoice <ArrowUpRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="ghost" className="flex-1">
            <Link href="/marketplace/positions">
              List for sale
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
