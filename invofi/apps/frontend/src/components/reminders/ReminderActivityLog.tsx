'use client';

// ReminderActivityLog — admin-facing view of the most recent reminder sends
// across every invoice (issue #224 acceptance: "Reminder history visible in
// dashboard"). Per-invoice history lives on the invoice page itself
// (components/invoices/ReminderPanel.tsx); this is the cross-invoice view.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Mail, Webhook, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchRecentReminders } from '@/lib/reminders/history';
import { STAGE_LABELS } from '@/lib/reminders/types';
import type { InvoiceReminder } from '@/lib/reminders/types';
import { formatDate } from '@/lib/utils';

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  sent: 'default',
  failed: 'destructive',
  skipped: 'secondary',
};

export function ReminderActivityLog() {
  const [reminders, setReminders] = useState<InvoiceReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReminders(await fetchRecentReminders());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Recent reminder activity</CardTitle>
        <Button variant="ghost" size="sm" onClick={load} className="gap-1.5 text-xs">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : reminders.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No reminders sent yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-4">Invoice</th>
                  <th className="py-2 pr-4">Stage</th>
                  <th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2">Sent</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-mono text-xs">{r.invoice_id}</td>
                    <td className="py-2 pr-4">{STAGE_LABELS[r.stage]}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1">
                        {r.channel === 'email' ? (
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Webhook className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        {r.channel}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      <Badge variant={STATUS_BADGE[r.status] ?? 'secondary'}>{r.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{r.attempts}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {formatDate(new Date(r.created_at).getTime() / 1000)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
