'use client';

import { Bell, Loader2, Mail, Webhook, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInvoiceReminders } from '@/hooks/useInvoiceReminders';
import { STAGE_LABELS } from '@/lib/reminders/types';
import { formatDate } from '@/lib/utils';
import type { Invoice } from '@/types';

interface ReminderPanelProps {
  invoice: Invoice;
}

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  sent: 'default',
  failed: 'destructive',
  skipped: 'secondary',
};

/**
 * Reminder history + opt-out control for one invoice (issue #224). Only
 * meaningful for the originator — RLS returns an empty history and a
 * read-only `false` opt-out for anyone else, so the panel renders as an
 * empty state rather than being hidden (consistent with InvoiceDocuments).
 */
export function ReminderPanel({ invoice }: ReminderPanelProps) {
  const { history, optedOut, loading, saving, error, toggleOptOut } = useInvoiceReminders(
    invoice.id,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4" />
          Due-date reminders
        </CardTitle>
        <Button
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => toggleOptOut(!optedOut)}
          className="gap-1.5 text-xs"
          aria-pressed={!optedOut}
        >
          {optedOut ? (
            <ToggleLeft className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ToggleRight className="h-5 w-5 text-green-500" />
          )}
          {optedOut ? 'Reminders off' : 'Reminders on'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Automated email and webhook reminders fire 7 days before, 1 day before, on the due
          date, and 1 and 7 days after — unless turned off above.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : history.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            No reminders sent yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {history.map(reminder => (
              <li
                key={reminder.id}
                className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"
              >
                <div className="flex items-center gap-2">
                  {reminder.channel === 'email' ? (
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Webhook className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{STAGE_LABELS[reminder.stage]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDate(new Date(reminder.created_at).getTime() / 1000)}
                  </span>
                  <Badge variant={STATUS_BADGE[reminder.status] ?? 'secondary'}>
                    {reminder.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
