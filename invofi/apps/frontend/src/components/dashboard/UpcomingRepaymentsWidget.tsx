'use client';

import Link from 'next/link';
import { CalendarClock, ChevronRight, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrencyAmount, formatDate, formatRelativeDate } from '@/lib/formatters';
import type { Invoice } from '@/types';

interface UpcomingRepaymentsWidgetProps {
  /** All invoices owned by the signed-in originator (any status). */
  invoices: Invoice[];
}

const DAY_SECS = 86_400;

/** Whole day boundaries (ceil) until `dueDate`; negative means already due. */
function daysUntil(dueDate: number): number {
  return Math.ceil((dueDate * 1000 - Date.now()) / (DAY_SECS * 1000));
}

/**
 * "Upcoming repayments" widget for originators (issue #126): lists the
 * originator's Financed invoices sorted by due date, showing amount due and
 * days remaining, with an amber highlight for anything due within 7 days.
 * Presentation-only — each row links to the invoice detail page.
 */
export function UpcomingRepaymentsWidget({ invoices }: UpcomingRepaymentsWidgetProps) {
  const upcoming = invoices
    .filter(inv => inv.status === 'Financed')
    .sort((a, b) => a.due_date - b.due_date)
    .map(inv => ({ invoice: inv, days: daysUntil(inv.due_date) }));

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarClock className="h-4 w-4" /> Upcoming Repayments
        </CardTitle>
        <CardDescription>
          Financed invoices sorted by due date. Entries due within 7 days are highlighted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No financed invoices with upcoming repayments.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {upcoming.map(({ invoice, days }) => {
              const isDueSoon = days <= 7;
              return (
                <li key={invoice.id}>
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-md transition-colors hover:bg-accent ${
                      isDueSoon ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/70' : ''
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-muted-foreground truncate" title={invoice.id}>
                        {invoice.id}
                      </p>
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrencyAmount(invoice.amount, invoice.currency)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{formatDate(invoice.due_date)}</p>
                        <p
                          className={`text-xs font-medium flex items-center justify-end gap-1 ${
                            isDueSoon ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {formatRelativeDate(invoice.due_date)}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}