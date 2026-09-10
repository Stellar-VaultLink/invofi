import { useCallback, useEffect, useState } from 'react';
import {
  fetchReminderHistory,
  fetchReminderOptOut,
  setReminderOptOut,
} from '@/lib/reminders/history';
import type { InvoiceReminder } from '@/lib/reminders/types';
import { toErrorMessage } from '@/lib/errors';

/**
 * Loads the reminder history and opt-out preference for one invoice, and
 * exposes a `toggleOptOut` mutator. RLS on `invoice_reminders` /
 * `invoice_reminder_preferences` limits results to the invoice's originator
 * (or an admin), so anyone else sees an empty history and a read-only
 * `optedOut` of `false`.
 */
export function useInvoiceReminders(invoiceId: string) {
  const [history, setHistory] = useState<InvoiceReminder[]>([]);
  const [optedOut, setOptedOut] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [reminders, optOut] = await Promise.all([
        fetchReminderHistory(invoiceId),
        fetchReminderOptOut(invoiceId),
      ]);
      setHistory(reminders);
      setOptedOut(optOut);
      setError(null);
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleOptOut = useCallback(
    async (next: boolean) => {
      setSaving(true);
      const previous = optedOut;
      setOptedOut(next); // optimistic
      try {
        await setReminderOptOut(invoiceId, next);
        setError(null);
      } catch (err) {
        setOptedOut(previous); // roll back on failure
        setError(toErrorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    [invoiceId, optedOut],
  );

  return { history, optedOut, loading, saving, error, refresh, toggleOptOut };
}
