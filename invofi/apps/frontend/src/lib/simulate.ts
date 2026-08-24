// ── Transaction simulation layer (Issue #216) ────────────────────────────────
// Before broadcasting any state-changing transaction, we simulate it against
// the current ledger to surface expected token movements, state changes, and
// errors — so users can preview effects before committing and avoid losing
// network fees on failed on-chain calls.
//
// The Stellar SDK's `invokeContract` already simulates internally, but those
// results are invisible to the UI. This module exposes the simulation as a
// first-class step with a 5-second cache keyed on exact call parameters.

import {
  Address,
  Contract,
  rpc as SorobanRpc,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE =
  (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') === 'mainnet'
    ? 'Public Global Stellar Network ; September 2015'
    : 'Test SDF Network ; September 2015';

const BASE_FEE = '100';
const CACHE_TTL_MS = 5_000;

// ── Types ───────────────────────────────────────────────────────────────────

export interface TokenMovement {
  from: string;
  to: string;
  amount: string;
  asset: string;
}

export interface StateChange {
  type: string;
  key: string;
  before: string | null;
  after: string | null;
}

export interface SimulationResult {
  success: boolean;
  error?: string;
  tokenMovements: TokenMovement[];
  stateChanges: StateChange[];
  events: string[];
  resourceFee: string;
  latestLedger: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function encodeSymbol(value: string): xdr.ScVal {
  return nativeToScVal(value, { type: 'symbol' });
}

function encodeAddress(address: string): xdr.ScVal {
  return nativeToScVal(address, { type: 'address' });
}

function encodeI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

function encodeU32(value: number): xdr.ScVal {
  return nativeToScVal(value, { type: 'u32' });
}

function encodeU64(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'u64' });
}

function cacheKey(contractId: string, method: string, args: xdr.ScVal[]): string {
  return `${contractId}:${method}:${args.map(a => a.toXDR('base64')).join(':')}`;
}

// ── Simulation cache ────────────────────────────────────────────────────────

const cache = new Map<string, { result: SimulationResult; ts: number }>();

function getCached(key: string): SimulationResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCached(key: string, result: SimulationResult): void {
  cache.set(key, { result, ts: Date.now() });
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Simulate a contract call and return a parsed result suitable for showing
 * in the SimulateConfirm dialog. Results are cached for 5 seconds keyed on
 * the exact (contractId, method, args) tuple so rapid re-renders don't
 * duplicate RPC calls.
 */
export async function simulateContractCall(
  contractId: string,
  method: string,
  args: xdr.ScVal[],
  sourceAddress: string,
): Promise<SimulationResult> {
  const key = cacheKey(contractId, method, args);
  const cached = getCached(key);
  if (cached) return cached;

  const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });

  // Ensure the source account exists in the ledger so simulation can proceed.
  let account;
  try {
    account = await server.getAccount(sourceAddress);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const missing = msg.includes('Account not found') || msg.includes('account not found') || msg.includes('404');
    if (!missing) throw err;
    // On testnet, fund via Friendbot before simulating.
    if (NETWORK_PASSPHRASE === 'Test SDF Network ; September 2015') {
      const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(sourceAddress)}`);
      if (!res.ok && res.status !== 400) {
        throw new Error(`Friendbot funding failed: ${res.status}`);
      }
      await new Promise(r => setTimeout(r, 3000));
      account = await server.getAccount(sourceAddress);
    } else {
      throw new Error('Your wallet has no XLM. Fund your Stellar mainnet account before simulating.');
    }
  }

  const contract = new Contract(contractId);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  const result = parseSimulationResponse(simResult);
  setCached(key, result);
  return result;
}

// ── Response parsing ────────────────────────────────────────────────────────

function parseSimulationResponse(
  simResult: SorobanRpc.Api.SimulateTransactionResponse,
): SimulationResult {
  const latestLedger = simResult.latestLedger;

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    return {
      success: false,
      error: simResult.error,
      tokenMovements: [],
      stateChanges: [],
      events: [],
      resourceFee: '0',
      latestLedger,
    };
  }

  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    return {
      success: false,
      error: 'Simulation returned an unexpected response shape',
      tokenMovements: [],
      stateChanges: [],
      events: [],
      resourceFee: '0',
      latestLedger,
    };
  }

  const tokenMovements = extractTokenMovements(simResult);
  const stateChanges = extractStateChanges(simResult);
  const events = extractEvents(simResult);

  return {
    success: true,
    tokenMovements,
    stateChanges,
    events,
    resourceFee: simResult.minResourceFee ?? '0',
    latestLedger,
  };
}

/**
 * Extract human-readable token movements from simulation state changes.
 *
 * On Soroban, token transfers (SEP-41) show up as ledger-entry balance changes.
 * A state change with type "data" on a "LedgerKeyData" whose key contains
 * "balance" before ≠ after represents a token movement — the delta is the
 * amount transferred. We reconstruct the from/to from the event topics.
 */
function extractTokenMovements(
  simResult: SorobanRpc.Api.SimulateTransactionSuccessResponse,
): TokenMovement[] {
  const movements: TokenMovement[] = [];
  const diagEvents = simResult.events ?? [];

  // SEP-41 transfer events: topic[0] = "transfer", topic[1] = from, topic[2] = to, data = amount
  for (const diagEvt of diagEvents) {
    try {
      const contractEvt = diagEvt.event();
      const body = contractEvt.body();
      const v0 = body.v0();
      const topics = v0.topics();
      if (topics.length >= 3) {
        const topic0 = topics[0];
        if (
          topic0?.switch().name === 'scvSymbol' &&
          topic0.sym().toString() === 'transfer'
        ) {
          const fromAddr = addressFromScVal(topics[1]);
          const toAddr = addressFromScVal(topics[2]);
          const value = v0.data();
          let amount = '0';
          if (value?.switch().name === 'scvI128') {
            const i128Val = value.i128();
            const hi = Number(i128Val.hi());
            const lo = Number(i128Val.lo());
            const bigVal = (BigInt(hi) << 64n) | BigInt(lo);
            // Convert from stroops to human units (7 decimals)
            const divisor = 10_000_000n;
            const whole = bigVal / divisor;
            const frac = bigVal % divisor;
            amount = frac > 0n
              ? `${whole}.${frac.toString().padStart(7, '0').replace(/0+$/, '')}`
              : whole.toString();
          }
          movements.push({ from: fromAddr, to: toAddr, amount, asset: 'SEP-41' });
        }
      }
    } catch {
      // Skip events that can't be parsed
    }
  }

  return movements;
}

/**
 * Extract state changes from the simulation result — these represent
 * ledger entries that would be modified if the transaction were submitted.
 */
function extractStateChanges(
  simResult: SorobanRpc.Api.SimulateTransactionSuccessResponse,
): StateChange[] {
  const changes: StateChange[] = [];
  const stateChanges = simResult.stateChanges ?? [];

  for (const change of stateChanges) {
    changes.push({
      type: LEDGER_CHANGE_TYPES[change.type] ?? String(change.type),
      key: describeLedgerKey(change.key),
      before: describeLedgerEntry(change.before),
      after: describeLedgerEntry(change.after),
    });
  }

  return changes;
}

/**
 * Extract diagnostic events from the simulation for display purposes.
 */
function extractEvents(
  simResult: SorobanRpc.Api.SimulateTransactionSuccessResponse,
): string[] {
  const events: string[] = [];
  const diagEvents = simResult.events ?? [];

  for (const diagEvt of diagEvents) {
    try {
      const contractEvt = diagEvt.event();
      const body = contractEvt.body();
      const v0 = body.v0();
      const topics = v0.topics();
      const labels = topics.map((t: xdr.ScVal) => {
        if (t?.switch().name === 'scvSymbol') return t.sym().toString();
        if (t?.switch().name === 'scvAddress') return shorten(addressFromScVal(t));
        return '…';
      });
      events.push(labels.join(' → '));
    } catch {
      // Skip unparseable events
    }
  }

  return events;
}

/**
 * Decodes an `ScAddress` topic into its strkey (`G…` / `C…`).
 *
 * `xdr.ScVal#address()` returns the raw XDR union, whose `toString()` is
 * `[object Object]` — rendering that in the dialog would defeat the whole
 * point of previewing who pays whom.
 */
function addressFromScVal(val: xdr.ScVal | undefined): string {
  if (!val) return 'unknown';
  try {
    return Address.fromScAddress(val.address()).toString();
  } catch {
    return 'unknown';
  }
}

/** `GABC…WXYZ` — the same eliding the dialog uses for wallet addresses. */
function shorten(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

const LEDGER_CHANGE_TYPES: Record<number, string> = {
  1: 'created',
  2: 'updated',
  3: 'deleted',
};

/** Human label for the ledger entry a state change touches. */
function describeLedgerKey(key: xdr.LedgerKey): string {
  const kind = key.switch().name;
  try {
    if (kind === 'contractData') {
      const data = key.contractData();
      const contractId = Address.fromScAddress(data.contract()).toString();
      return `${shorten(contractId)} · ${describeScVal(data.key())}`;
    }
    if (kind === 'account') {
      return `account ${shorten(Address.account(key.account().accountId().ed25519()).toString())}`;
    }
    if (kind === 'trustline') {
      return `trustline ${shorten(Address.account(key.trustLine().accountId().ed25519()).toString())}`;
    }
  } catch {
    // Fall through to the bare entry kind.
  }
  return kind;
}

/** Human summary of a ledger entry's contract-data payload. */
function describeLedgerEntry(entry: xdr.LedgerEntry | null | undefined): string | null {
  if (!entry) return null;
  try {
    const data = entry.data();
    if (data.switch().name === 'contractData') {
      return describeScVal(data.contractData().val());
    }
    return data.switch().name;
  } catch {
    return null;
  }
}

/** Best-effort readable rendering of an `ScVal` for the preview dialog. */
function describeScVal(val: xdr.ScVal): string {
  try {
    const native = scValToNative(val);
    if (Array.isArray(native)) return native.map(part => String(part)).join('.');
    if (native !== null && typeof native === 'object') {
      return Object.entries(native as Record<string, unknown>)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(', ');
    }
    return String(native);
  } catch {
    return val.switch().name;
  }
}

// ── Encoding re-exports (used by components to build args) ──────────────────

export { encodeSymbol, encodeAddress, encodeI128, encodeU32, encodeU64 };
