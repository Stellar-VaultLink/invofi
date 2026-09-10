// Types for the automated invoice reminder system (issue #224).
// These mirror the three Supabase tables created in migration 005.

/** The five points in the reminder schedule, in chronological order. */
export type ReminderStage = 'due_in_7' | 'due_in_1' | 'due_today' | 'overdue_1' | 'overdue_7';

export const REMINDER_STAGES: ReminderStage[] = [
  'due_in_7',
  'due_in_1',
  'due_today',
  'overdue_1',
  'overdue_7',
];

/** Days relative to the due date each stage fires on (negative = before). */
export const STAGE_OFFSET_DAYS: Record<ReminderStage, number> = {
  due_in_7: -7,
  due_in_1: -1,
  due_today: 0,
  overdue_1: 1,
  overdue_7: 7,
};

export const STAGE_LABELS: Record<ReminderStage, string> = {
  due_in_7: 'Due in 7 days',
  due_in_1: 'Due tomorrow',
  due_today: 'Due today',
  overdue_1: '1 day overdue',
  overdue_7: '7 days overdue',
};

export type ReminderChannel = 'email' | 'webhook';
export type ReminderDeliveryStatus = 'sent' | 'failed' | 'skipped';

// ── invoice_reminders ────────────────────────────────────────────────────────

export interface InvoiceReminder {
  id: string;
  invoice_id: string;
  stage: ReminderStage;
  channel: ReminderChannel;
  status: ReminderDeliveryStatus;
  recipient: string | null;
  attempts: number;
  error: string | null;
  created_at: string;
}

// ── invoice_reminder_preferences ─────────────────────────────────────────────

export interface InvoiceReminderPreference {
  invoice_id: string;
  opted_out: boolean;
  updated_at: string;
}

// ── reminder_configs ─────────────────────────────────────────────────────────

export interface ReminderConfig {
  id: 1;
  enabled: boolean;
  stages: ReminderStage[];
  webhook_url: string | null;
  webhook_secret: string | null;
  max_webhook_attempts: number;
  updated_at: string;
  updated_by: string | null;
}

export const DEFAULT_REMINDER_CONFIG: Omit<ReminderConfig, 'updated_at' | 'updated_by'> = {
  id: 1,
  enabled: true,
  stages: REMINDER_STAGES,
  webhook_url: null,
  webhook_secret: null,
  max_webhook_attempts: 3,
};

/** Minimal shape of a mirrored invoice row needed to compute reminders. */
export interface ReminderableInvoice {
  id: string;
  originator: string;
  originator_id: string | null;
  amount: string;
  currency: string;
  /** ISO timestamp (invoices.due_date is `timestamptz`). */
  due_date: string;
  status: string;
}
