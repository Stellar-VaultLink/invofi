# ADR-0006: Multi-signature approval for high-value operations

**Status:** Accepted (2026-08-18)

## Context

High-value treasury operations (large payments out of a protocol-controlled
account) should not settle on a single signature. Issue #219 asks for an
approval workflow: operations above a configurable per-currency threshold
(default `> 10,000 XLM` / `> 1,000 USDC`) must collect multiple wallet
approvals before they execute, with a visible queue, an "M of N approvals
received" indicator, a 24-hour timeout, co-signer notification, and support for
the two approved wallets (Freighter, Lobstr).

Two things constrain the design:

1. **No backend.** The app is a static Next.js frontend plus Supabase (a
   display/coordination mirror, never the source of truth) and Stellar. There
   is no server to hold a signing session or send email.
2. **Two multi-sig models exist on Stellar.** *Account-level* multi-sig splits
   an account's signing weight across several keys and is satisfied the
   canonical way — collect signatures over one transaction envelope until the
   account's threshold is met, then submit. *Soroban contract* auth is
   per-address (`require_auth`) and does not map to account thresholds; making a
   single contract invocation require several independent approvers is a
   distinct, larger effort.

## Decision

Build a **transaction-agnostic signature-collection queue** for account-level
multi-sig, and wire the high-value UX around it.

1. **One envelope, many signers.** The initiator builds a single unsigned base
   transaction (XDR). Each co-signer signs *that same envelope* with their
   wallet; we diff the returned envelope against the base to extract exactly the
   `DecoratedSignature` they added (`extractNewSignatures`). Once enough are
   collected, all signatures are combined onto the envelope
   (`combineSignatures`) and submitted via Horizon `submitTransaction`. This is
   the standard Stellar flow and is wallet-agnostic — Freighter and Lobstr both
   go through the existing `signTransactionWithActiveWallet`.

2. **Supabase coordinates, never custodies.** A `pending_transactions` row holds
   the base XDR and metadata; each approval is a `transaction_approvals` row
   `{ pending_tx_id, approver_address, signature, created_at }`. The threshold
   check is `count(distinct approver) >= required_signatures`. Signatures are
   public data (they authorize one specific envelope and nothing else), so
   storing them in the mirror is safe — and they are stored **only** there,
   never in `localStorage` (see the secrets guard, issue #187).

3. **Configurable thresholds.** `MULTISIG_THRESHOLDS` (per currency),
   `MULTISIG_REQUIRED_SIGNATURES`, and `MULTISIG_TIMEOUT_SECS` are all
   `NEXT_PUBLIC_*`-overridable so an institution tunes policy without a code
   change. An amount **strictly greater** than its currency's threshold requires
   multi-sig.

4. **Timeout.** The envelope's time bound spans the full approval window, and a
   request auto-rejects (`Expired`) once the window closes. Expiry is enforced
   client-side (`effectiveStatus` hides expired rows from every action) with a
   best-effort sweep on load; an authoritative always-on sweep is a keeper
   follow-up (ADR-0005 machinery).

5. **Notification (server-side).** Email can't be sent from the browser, and a
   `NEXT_PUBLIC_*` webhook URL is readable by anyone and callable with
   attacker-chosen bodies — so the frontend does **not** send notifications.
   Delivery is a **Supabase Database Webhook / Edge Function that fires on
   `INSERT` into `pending_transactions`** (and, optionally,
   `transaction_approvals`), running server-side under the service role. It
   fans out to email/Slack for the configured co-signers. This keeps the
   notification target and secrets off the client, and the approval queue polls
   regardless, so a co-signer still sees a request even if a push is missed.

## Consequences

- **On-chain enforcement requires a configured account.** Submitting an envelope
  carrying signatures that don't contribute to meeting a threshold is rejected
  by stellar-core (`txBAD_AUTH_EXTRA`). So the source account must actually be a
  multi-sig account — its co-signer keys added and its medium threshold set to
  `MULTISIG_REQUIRED_SIGNATURES`. Until an account is configured that way, the
  queue/approval UX is fully functional but the final submit will fail. Account
  setup (add signers, set thresholds) is an operator step, documented in the
  README.
- **Sequence number is pinned at build time.** The base envelope fixes the
  source account's sequence number, so the source must not submit other
  transactions while a request is pending, or execution fails with
  `tx_bad_seq`. Acceptable for a deliberate treasury flow; revisited if we queue
  concurrent requests from one account.
- **Scope.** This covers classic Stellar operations (treasury payments today;
  any base XDR tomorrow). **Soroban per-address multi-approval is explicitly out
  of scope** and left as a follow-up — it needs a contract-side scheme
  (e.g. an on-chain approver registry), not signature collection.
- **Authorization is layered.** Row-Level Security requires an authenticated
  session to read the queue, binds every approval to its author
  (`approver_id = auth.uid()`, and the stored signature must cryptographically
  verify under the claimed `approver_address` — see `signatureForAddress`), and
  restricts status changes to a request's participants (initiator or an
  approver). This is coordination-layer defense-in-depth; it is **not** the
  authority. The authority is the account submit: stellar-core rejects any
  envelope whose signatures don't meet the account threshold
  (`txBAD_AUTH_EXTRA`), so a tampered Supabase row can never move funds.
  Follow-ups that would harden the mirror further — Postgres RPCs that enforce
  the exact status-transition state machine, and checking approver addresses
  against the source account's actual signer set — are deferred, not required
  for on-chain safety.
- The queue is shared state across co-signers, so the UI polls and every
  mutation re-reads approvals.
