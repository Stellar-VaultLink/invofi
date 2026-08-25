// ── Invoice on-chain event timeline (data layer) ─────────────────────────────
// Fetches the lifecycle events of ONE invoice from the Soroban RPC
// (`getEvents`) and shapes them for the detail-page timeline component.
//
// Source note: the RPC only retains ~5 days of event history, so older
// invoices legitimately show an empty timeline. When the indexer exposes a
// per-event table (issue #95), swap the internals of `fetchInvoiceEvents` for
// a Supabase query returning the same `InvoiceTimelineEntry[]` shape — the
// hook and component stay untouched.

import {
  nativeToScVal,
  rpc as SorobanRpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { ProtocolEventName } from '@invofi/sdk';
import { isMockMode } from './mock-mode';
import {
  FINANCING_CONTRACT_ID,
  REGISTRY_CONTRACT_ID,
  REPAYMENT_CONTRACT_ID,
  RPC_URL,
} from './constants';

/** One decoded, display-ready lifecycle event for an invoice. */
export interface InvoiceTimelineEntry {
  /** Raw protocol event name, e.g. `inv_rep`. */
  type: ProtocolEventName;
  /** Human-readable label, e.g. "Repayment made". */
  label: string;
  /** Ledger (block) sequence the event was emitted in. */
  ledger: number;
  /** ISO timestamp of the ledger close, when the RPC reports it. */
  occurredAt: string | null;
  /** Hash of the transaction that emitted the event. */
  txHash: string;
}

// ── Human labels ─────────────────────────────────────────────────────────────

export const EVENT_LABELS: Record<ProtocolEventName, string> = {
  inv_reg: 'Invoice registered',
  inv_amt: 'Invoice amount updated',
  inv_sts: 'Invoice status updated',
  inv_cxl: 'Invoice cancelled',
  inv_ovd: 'Marked overdue',
  inv_def: 'Invoice defaulted',
  inv_dsp: 'Dispute raised',
  inv_rsl: 'Dispute resolved',
  off_new: 'Offer created',
  off_wdr: 'Offer withdrawn',
  off_acc: 'Offer accepted',
  off_rej: 'Offer rejected',
  off_def: 'Position defaulted (reclaimed)',
  pos_mint: 'Position token minted',
  inv_rep: 'Repayment made',
  pool_stk: 'Insurance pool staked',
  pool_un: 'Insurance pool unstaked',
  pool_pay: 'Insurance payout',
  reputn: 'Reputation recorded',
};

// ── Config guard ─────────────────────────────────────────────────────────────

const TIMELINE_CONTRACT_IDS = [REGISTRY_CONTRACT_ID, FINANCING_CONTRACT_ID, REPAYMENT_CONTRACT_ID].filter(Boolean);

/**
 * True when the timeline can query real chain data — false in offline demo
 * mode or when no contract IDs are configured (alpha mode).
 */
export function invoiceEventsEnabled(): boolean {
  return !isMockMode() && TIMELINE_CONTRACT_IDS.length > 0;
}

// ── Ledger-range clamp (mirrors apps/indexer/src/chain.ts) ────────────────────

const RANGE_RE = /startLedger must be within the ledger range: (\d+) - (\d+)/;

/**
 * Parse the RPC's out-of-range error to find its oldest retained ledger.
 * Returns undefined when the message doesn't match.
 */
export function parseRetentionStart(errorMessage: string): number | undefined {
  const m = RANGE_RE.exec(errorMessage);
  return m ? Number(m[1]) : undefined;
}

// ── Decode + filter + sort (pure, unit-testable) ─────────────────────────────

// Event types whose array payload starts with the invoice id (see the
// Protocol Events table in @invofi/sdk events.ts). inv_rep's first element is
// an OFFER id, so it must NOT appear here.
const ARRAY_INVOICE_ID_FIRST = new Set<string>(['off_new', 'off_acc', 'off_rej', 'off_def', 'inv_def']);

function decodeTopicString(topic: xdr.ScVal | undefined): string | null {
  if (!topic) return null;
  try {
    const decoded = scValToNative(topic);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * Convert raw RPC events into timeline entries scoped to one invoice.
 *
 * An event belongs to the invoice when either:
 *  - topic[1] (the subject id) equals the invoice id, or
 *  - the decoded payload carries the invoice id equal to it (offer-scoped
 *    events may use the offer id as their subject). Payloads arrive either as
 *    maps (`invoice_id` key) or as arrays whose first element is the invoice
 *    id — only for event types where the contract documents that layout.
 *
 * Output is reverse-chronological (newest first) and deduplicated.
 */
export function toTimelineEntries(
  rawEvents: SorobanRpc.Api.EventResponse[],
  invoiceId: string,
): InvoiceTimelineEntry[] {
  const entries: InvoiceTimelineEntry[] = [];
  const seen = new Set<string>();

  for (const raw of rawEvents) {
    const type = decodeTopicString(raw.topic?.[0]);
    const subjectId = decodeTopicString(raw.topic?.[1]);
    if (!type || !(type in EVENT_LABELS)) continue;

    let payloadInvoiceId: string | null = null;
    try {
      const decoded = scValToNative(raw.value);
      if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
        const map = decoded as Record<string, unknown>;
        const candidate = map['invoice_id'] ?? map['invoiceId'];
        if (typeof candidate === 'string') payloadInvoiceId = candidate;
      } else if (Array.isArray(decoded) && ARRAY_INVOICE_ID_FIRST.has(type)) {
        const candidate = decoded[0];
        if (typeof candidate === 'string') payloadInvoiceId = candidate;
      }
    } catch {
      // Undecodable payload — subject match below still applies.
    }

    if (subjectId !== invoiceId && payloadInvoiceId !== invoiceId) continue;

    // raw.id is the RPC's unique per-event id; fall back to a composite key
    // so two identical-type events inside one tx are not collapsed.
    const dedupeKey = raw.id ?? `${raw.txHash}:${type}:${subjectId ?? ''}:${entries.length}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    entries.push({
      type: type as ProtocolEventName,
      label: EVENT_LABELS[type as ProtocolEventName],
      ledger: typeof raw.ledger === 'number' ? raw.ledger : parseInt(String(raw.ledger ?? '0'), 10),
      occurredAt: raw.ledgerClosedAt ?? null,
      txHash: raw.txHash ?? '',
    });
  }

  return entries.sort((a, b) => b.ledger - a.ledger);
}

// ── RPC orchestration ────────────────────────────────────────────────────────

// ~5 days of ledgers at ~5s each — matches typical getEvents retention; the
// request is clamped server-side anyway via parseRetentionStart when out of range.
const LEDGER_WINDOW = 86_400;
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;

const EVENT_FILTER = [{ type: 'contract' as const, contractIds: TIMELINE_CONTRACT_IDS }];

interface PageParams {
  startLedger?: number;
  cursor?: string;
}

async function fetchPage({ startLedger, cursor }: PageParams): Promise<SorobanRpc.Api.GetEventsResponse> {
  const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  // The SDK's GetEventsRequest union requires filters inside each variant and
  // forbids combining startLedger with a cursor.
  const request: SorobanRpc.Api.GetEventsRequest = cursor
    ? { cursor, filters: EVENT_FILTER, limit: PAGE_LIMIT }
    : { startLedger: startLedger ?? 1, filters: EVENT_FILTER, limit: PAGE_LIMIT };
  return server.getEvents(request);
}

/**
 * Fetch the recent on-chain lifecycle events of one invoice, newest first.
 * Fails soft by design — callers treat any thrown error as "no activity".
 */
export async function fetchInvoiceEvents(invoiceId: string): Promise<InvoiceTimelineEntry[]> {
  if (!invoiceId || !invoiceEventsEnabled()) return [];

  const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
  let startLedger = Math.max(1, (await server.getLatestLedger()).sequence - LEDGER_WINDOW);

  const collected: SorobanRpc.Api.EventResponse[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    let response: SorobanRpc.Api.GetEventsResponse;
    try {
      response = await fetchPage(
        cursor ? { cursor } : { startLedger },
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retentionStart = parseRetentionStart(message);
      if (retentionStart !== undefined && !cursor) {
        // Request predated retention — retry clamped to what the node keeps.
        startLedger = retentionStart + 10;
        continue;
      }
      throw err;
    }

    collected.push(...response.events);
    cursor = response.cursor || undefined;
    if (!cursor) break;
  }

  return toTimelineEntries(collected, invoiceId);
}

/** Build the symbol ScVal for an invoice id — exported for tests/fixtures. */
export function invoiceIdScVal(invoiceId: string) {
  return nativeToScVal(invoiceId, { type: 'symbol' });
}
