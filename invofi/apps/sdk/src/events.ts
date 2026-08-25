// ── Typed protocol event stream (SDK feature) ────────────────────────────────
//
// `listenToEvents` polls the Stellar Soroban RPC for on-chain contract events
// and delivers strongly-typed payloads to the caller.
//
// ## Design notes
// - **No WebSocket / subscription infrastructure** — polling is sufficient for
//   the current protocol cadence (one ledger ≈ 5 s). Upgrading to a
//   server-sent-event / WebSocket relay is straightforward: replace the
//   polling loop with a streaming source while keeping the same typed payload
//   interface. See "Event-driven upgrade path" in the TypeDoc below.
// - Topics follow the Soroban convention: topic[0] = Symbol event name,
//   topic[1] = Symbol subject id (invoice id or offer id).
// - All 20 protocol event names from `invofi-contracts` are covered.
//
// ## Canonical event spec
// See the Protocol Events table in the invofi-contracts README and
// `apps/indexer/src/events.ts` (KNOWN_EVENTS).

import { rpc as SorobanRpc, scValToNative } from '@stellar/stellar-sdk';

// ── Event-name literals ──────────────────────────────────────────────────────

/**
 * All protocol event type names emitted by InvoFi smart contracts.
 *
 * | Name        | Contract   | Trigger                          |
 * |-------------|------------|----------------------------------|
 * | `inv_reg`   | registry   | `register_invoice`               |
 * | `inv_amt`   | registry   | amount update                    |
 * | `inv_sts`   | registry   | status update                    |
 * | `inv_cxl`   | registry   | `cancel_invoice`                 |
 * | `inv_ovd`   | registry   | `mark_overdue`                   |
 * | `inv_def`   | registry   | invoice defaulted                |
 * | `inv_dsp`   | registry   | `raise_dispute`                  |
 * | `inv_rsl`   | registry   | `resolve_dispute`                |
 * | `off_new`   | financing  | `create_offer`                   |
 * | `off_wdr`   | financing  | offer withdrawn                  |
 * | `off_acc`   | financing  | `accept_offer`                   |
 * | `off_rej`   | financing  | `reject_offer`                   |
 * | `off_def`   | repayment  | `reclaim_invoice` (offer side)   |
 * | `pos_mint`  | financing  | position token minted            |
 * | `inv_rep`   | repayment  | `repay_invoice`                  |
 * | `pool_stk`  | insurance  | stake into insurance pool        |
 * | `pool_un`   | insurance  | unstake from insurance pool      |
 * | `pool_pay`  | insurance  | insurance payout on default      |
 * | `reputn`    | reputation | reputation score recorded        |
 */
export type ProtocolEventName =
  | 'inv_reg'
  | 'inv_amt'
  | 'inv_sts'
  | 'inv_cxl'
  | 'inv_ovd'
  | 'inv_def'
  | 'inv_dsp'
  | 'inv_rsl'
  | 'off_new'
  | 'off_wdr'
  | 'off_acc'
  | 'off_rej'
  | 'off_def'
  | 'pos_mint'
  | 'inv_rep'
  | 'pool_stk'
  | 'pool_un'
  | 'pool_pay'
  | 'reputn';

// ── Per-event typed payloads ─────────────────────────────────────────────────
// Data fields mirror the Soroban `env.events().publish(...)` calls in
// invofi-contracts. Fields decoded via `scValToNative`.

/** `inv_reg` — emitted by `register_invoice` */
export interface InvoiceRegisteredData {
  originator: string;
  amount: bigint;
  dueDate: bigint;
}

/** `inv_amt` — emitted when invoice amount is updated */
export interface InvoiceAmountUpdatedData {
  newAmount: bigint;
}

/** `inv_sts` — emitted when invoice status changes */
export interface InvoiceStatusUpdatedData {
  newStatus: string;
}

/** `inv_cxl` — emitted by `cancel_invoice` */
export interface InvoiceCancelledData {
  originator: string;
}

/** `inv_ovd` — emitted by `mark_overdue` */
export interface InvoiceOverdueData {
  dueDate: bigint;
}

/** `inv_def` — emitted when an invoice defaults */
export interface InvoiceDefaultedData {
  invoiceId: string;
}

/** `inv_dsp` — emitted by `raise_dispute` */
export interface InvoiceDisputedData {
  originator: string;
}

/** `inv_rsl` — emitted by `resolve_dispute` */
export interface InvoiceResolvedData {
  newStatus: string;
}

/** `off_new` — emitted by `create_offer` */
export interface OfferCreatedData {
  invoiceId: string;
  lender: string;
  amount: bigint;
  interestRate: number;
}

/** `off_wdr` — emitted when an offer is withdrawn */
export interface OfferWithdrawnData {
  lender: string;
}

/** `off_acc` — emitted by `accept_offer` */
export interface OfferAcceptedData {
  invoiceId: string;
  lender: string;
  amount: bigint;
}

/** `off_rej` — emitted by `reject_offer` */
export interface OfferRejectedData {
  invoiceId: string;
}

/** `off_def` — emitted by `reclaim_invoice` (offer side default) */
export interface OfferDefaultedData {
  invoiceId: string;
  lender: string;
}

/** `pos_mint` — emitted when a position token is minted to the lender */
export interface PositionTokenMintedData {
  lender: string;
  amount: bigint;
}

/** `inv_rep` — emitted by `repay_invoice` */
export interface InvoiceRepaidData {
  offerId: string;
  amount: bigint;
  fullyRepaid: boolean;
}

/** `pool_stk` — emitted on insurance pool stake */
export interface PoolStakedData {
  staker: string;
  amount: bigint;
}

/** `pool_un` — emitted on insurance pool unstake */
export interface PoolUnstakedData {
  staker: string;
  amount: bigint;
}

/** `pool_pay` — emitted on insurance payout */
export interface PoolPayoutData {
  recipient: string;
  amount: bigint;
}

/** `reputn` — emitted when a reputation score is recorded */
export interface ReputationRecordedData {
  address: string;
  score: number;
}

// ── Discriminated union: ProtocolEvent ───────────────────────────────────────

/**
 * A fully decoded, strongly-typed protocol event. Use the `type` discriminant
 * to narrow to the specific payload in a `switch` statement or if-chain.
 *
 * @example
 * ```ts
 * listenToEvents({
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET,
 *   contractIds: [registryId, financingId, repaymentId],
 *   onEvent(event) {
 *     switch (event.type) {
 *       case 'inv_reg':
 *         console.log('New invoice:', event.subjectId, 'by', event.data.originator);
 *         break;
 *       case 'off_acc':
 *         console.log('Offer accepted:', event.subjectId, 'lender', event.data.lender);
 *         break;
 *     }
 *   },
 * });
 * ```
 */
export type ProtocolEvent =
  | { type: 'inv_reg';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceRegisteredData }
  | { type: 'inv_amt';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceAmountUpdatedData }
  | { type: 'inv_sts';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceStatusUpdatedData }
  | { type: 'inv_cxl';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceCancelledData }
  | { type: 'inv_ovd';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceOverdueData }
  | { type: 'inv_def';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceDefaultedData }
  | { type: 'inv_dsp';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceDisputedData }
  | { type: 'inv_rsl';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceResolvedData }
  | { type: 'off_new';  subjectId: string; contractId: string; ledger: number; txHash: string; data: OfferCreatedData }
  | { type: 'off_wdr';  subjectId: string; contractId: string; ledger: number; txHash: string; data: OfferWithdrawnData }
  | { type: 'off_acc';  subjectId: string; contractId: string; ledger: number; txHash: string; data: OfferAcceptedData }
  | { type: 'off_rej';  subjectId: string; contractId: string; ledger: number; txHash: string; data: OfferRejectedData }
  | { type: 'off_def';  subjectId: string; contractId: string; ledger: number; txHash: string; data: OfferDefaultedData }
  | { type: 'pos_mint'; subjectId: string; contractId: string; ledger: number; txHash: string; data: PositionTokenMintedData }
  | { type: 'inv_rep';  subjectId: string; contractId: string; ledger: number; txHash: string; data: InvoiceRepaidData }
  | { type: 'pool_stk'; subjectId: string; contractId: string; ledger: number; txHash: string; data: PoolStakedData }
  | { type: 'pool_un';  subjectId: string; contractId: string; ledger: number; txHash: string; data: PoolUnstakedData }
  | { type: 'pool_pay'; subjectId: string; contractId: string; ledger: number; txHash: string; data: PoolPayoutData }
  | { type: 'reputn';   subjectId: string; contractId: string; ledger: number; txHash: string; data: ReputationRecordedData };

// ── listenToEvents options ───────────────────────────────────────────────────

/**
 * Options for {@link listenToEvents}.
 *
 * @example
 * ```ts
 * import { listenToEvents, Networks } from '@invofi/sdk';
 *
 * const stop = listenToEvents({
 *   rpcUrl:            'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET,
 *   contractIds:       [registryId, financingId, repaymentId],
 *   eventTypes:        ['inv_reg', 'off_acc', 'inv_rep'],
 *   pollIntervalMs:    5_000,
 *   onEvent(event) {
 *     if (event.type === 'inv_reg') {
 *       console.log('Invoice registered:', event.subjectId);
 *     }
 *   },
 *   onError(err) {
 *     console.error('Event stream error:', err.message);
 *   },
 * });
 *
 * // Later — stop polling and release resources:
 * stop();
 * ```
 */
export interface ListenToEventsOptions {
  /**
   * Soroban RPC URL, e.g. `'https://soroban-testnet.stellar.org'`.
   */
  rpcUrl: string;

  /**
   * Stellar network passphrase. Use `Networks.TESTNET` or `Networks.PUBLIC`.
   * Required for RPC requests; also available from an `InvofiClientConfig`.
   */
  networkPassphrase: string;

  /**
   * One or more contract IDs to listen on. Pass all relevant protocol
   * contract IDs (registry, financing, repayment, insurance, reputation) to
   * cover the full event surface, or a subset for targeted listening.
   */
  contractIds: string[];

  /**
   * Subset of event types to receive. When omitted, **all** protocol events
   * are delivered.
   *
   * @example `['inv_reg', 'off_acc', 'inv_rep']`
   */
  eventTypes?: ProtocolEventName[];

  /**
   * Called for every matching event in arrival order (oldest ledger first).
   * The event is fully decoded — use the `type` discriminant to narrow to a
   * specific payload type.
   */
  onEvent: (event: ProtocolEvent) => void;

  /**
   * Called when a poll attempt fails or an event cannot be decoded. The
   * helper retries automatically with back-off; this callback is informational
   * so the caller can log errors or update UI state.
   *
   * Returning from this callback allows polling to continue. To stop
   * entirely on error, call the `stop()` function returned by
   * `listenToEvents`.
   */
  onError?: (error: Error, context: { attempt: number; nextRetryMs: number }) => void;

  /**
   * How often to poll the RPC for new events, in milliseconds.
   * Defaults to `5_000` (one Stellar ledger ≈ 5 s).
   */
  pollIntervalMs?: number;

  /**
   * Starting ledger sequence. When omitted the helper starts from the
   * current latest ledger so only *new* events are delivered.
   * Pass a specific ledger to replay historical events.
   */
  startLedger?: number;

  /**
   * Maximum number of consecutive poll failures before backing off
   * exponentially. Defaults to `3`.
   */
  maxRetries?: number;
}

/**
 * A function that, when called, stops the event listener and cleans up
 * all internal timers.
 */
export type StopListening = () => void;

// ── replayEvents options ───────────────────────────────────────────────────

/**
 * Options for {@link replayEvents}.
 *
 * @example
 * ```ts
 * import { replayEvents, Networks } from '@invofi/sdk';
 *
 * const events = await replayEvents({
 *   rpcUrl:      'https://soroban-testnet.stellar.org',
 *   contractIds: [registryId, financingId],
 *   from:        1000,
 *   to:          2000,
 *   eventTypes:  ['inv_reg', 'off_acc'],
 *   onEvent(event) {
 *     console.log('Replayed event:', event.type, event.subjectId);
 *   },
 * });
 * ```
 */
export interface ReplayEventsOptions {
  /**
   * Soroban RPC URL, e.g. `'https://soroban-testnet.stellar.org'`.
   * Defaults to `'https://soroban-testnet.stellar.org'` if omitted.
   */
  rpcUrl?: string;

  /**
   * Stellar network passphrase. Use `Networks.TESTNET` or `Networks.PUBLIC`.
   */
  networkPassphrase?: string;

  /**
   * Starting ledger sequence (inclusive).
   */
  from?: number;

  /**
   * Alias for `from`. Starting ledger sequence (inclusive).
   */
  fromLedger?: number;

  /**
   * Alias for `from`. Starting ledger sequence (inclusive).
   */
  startLedger?: number;

  /**
   * Ending ledger sequence (inclusive). When omitted, queries up to the current
   * latest ledger on the network.
   */
  to?: number;

  /**
   * Alias for `to`. Ending ledger sequence (inclusive).
   */
  toLedger?: number;

  /**
   * Alias for `to`. Ending ledger sequence (inclusive).
   */
  endLedger?: number;

  /**
   * One or more contract IDs to filter on.
   */
  contractIds?: string[];

  /**
   * Convenience single contract ID filter.
   */
  contractId?: string;

  /**
   * Subset of event types to receive. When omitted, all protocol events are returned.
   */
  eventTypes?: ProtocolEventName[];

  /**
   * Convenience single event type filter.
   */
  eventType?: ProtocolEventName;

  /**
   * Maximum ledger window size per batch RPC request. Defaults to `1000` (Soroban RPC window limit).
   */
  batchSizeLedgers?: number;

  /**
   * Maximum number of raw events per RPC page request. Defaults to `200`.
   */
  limitPerPage?: number;

  /**
   * Optional callback called for every decoded matching event in chronological order.
   */
  onEvent?: (event: ProtocolEvent) => void;

  /**
   * Optional callback on RPC error during replay.
   */
  onError?: (error: Error, context: { from: number; to: number; attempt: number }) => void;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Extract a string value from a decoded ScVal. */
function extractString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'symbol') return val.toString();
  return String(val ?? '');
}

/** Extract a bigint value from a decoded ScVal. */
function extractBigInt(val: unknown): bigint {
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') return BigInt(val);
  if (typeof val === 'string') return BigInt(val);
  return BigInt(0);
}

/** Extract a boolean value from a decoded ScVal. */
function extractBool(val: unknown): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  return Boolean(val);
}

/** Extract a number value from a decoded ScVal. */
function extractNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'bigint') return Number(val);
  return Number(val ?? 0);
}

/**
 * Decode the data `xdr.ScVal` of a raw RPC event into a typed payload.
 * Returns `null` for unknown or malformed events so the loop can skip them.
 */
function decodeEventData(
  eventName: string,
  rawEvent: SorobanRpc.Api.EventResponse,
): ProtocolEvent['data'] | null {
  // The event value field is a single ScVal; decode it with scValToNative.
  // The shape depends on the contract's publish call — see invofi-contracts.
  let decoded: unknown;
  try {
    decoded = scValToNative(rawEvent.value);
  } catch {
    return null;
  }

  // Helpers that index into array or map payloads defensively.
  const arr = Array.isArray(decoded) ? (decoded as unknown[]) : [];
  const map = typeof decoded === 'object' && decoded !== null && !Array.isArray(decoded)
    ? (decoded as Record<string, unknown>)
    : {};

  switch (eventName as ProtocolEventName) {
    case 'inv_reg':
      return {
        originator: extractString(arr[0] ?? map['originator']),
        amount:     extractBigInt(arr[1] ?? map['amount']),
        dueDate:    extractBigInt(arr[2] ?? map['due_date']),
      } satisfies InvoiceRegisteredData;

    case 'inv_amt':
      return {
        newAmount: extractBigInt(arr[0] ?? map['amount'] ?? decoded),
      } satisfies InvoiceAmountUpdatedData;

    case 'inv_sts':
      return {
        newStatus: extractString(arr[0] ?? map['status'] ?? decoded),
      } satisfies InvoiceStatusUpdatedData;

    case 'inv_cxl':
      return {
        originator: extractString(arr[0] ?? map['originator'] ?? decoded),
      } satisfies InvoiceCancelledData;

    case 'inv_ovd':
      return {
        dueDate: extractBigInt(arr[0] ?? map['due_date'] ?? decoded),
      } satisfies InvoiceOverdueData;

    case 'inv_def':
      return {
        invoiceId: extractString(arr[0] ?? map['invoice_id'] ?? decoded),
      } satisfies InvoiceDefaultedData;

    case 'inv_dsp':
      return {
        originator: extractString(arr[0] ?? map['originator'] ?? decoded),
      } satisfies InvoiceDisputedData;

    case 'inv_rsl':
      return {
        newStatus: extractString(arr[0] ?? map['new_status'] ?? decoded),
      } satisfies InvoiceResolvedData;

    case 'off_new':
      return {
        invoiceId:    extractString(arr[0] ?? map['invoice_id']),
        lender:       extractString(arr[1] ?? map['lender']),
        amount:       extractBigInt(arr[2] ?? map['amount']),
        interestRate: extractNumber(arr[3] ?? map['interest_rate']),
      } satisfies OfferCreatedData;

    case 'off_wdr':
      return {
        lender: extractString(arr[0] ?? map['lender'] ?? decoded),
      } satisfies OfferWithdrawnData;

    case 'off_acc':
      return {
        invoiceId: extractString(arr[0] ?? map['invoice_id']),
        lender:    extractString(arr[1] ?? map['lender']),
        amount:    extractBigInt(arr[2] ?? map['amount']),
      } satisfies OfferAcceptedData;

    case 'off_rej':
      return {
        invoiceId: extractString(arr[0] ?? map['invoice_id'] ?? decoded),
      } satisfies OfferRejectedData;

    case 'off_def':
      return {
        invoiceId: extractString(arr[0] ?? map['invoice_id']),
        lender:    extractString(arr[1] ?? map['lender']),
      } satisfies OfferDefaultedData;

    case 'pos_mint':
      return {
        lender: extractString(arr[0] ?? map['lender']),
        amount: extractBigInt(arr[1] ?? map['amount']),
      } satisfies PositionTokenMintedData;

    case 'inv_rep':
      return {
        offerId:     extractString(arr[0] ?? map['offer_id']),
        amount:      extractBigInt(arr[1] ?? map['amount']),
        fullyRepaid: extractBool(arr[2] ?? map['fully_repaid']),
      } satisfies InvoiceRepaidData;

    case 'pool_stk':
      return {
        staker: extractString(arr[0] ?? map['staker']),
        amount: extractBigInt(arr[1] ?? map['amount']),
      } satisfies PoolStakedData;

    case 'pool_un':
      return {
        staker: extractString(arr[0] ?? map['staker']),
        amount: extractBigInt(arr[1] ?? map['amount']),
      } satisfies PoolUnstakedData;

    case 'pool_pay':
      return {
        recipient: extractString(arr[0] ?? map['recipient']),
        amount:    extractBigInt(arr[1] ?? map['amount']),
      } satisfies PoolPayoutData;

    case 'reputn':
      return {
        address: extractString(arr[0] ?? map['address']),
        score:   extractNumber(arr[1] ?? map['score']),
      } satisfies ReputationRecordedData;

    default:
      return null;
  }
}

/** Parse the topic[0] of a raw event to get the event name Symbol string. */
function parseEventName(rawEvent: SorobanRpc.Api.EventResponse): string | null {
  try {
    const topic0 = rawEvent.topic[0];
    if (!topic0) return null;
    const decoded = scValToNative(topic0);
    return typeof decoded === 'string' ? decoded : null;
  } catch {
    return null;
  }
}

/** Parse the topic[1] of a raw event to get the subject ID (invoice/offer id). */
function parseSubjectId(rawEvent: SorobanRpc.Api.EventResponse): string {
  try {
    const topic1 = rawEvent.topic[1];
    if (!topic1) return '';
    const decoded = scValToNative(topic1);
    return typeof decoded === 'string' ? decoded : String(decoded ?? '');
  } catch {
    return '';
  }
}

/** Decode a single raw RPC event into a typed ProtocolEvent, or null if it can't be decoded. */
function decodeEvent(rawEvent: SorobanRpc.Api.EventResponse): ProtocolEvent | null {
  const eventName = parseEventName(rawEvent);
  if (!eventName) return null;

  const data = decodeEventData(eventName, rawEvent);
  if (data === null) return null;

  const subjectId = parseSubjectId(rawEvent);
  const contractId = rawEvent.contractId ?? '';
  const ledger = typeof rawEvent.ledger === 'number'
    ? rawEvent.ledger
    : parseInt(String(rawEvent.ledger ?? '0'), 10);
  const txHash = rawEvent.txHash ?? '';

  return {
    type: eventName,
    subjectId,
    contractId,
    ledger,
    txHash,
    data,
  } as ProtocolEvent;
}

// ── listenToEvents ───────────────────────────────────────────────────────────

const KNOWN_EVENT_NAMES = new Set<ProtocolEventName>([
  'inv_reg', 'inv_amt', 'inv_sts', 'inv_cxl', 'inv_ovd', 'inv_def',
  'inv_dsp', 'inv_rsl', 'off_new', 'off_wdr', 'off_acc', 'off_rej',
  'off_def', 'pos_mint', 'inv_rep', 'pool_stk', 'pool_un', 'pool_pay',
  'reputn',
]);

/**
 * Subscribe to InvoFi protocol events from the Soroban RPC.
 *
 * Polls `getEvents` on an interval, decodes each raw topic/value pair into a
 * strongly-typed {@link ProtocolEvent}, and delivers matching events to
 * `onEvent` in ledger order. Automatically retries on transient failures with
 * exponential back-off and surfaces errors to `onError`.
 *
 * Returns a `stop()` function; call it to cancel polling and clean up timers.
 *
 * ## Upgrade path to event-driven streaming
 * Once an SSE / WebSocket event relay is available (e.g. a Horizon streaming
 * endpoint or a custom relay), replace the internal `poll()` loop with a
 * streaming source. The `ProtocolEvent` types, `onEvent`, and `onError`
 * contract are unchanged — consumers need zero migration.
 *
 * @example
 * ```ts
 * import { listenToEvents, Networks } from '@invofi/sdk';
 *
 * const stop = listenToEvents({
 *   rpcUrl:            'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET,
 *   contractIds:       [registryId, financingId, repaymentId],
 *   // Filter to a specific subset — omit to receive all 20 event types:
 *   eventTypes:        ['inv_reg', 'off_acc', 'inv_rep'],
 *   pollIntervalMs:    5_000,
 *   onEvent(event) {
 *     switch (event.type) {
 *       case 'inv_reg':
 *         console.log('Invoice registered:', event.subjectId, event.data);
 *         break;
 *       case 'off_acc':
 *         console.log('Offer accepted:', event.subjectId, event.data);
 *         break;
 *       case 'inv_rep':
 *         console.log('Repayment:', event.subjectId, event.data);
 *         break;
 *     }
 *   },
 *   onError(err, { attempt, nextRetryMs }) {
 *     console.error(`Poll attempt ${attempt} failed: ${err.message} — retry in ${nextRetryMs}ms`);
 *   },
 * });
 *
 * // Stop after 60 seconds:
 * setTimeout(stop, 60_000);
 * ```
 *
 * @see {@link ListenToEventsOptions} for the full option reference.
 * @see {@link ProtocolEvent} for the typed event union.
 *
 * Cross-link: SDK TypeDoc API reference — issue #93.
 */
export function listenToEvents(options: ListenToEventsOptions): StopListening {
  const {
    rpcUrl,
    contractIds,
    onEvent,
    onError,
    eventTypes,
    pollIntervalMs = 5_000,
    maxRetries = 3,
  } = options;

  if (!rpcUrl) throw new Error('listenToEvents: rpcUrl is required');
  if (!contractIds || contractIds.length === 0) {
    throw new Error('listenToEvents: at least one contractId is required');
  }

  const allowedTypes = eventTypes ? new Set<string>(eventTypes) : null;

  let stopped = false;
  let consecutiveFailures = 0;
  let currentLedger: number | undefined = options.startLedger;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const rpcServer = new SorobanRpc.Server(rpcUrl, { allowHttp: false });

  /** Fetch the latest ledger sequence from the RPC. */
  async function fetchLatestLedger(): Promise<number> {
    const res = await rpcServer.getLatestLedger();
    return res.sequence;
  }

  /** One poll iteration — fetch events since `currentLedger`, deliver typed payloads. */
  async function poll(): Promise<void> {
    if (stopped) return;

    // On the first call resolve the starting ledger from the RPC.
    if (currentLedger === undefined) {
      currentLedger = await fetchLatestLedger();
      return; // Nothing to fetch yet — wait for the next interval.
    }

    const latestLedger = await fetchLatestLedger();
    if (latestLedger < currentLedger) return; // No new ledgers yet.

    // getEvents requires startLedger; limit 200 events per poll.
    const res = await rpcServer.getEvents({
      startLedger: currentLedger,
      filters: [{ type: 'contract', contractIds }],
      limit: 200,
    });

    // Advance cursor past ledgers already processed.
    if (res.latestLedger >= currentLedger) {
      currentLedger = res.latestLedger + 1;
    }

    for (const rawEvent of res.events) {
      const event = decodeEvent(rawEvent);
      if (event === null) continue;

      // Skip events not in the requested subset.
      if (allowedTypes && !allowedTypes.has(event.type)) continue;

      // Skip entirely unknown event names (future-proofing).
      if (!KNOWN_EVENT_NAMES.has(event.type as ProtocolEventName)) continue;

      try {
        onEvent(event);
      } catch {
        // onEvent throwing must never crash the poll loop.
      }
    }
  }

  /** Schedule the next poll, applying exponential back-off on failures. */
  function scheduleNext(delayMs: number): void {
    if (stopped) return;
    pollTimer = setTimeout(runPoll, delayMs);
  }

  async function runPoll(): Promise<void> {
    if (stopped) return;
    try {
      await poll();
      consecutiveFailures = 0;
      scheduleNext(pollIntervalMs);
    } catch (err) {
      consecutiveFailures++;
      const backoffFactor = Math.min(consecutiveFailures, maxRetries);
      const nextRetryMs = pollIntervalMs * Math.pow(2, backoffFactor - 1);
      const error = err instanceof Error ? err : new Error(String(err));
      if (onError) {
        try {
          onError(error, { attempt: consecutiveFailures, nextRetryMs });
        } catch {
          // onError throwing must not crash the poll loop.
        }
      }
      scheduleNext(nextRetryMs);
    }
  }

  // Kick off the first poll on the next tick so the caller receives the stop
  // function before any callbacks fire.
  scheduleNext(0);

  return function stop(): void {
    stopped = true;
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}

// ── replayEvents ───────────────────────────────────────────────────────────

/**
 * Replay and catch up historical InvoFi protocol events across a specified ledger range.
 *
 * Paginates through Soroban RPC event pages and handles ledger ranges larger than
 * the 1000-ledger RPC window limit by dividing into sequential ledger batches.
 * Returns fully decoded, strongly-typed {@link ProtocolEvent} objects in strict
 * chronological order.
 *
 * @example
 * ```ts
 * import { replayEvents, Networks } from '@invofi/sdk';
 *
 * // Object-style:
 * const events = await replayEvents({
 *   rpcUrl:      'https://soroban-testnet.stellar.org',
 *   contractIds: [registryId, financingId],
 *   from:        1000,
 *   to:          2500,
 *   eventTypes:  ['inv_reg', 'off_acc'],
 *   onEvent(event) {
 *     console.log('Replayed event:', event.type, event.subjectId);
 *   },
 * });
 *
 * // Positional-style:
 * const events = await replayEvents(1000, 2000, (event) => {
 *   console.log('Got event:', event.type);
 * });
 * ```
 *
 * @see {@link ReplayEventsOptions} for options.
 */
export async function replayEvents(options: ReplayEventsOptions): Promise<ProtocolEvent[]>;
export async function replayEvents(
  fromLedger: number,
  toLedger?: number,
  callback?: (event: ProtocolEvent) => void,
  options?: Partial<ReplayEventsOptions>,
): Promise<ProtocolEvent[]>;
export async function replayEvents(
  optionsOrFrom: ReplayEventsOptions | number,
  toLedgerParam?: number,
  callbackParam?: (event: ProtocolEvent) => void,
  extraOptions?: Partial<ReplayEventsOptions>,
): Promise<ProtocolEvent[]> {
  let opts: ReplayEventsOptions;

  if (typeof optionsOrFrom === 'number') {
    opts = {
      ...extraOptions,
      from: optionsOrFrom,
      to: toLedgerParam ?? extraOptions?.to ?? extraOptions?.toLedger ?? extraOptions?.endLedger,
      onEvent: callbackParam ?? extraOptions?.onEvent,
    };
  } else {
    opts = optionsOrFrom ?? {};
  }

  const rpcUrl = opts.rpcUrl ?? 'https://soroban-testnet.stellar.org';
  if (opts.rpcUrl !== undefined && !opts.rpcUrl) {
    throw new Error('replayEvents: rpcUrl must not be empty');
  }

  const from = opts.from ?? opts.fromLedger ?? opts.startLedger;
  if (from === undefined) {
    throw new Error('replayEvents: valid starting ledger (from) is required');
  }
  if (typeof from !== 'number' || isNaN(from) || from < 0 || !Number.isInteger(from)) {
    throw new Error('replayEvents: from must be a non-negative integer');
  }

  const to = opts.to ?? opts.toLedger ?? opts.endLedger;
  if (to !== undefined) {
    if (typeof to !== 'number' || isNaN(to) || to < 0 || !Number.isInteger(to)) {
      throw new Error('replayEvents: to must be a non-negative integer');
    }
    if (to < from) {
      throw new Error('replayEvents: to must be greater than or equal to from');
    }
  }

  const contractIds = opts.contractIds ?? (opts.contractId ? [opts.contractId] : undefined);
  const eventTypes = opts.eventTypes ?? (opts.eventType ? [opts.eventType] : undefined);
  const allowedTypes = eventTypes ? new Set<string>(eventTypes) : null;
  const onEvent = opts.onEvent;
  const batchSizeLedgers = Math.max(1, opts.batchSizeLedgers ?? 1000);
  const limitPerPage = opts.limitPerPage ?? 200;

  const rpcServer = new SorobanRpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });

  let targetTo = to;
  if (targetTo === undefined) {
    const latestLedgerRes = await rpcServer.getLatestLedger();
    targetTo = latestLedgerRes.sequence;
    if (targetTo < from) {
      return [];
    }
  }

  let currentWindowStart = from;
  const allEvents: ProtocolEvent[] = [];
  const seenPagingTokens = new Set<string>();

  while (currentWindowStart <= targetTo) {
    const currentWindowEnd = Math.min(currentWindowStart + batchSizeLedgers - 1, targetTo);
    let cursor: string | undefined = undefined;
    let hasMorePagesInWindow = true;
    const pageStartLedger = currentWindowStart;

    while (hasMorePagesInWindow) {
      const filters: SorobanRpc.Api.EventFilter[] = [];
      if (contractIds && contractIds.length > 0) {
        filters.push({ type: 'contract', contractIds });
      } else {
        filters.push({ type: 'contract' });
      }

      const requestParams: Record<string, unknown> = {
        startLedger: pageStartLedger,
        filters,
        limit: limitPerPage,
      };
      if (cursor) {
        requestParams.cursor = cursor;
        requestParams.pagination = { cursor, limit: limitPerPage };
      }

      let res: SorobanRpc.Api.GetEventsResponse;
      try {
        res = await rpcServer.getEvents(requestParams as unknown as SorobanRpc.Server.GetEventsRequest);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (opts.onError) {
          try {
            opts.onError(error, { from: currentWindowStart, to: currentWindowEnd, attempt: 1 });
          } catch {
            // suppress onError exception
          }
        }
        throw error;
      }

      const rawEvents = res?.events ?? [];
      if (rawEvents.length === 0) {
        break;
      }

      let newEventsInBatch = 0;
      for (const rawEvent of rawEvents) {
        const rawLedger = typeof rawEvent.ledger === 'number'
          ? rawEvent.ledger
          : parseInt(String(rawEvent.ledger ?? '0'), 10);

        if (rawLedger > targetTo) {
          hasMorePagesInWindow = false;
          break;
        }
        if (rawLedger > currentWindowEnd) {
          hasMorePagesInWindow = false;
          break;
        }
        if (rawLedger < from) {
          continue;
        }

        const eventKey = rawEvent.id || (rawEvent as { pagingToken?: string }).pagingToken || `${rawLedger}-${rawEvent.txHash}-${rawEvent.contractId}`;
        if (seenPagingTokens.has(eventKey)) {
          continue;
        }
        seenPagingTokens.add(eventKey);
        newEventsInBatch++;

        const decoded = decodeEvent(rawEvent);
        if (decoded === null) continue;

        if (contractIds && contractIds.length > 0 && !contractIds.includes(decoded.contractId)) {
          continue;
        }

        if (allowedTypes && !allowedTypes.has(decoded.type)) {
          continue;
        }

        if (!KNOWN_EVENT_NAMES.has(decoded.type as ProtocolEventName)) {
          continue;
        }

        allEvents.push(decoded);
        if (onEvent) {
          try {
            onEvent(decoded);
          } catch {
            // onEvent errors must not abort replay iteration
          }
        }
      }

      const lastRawEvent = rawEvents[rawEvents.length - 1];
      const lastRawLedger = typeof lastRawEvent.ledger === 'number'
        ? lastRawEvent.ledger
        : parseInt(String(lastRawEvent.ledger ?? '0'), 10);

      const nextCursor = (res as { cursor?: string }).cursor || (lastRawEvent as { pagingToken?: string }).pagingToken;

      if (
        lastRawLedger <= currentWindowEnd &&
        nextCursor &&
        nextCursor !== cursor &&
        newEventsInBatch > 0 &&
        rawEvents.length >= limitPerPage
      ) {
        cursor = nextCursor;
      } else {
        hasMorePagesInWindow = false;
      }
    }

    currentWindowStart = currentWindowEnd + 1;
  }

  allEvents.sort((a, b) => a.ledger - b.ledger);
  return allEvents;
}

