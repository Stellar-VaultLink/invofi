// ── Per-table data guards (ADR-0009, issue #377) ─────────────────────────────
//
// Each guard mirrors the semantics of one group of legacy Supabase RLS
// policies (docs/rls-policy-inventory.md) as a plain server-layer check.
// Endpoints call these AFTER requireUser(), before/alongside the query.
// They are pure and synchronous where possible so the allow/deny matrix is
// unit-testable without a database.
//
// For the four defense-in-depth RLS tables the guard is the FIRST gate and
// withUserContext() (rls-context.ts) is the second — use both.

import { AuthzError, type AuthzIdentity } from '@/lib/auth/authz';

// ── notifications (legacy: "Users can … own notifications") ──────────────────

/** Row-scope check: a notification row may only be touched by its owner. */
export function assertOwnNotification(
  identity: AuthzIdentity,
  row: { user_id: string },
): void {
  if (row.user_id !== identity.userId) {
    throw new AuthzError(403, 'forbidden_party', 'Not your notification.');
  }
}

// ── encrypted_messages (legacy: "Participants can read" / "Sender can insert")
// ── ALSO protected by RLS (0002) — this is the first of two gates.

/** Insert path: only the message's sender may create it under their wallet. */
export function assertMessageSender(
  identity: AuthzIdentity,
  input: { senderAddress: string },
): void {
  if (input.senderAddress !== identity.walletAddress) {
    throw new AuthzError(403, 'forbidden_party', 'Messages must be sent from your own wallet.');
  }
}

/** Read path: session wallet must be one of the message's two participants. */
export function assertMessageParticipant(
  identity: AuthzIdentity,
  message: { senderAddress: string; recipientAddress: string },
): void {
  const { walletAddress } = identity;
  if (walletAddress !== message.senderAddress && walletAddress !== message.recipientAddress) {
    // Deliberately identical response shape for "not a participant" and
    // "row doesn't exist" — no oracle for probing other people's threads.
    throw new AuthzError(404, 'not_found', 'Message not found.');
  }
}

// ── pending_transactions (legacy: "Create pending transactions" /
//    "Participants update pending transactions")
// ── ALSO protected by RLS (0002) — this is the first of two gates.

/** Insert path: only the initiator may create a pending transaction row. */
export function assertPendingTxInitiator(
  identity: AuthzIdentity,
  input: { initiatorId: string },
): void {
  if (input.initiatorId !== identity.userId) {
    throw new AuthzError(403, 'forbidden_party', 'Only the initiator can create the transaction.');
  }
}

/**
 * Update path: initiator OR a recorded approver. The endpoint fetches the
 * transaction's approver ids (via withUserContext — the approvals table is
 * itself RLS-guarded) and hands them to this pure check.
 */
export function assertPendingTxMutable(
  identity: AuthzIdentity,
  tx: { initiatorId: string },
  approverIds: readonly string[],
): void {
  if (tx.initiatorId === identity.userId) return;
  if (approverIds.includes(identity.userId)) return;
  throw new AuthzError(403, 'forbidden_party', 'Only the initiator or an approver can update this transaction.');
}

// ── transaction_approvals (legacy: "Insert own approval") ────────────────────

/** Insert path: an approval signature must be recorded under the approver. */
export function assertOwnApproval(
  identity: AuthzIdentity,
  input: { approverId: string },
): void {
  if (input.approverId !== identity.userId) {
    throw new AuthzError(403, 'forbidden_party', 'Approvals must be recorded under your own id.');
  }
}
