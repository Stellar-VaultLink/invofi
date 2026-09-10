-- Migration 004: in-app notification center (issue #179)
--
-- Creates the `notifications` table that backs the NotificationBell component.
-- Notifications are written by the frontend when protocol events arrive that
-- match the current user's wallet address, or by the indexer future work.
--
-- The schema keeps DB portability in mind (issue #102 — migrating off Supabase):
-- only standard Postgres features are used: auth.users FK, JSONB payload,
-- timestamptz, and RLS via auth.uid().
--
-- Run in the Supabase SQL Editor (idempotent — safe to re-run).

-- ── Table ──────────────────────────────────────────────────────────────────

create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),

  -- Owner of the notification. Nullable so the indexer can insert rows for
  -- users who haven't authenticated yet; the UI polls by user_id.
  user_id     uuid references auth.users(id) on delete cascade,

  -- Notification type — determines the icon, message template, and routing.
  -- 'offer_received'  — a new financing offer was created on the user's invoice
  -- 'offer_accepted'  — the user's offer was accepted by the invoice originator
  -- 'invoice_repaid'  — a financed invoice was repaid (partially or fully)
  -- 'invoice_cancelled' — the user's invoice was cancelled
  -- 'invoice_overdue' — an invoice the user financed is now overdue
  -- 'offer_rejected'  — the user's offer was rejected
  -- 'invoice_defaulted' — an invoice the user financed defaulted
  type          text not null
    check (type in (
      'offer_received',
      'offer_accepted',
      'invoice_repaid',
      'invoice_cancelled',
      'invoice_overdue',
      'offer_rejected',
      'invoice_defaulted'
    )),

  -- Human-readable title and body — pre-rendered so the UI doesn't need to
  -- know every notification type to render a list.
  title         text not null,
  body          text not null default '',

  -- Structured data describing the event: invoice_id, offer_id, amount,
  -- currency, counterparty address, etc. Kept compact; sender can extend.
  payload       jsonb not null default '{}'::jsonb,

  -- Null until the user has viewed the notification.
  read_at       timestamptz,

  created_at    timestamptz not null default now()
);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Primary query pattern: fetch unread-first, then recent, paginated.
create index if not exists notifications_user_idx
  on notifications (user_id, read_at, created_at desc);

-- Quick unread count query.
create index if not exists notifications_unread_idx
  on notifications (user_id)
  where read_at is null;

-- ── Row-Level Security ─────────────────────────────────────────────────────

alter table notifications enable row level security;

-- SELECT: users can only read their own notifications.
drop policy if exists "Users can read own notifications" on notifications;
create policy "Users can read own notifications"
  on notifications for select
  using (auth.uid() = user_id);

-- INSERT: users can create notifications for themselves.
drop policy if exists "Users can insert own notifications" on notifications;
create policy "Users can insert own notifications"
  on notifications for insert
  with check (auth.uid() = user_id);

-- UPDATE: users can mark their own notifications as read (read_at only).
drop policy if exists "Users can update own notifications" on notifications;
create policy "Users can update own notifications"
  on notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DELETE: users can delete their own notifications.
drop policy if exists "Users can delete own notifications" on notifications;
create policy "Users can delete own notifications"
  on notifications for delete
  using (auth.uid() = user_id);