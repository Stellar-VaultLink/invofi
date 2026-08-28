'use client';

// /dashboard/reminders — automated invoice reminder admin console (issue #224,
// admin-only).
//
// Sections:
//   1. Reminder settings — enable/disable, active stages, webhook config
//   2. Recent reminder activity — cross-invoice send log
//
// Per-invoice reminder history and opt-out live on the invoice detail page
// itself (components/invoices/ReminderPanel.tsx).

import { Bell } from 'lucide-react';
import { AdminGuard } from '@/components/health/AdminGuard';
import { ReminderConfigPanel } from '@/components/reminders/ReminderConfigPanel';
import { ReminderActivityLog } from '@/components/reminders/ReminderActivityLog';

export default function RemindersDashboardPage() {
  return (
    <AdminGuard>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Invoice reminders</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Reminders run daily (GitHub Actions cron) at 7 and 1 days before due, on the due date,
          and 1 and 7 days after. Originators can opt out per invoice from the invoice page.
        </p>
        <ReminderConfigPanel />
        <ReminderActivityLog />
      </div>
    </AdminGuard>
  );
}
