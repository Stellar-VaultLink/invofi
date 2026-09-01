// ── InvofiClient — typed Soroban contract calls (Task 15) ────────────────────
// Ported out of apps/frontend/src/lib/contract.ts so contract-call logic lives
// in exactly one place. The SDK is framework-agnostic: no React, no Next.js,
// no wallet — callers inject their own `signTransaction` (and optionally a
// read source account) via createInvofiClient.

import {
  Asset,
  Contract,
  Horizon,
  Networks,
  Operation,
  rpc as SorobanRpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import type { InvofiClientConfig } from './config';
import type { Currency, FinancingOffer, Invoice } from './types';
import { SdkValidationError, ErrorCode } from './validation';
import {
  validateStellarAddress,
  validatePositiveI128,
  validateInterestRate,
  validateDuration,
  validateFutureTimestamp,
  validateSymbolId,
  validateCurrency,
  validateAssetString,
  validateConfigField,
} from './validation';
import { parseContractError, ContractError, type InvofiError } from './errors';
import { createCache, type CacheHandle } from './cache';
import { createContractsNamespace } from './contracts';
import { simulateOrThrow, simulateBatchOrThrow, SimulationError } from './simulation';

export { SdkValidationError, ErrorCode };

/** A single contract-call entry for the `batch()` method. */
export interface BatchCall {
  contractId: string;
  method: string;
  args: xdr.ScVal[];
}

/** A single contract call to submit via `client.send()` — same shape as `batch()` entries. */
export type SendCall = BatchCall;

/**
 * Typed result envelope returned by `client.send()` (#188).
 *
 * On success the decoded return value is carried under `{ ok: true, value }`;
 * on a decoded contract failure the typed `InvofiError` is carried under
 * `{ ok: false, error }`. This lets UI layers render a toast straight from
 * `error.message` (human-readable) and branch on `error.errorType`
 * (machine-readable) without a try/catch or regex-matching raw Soroban text.
 *
 * Network/validation failures are still thrown (they are not contract errors),
 * so callers know a rejection is a transport/config problem, not a decoded
 * domain failure.
 */
export type SendEnvelope<T> =
  | { ok: true; value: T }
  | { ok: false; error: InvofiError };

/**
 * The flat, hand-authored method surface `createInvofiClient` (and
 * `createMockClient`, for parity) builds. This is the interface the typed
 * call builder (`./contracts`, `client.contracts.*` — #215) wraps: each
 * `contracts.<name>.<method>` delegates to one of these, so signing/
 * simulation/validation logic keeps living in exactly one place.
 */
export interface InvofiClientMethods {
  cache: CacheHandle;
  registerInvoice(
    params: { id: string; amount: bigint; currency: Currency; dueDate: number },
    originatorAddress: string,
  ): Promise<Invoice>;
  getInvoice(id: string, sourceAccount?: string): Promise<Invoice>;
  cancelInvoice(invoiceId: string, originatorAddress: string): Promise<Invoice>;
  createOffer(
    params: {
      offerId: string;
      invoiceId: string;
      amount: bigint;
      currency: Currency;
      interestRate: number;
      duration: number;
    },
    lenderAddress: string,
  ): Promise<FinancingOffer>;
  getOffer(id: string, sourceAccount?: string): Promise<FinancingOffer>;
  acceptOffer(offerId: string, originatorAddress: string): Promise<FinancingOffer>;
  rejectOffer(offerId: string, originatorAddress: string): Promise<FinancingOffer>;
  repayInvoice(invoiceId: string, offerId: string, repayerAddress: string, amount: bigint): Promise<Invoice>;
  markOverdue(invoiceId: string, callerAddress: string): Promise<Invoice>;
  reclaimInvoice(invoiceId: string, offerId: string, lenderAddress: string): Promise<FinancingOffer>;
  getPositionTokenId(sourceAccount?: string): Promise<string | null>;
  getTokenBalance(tokenId: string, address: string): Promise<bigint>;
  getTokenDecimals(tokenId: string): Promise<number>;
  transferPositionToken(tokenId: string, fromAddress: string, toAddress: string, amount: bigint): Promise<void>;
  batch(calls: BatchCall[], sourceAddress: string): Promise<xdr.ScVal[]>;
  send<T = xdr.ScVal>(call: SendCall, sourceAddress: string, decode?: (val: xdr.ScVal) => T): Promise<SendEnvelope<T>>;
  hasPositionTrustline(address: string): Promise<boolean>;
  addPositionTrustline(address: string): Promise<void>;
}

/**
 * Invalidates the offline-cache (Task 218) key prefixes affected by a
 * state-changing contract call, once it has succeeded, against this
 * client's own `CacheHandle`. Best-effort and side-effect-only:
 * `cache.invalidate()` never throws (see cache.ts), so this never affects
 * the caller's return value. Fire-and-forget is intentional — callers
 * already have the fresh on-chain result; invalidation just makes sure a
 * subsequent cached read doesn't serve stale data.
 */
function invalidateCache(cache: CacheHandle, prefixes: string[]): void {
  for (const prefix of prefixes) {
    void cache.invalidate(prefix);
  }
}

const BASE_FEE = '100';

/**
 * Pull return values out of a successful batch transaction.
 *
 * stellar-sdk v16 types a successful tx with a single `returnValue` and
 * `resultMetaXdr.v3().sorobanMeta().returnValue()` — not a per-op array.
 * When the caller submitted N operations we still return N entries so
 * `batch()` keeps its documented length contract; extra slots are `scvVoid`.
 */
function collectBatchReturnValues(
  result: SorobanRpc.Api.GetSuccessfulTransactionResponse,
  expected: number,
): xdr.ScVal[] {
  let first: xdr.ScVal | undefined;
  try {
    first = result.resultMetaXdr.v3()?.sorobanMeta()?.returnValue();
  } catch {
    // Discriminant isn't v3 (or meta is missing).
  }
  first ??= result.returnValue ?? xdr.ScVal.scvVoid();

  const values: xdr.ScVal[] = [first];
  while (values.length < expected) {
    values.push(xdr.ScVal.scvVoid());
  }
  return values;
}

/** A "CODE:ISSUER" asset string, e.g. "POS:GBDD…". */
function parseAssetParts(asset: string): { code: string; issuer: string } {
  const [code, issuer] = asset.split(':');
  if (!code || !issuer) {
    throw new Error(`Invalid asset string: ${asset} (expected "CODE:ISSUER")`);
  }
  return { code, issuer };
}

/** Is this a testnet config (public network has no friendbot)? */
function isTestnet(cfg: InvofiClientConfig): boolean {
  return cfg.networkPassphrase === Networks.TESTNET;
}

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

export function createInvofiClient(cfg: InvofiClientConfig) {
  // ── Validate config at construction time ──────────────────────────────────
  validateConfigField(cfg.rpcUrl,           'cfg.rpcUrl');
  validateConfigField(cfg.horizonUrl,       'cfg.horizonUrl');
  validateConfigField(cfg.networkPassphrase,'cfg.networkPassphrase');
  validateConfigField(cfg.registryId,       'cfg.registryId');
  validateConfigField(cfg.financingId,      'cfg.financingId');
  validateConfigField(cfg.repaymentId,      'cfg.repaymentId');
  if (typeof cfg.signTransaction !== 'function') {
    throw new SdkValidationError(
      ErrorCode.MISSING_CONFIG,
      'cfg.signTransaction',
      'cfg.signTransaction: required configuration field is missing or not a function',
    );
  }
  // positionTokenAsset is optional; validate format only when supplied
  if (cfg.positionTokenAsset !== undefined) {
    validateAssetString(cfg.positionTokenAsset, 'cfg.positionTokenAsset');
  }

  // A cache handle scoped to this network + connected account (Task 218),
  // owned by this client instance — not module-global state — so a client
  // built for one wallet/network never reads another's cached data, and
  // concurrent clients for different accounts never race over which
  // database is "current" (PR #236 review). A caller that rebuilds the
  // client on wallet/account change (the normal React pattern) gets a
  // freshly-scoped cache for free.
  const cache = createCache({ network: cfg.networkPassphrase, accountAddress: cfg.accountAddress });

  const server = () => new SorobanRpc.Server(cfg.rpcUrl, { allowHttp: false });
  const horizon = () => new Horizon.Server(cfg.horizonUrl);

  /**
   * Ensure `address` exists in the ledger so Soroban can simulate/build
   * transactions against it. On testnet a missing account is funded via
   * Friendbot and re-polled; on mainnet we fail with a clear message.
   */
  async function ensureAccount(rpcServer: SorobanRpc.Server, address: string): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await rpcServer.getAccount(address);
        return;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const missing = msg.includes('Account not found') || msg.includes('account not found') || msg.includes('404');
        if (!missing) throw err;
        if (!isTestnet(cfg)) {
          throw new Error('Your wallet has no XLM. Fund your Stellar mainnet account with at least 1 XLM and try again.');
        }
        const res = await fetch(`https://friendbot.stellar.org?addr=${encodeURIComponent(address)}`);
        if (!res.ok && res.status !== 400) {
          throw new Error(`Friendbot funding failed: ${res.status}`);
        }
        await new Promise(r => setTimeout(r, 3000)); // friendbot confirms next ledger
      }
    }
    throw new Error(`Account ${address.slice(0, 8)}… could not be confirmed after funding`);
  }

  /**
   * Sign-and-submit a state-changing contract call.
   * Returns the call's return value (or scvVoid when the contract returns void).
   *
   * The transaction is validated via the simulation engine (#220) before
   * signing, providing user-friendly error messages and suggested fixes
   * when the simulation fails. Simulation results are cached for 30 seconds
   * so repeated attempts with the same parameters don't hit the network.
   */
  async function invokeContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    sourceAddress: string,
  ): Promise<xdr.ScVal> {
    const rpc = server();
    await ensureAccount(rpc, sourceAddress);
    const account = await rpc.getAccount(sourceAddress);
    const contract = new Contract(contractId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: cfg.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    // Simulate before signing — catches errors early with user-friendly messages.
    const assembledTx = await simulateOrThrow(rpc, tx, cfg.networkPassphrase);

    const signedXdr = await cfg.signTransaction(assembledTx.toXDR(), cfg.networkPassphrase);
    const signedTx = new Transaction(signedXdr, cfg.networkPassphrase);

    const sendResult = await rpc.sendTransaction(signedTx);
    if (sendResult.status === 'ERROR') {
      throw parseContractError(sendResult.errorResult, 'Transaction failed');
    }

    let getResult = await rpc.getTransaction(sendResult.hash);
    for (let attempts = 0; attempts < 20 && getResult.status === 'NOT_FOUND'; attempts++) {
      await new Promise(r => setTimeout(r, 1000));
      getResult = await rpc.getTransaction(sendResult.hash);
    }

    if (getResult.status !== 'SUCCESS') {
      throw parseContractError(getResult, `Transaction did not succeed (status: ${getResult.status})`);
    }

    return getResult.returnValue ?? xdr.ScVal.scvVoid();
  }

  /**
   * Read-only contract call via simulateTransaction (no signing).
   *
   * `sourceAccount` is optional: when given (the connected wallet), reads use
   * it directly (funding it first on testnet if needed). When omitted we fall
   * back to a fixed read account that is friendbot-funded on testnet — this
   * avoids the broken "throw-away account" pattern that failed reads when the
   * account did not exist in the ledger.
   */
  async function readContract(
    contractId: string,
    method: string,
    args: xdr.ScVal[],
    sourceAccount?: string,
  ): Promise<xdr.ScVal> {
    const rpc = server();
    // Fixed read account — funded via friendbot on testnet. Public networks
    // cannot fund accounts, so callers should pass a real sourceAccount there.
    const readSource = sourceAccount ?? 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
    await ensureAccount(rpc, readSource);
    const account = await rpc.getAccount(readSource);
    const contract = new Contract(contractId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: cfg.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      throw parseContractError(sim.error, 'Read failed');
    }
    if (!SorobanRpc.Api.isSimulationSuccess(sim) || !sim.result) {
      throw new Error('Read simulation returned no result');
    }
    return sim.result.retval;
  }

  function parseInvoice(val: xdr.ScVal): Invoice {
    return scValToNative(val) as Invoice;
  }

  function parseOffer(val: xdr.ScVal): FinancingOffer {
    return scValToNative(val) as FinancingOffer;
  }

  const base: InvofiClientMethods = {
    /**
     * This client's offline-cache handle (Task 218), scoped to
     * `cfg.networkPassphrase`/`cfg.accountAddress`. State-changing methods
     * below already invalidate the affected prefixes on success; consumers
     * only need this directly for reads (`cache.staleWhileRevalidate(...)`)
     * or to clear it on an explicit wallet disconnect (`cache.clearCache()`).
     */
    cache,

    // ── Registry contract ────────────────────────────────────────────────────

    /**
     * Register a new invoice on-chain.
     *
     * Validates: originator address, invoice ID, amount (> 0), currency,
     * and due date (must be in the future).
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    registerInvoice: async (
      params: { id: string; amount: bigint; currency: Currency; dueDate: number },
      originatorAddress: string,
    ): Promise<Invoice> => {
      validateStellarAddress(originatorAddress, 'originatorAddress');
      validateSymbolId(params.id, 'params.id');
      validatePositiveI128(params.amount, 'params.amount');
      validateCurrency(params.currency, 'params.currency');
      validateFutureTimestamp(params.dueDate, 'params.dueDate');

      const val = await invokeContract(
        cfg.registryId,
        'register_invoice',
        [
          encodeSymbol(params.id),
          encodeAddress(originatorAddress),
          encodeI128(params.amount),
          encodeSymbol(params.currency),
          encodeU64(BigInt(params.dueDate)),
        ],
        originatorAddress,
      );
      const invoice = parseInvoice(val);
      invalidateCache(cache, ['invoices:']);
      return invoice;
    },

    /**
     * Fetch a single invoice by ID (read-only).
     *
     * Validates: invoice ID.
     *
     * @throws {SdkValidationError} before any RPC call when ID is invalid.
     */
    getInvoice: (id: string, sourceAccount?: string): Promise<Invoice> => {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return readContract(cfg.registryId, 'get_invoice', [encodeSymbol(id)], sourceAccount).then(parseInvoice);
    },

    /**
     * Cancel a pending invoice.
     *
     * Validates: invoice ID and originator address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    cancelInvoice: async (invoiceId: string, originatorAddress: string): Promise<Invoice> => {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(originatorAddress, 'originatorAddress');

      const val = await invokeContract(
        cfg.registryId,
        'cancel_invoice',
        [encodeSymbol(invoiceId), encodeAddress(originatorAddress)],
        originatorAddress,
      );
      const invoice = parseInvoice(val);
      invalidateCache(cache, ['invoices:', `offers:${invoiceId}`]);
      return invoice;
    },

    // ── Financing contract ───────────────────────────────────────────────────

    /**
     * Submit a financing offer for an invoice.
     *
     * Validates: lender address, offer ID, invoice ID, amount (> 0), currency,
     * interest rate (1–10 000 bps), duration (1–MAX_DURATION_SECS seconds).
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    createOffer: async (
      params: {
        offerId: string;
        invoiceId: string;
        amount: bigint;
        currency: Currency;
        interestRate: number;
        duration: number;
      },
      lenderAddress: string,
    ): Promise<FinancingOffer> => {
      validateStellarAddress(lenderAddress, 'lenderAddress');
      validateSymbolId(params.offerId, 'params.offerId');
      validateSymbolId(params.invoiceId, 'params.invoiceId');
      validatePositiveI128(params.amount, 'params.amount');
      validateCurrency(params.currency, 'params.currency');
      validateInterestRate(params.interestRate, 'params.interestRate');
      validateDuration(params.duration, 'params.duration');

      const val = await invokeContract(
        cfg.financingId,
        'create_offer',
        [
          encodeSymbol(params.offerId),
          encodeSymbol(params.invoiceId),
          encodeAddress(lenderAddress),
          encodeI128(params.amount),
          encodeSymbol(params.currency),
          encodeU32(params.interestRate),
          encodeU64(BigInt(params.duration)),
        ],
        lenderAddress,
      );
      const offer = parseOffer(val);
      invalidateCache(cache, [`offers:${params.invoiceId}`]);
      return offer;
    },

    /**
     * Fetch a single offer by ID (read-only).
     *
     * Validates: offer ID.
     *
     * @throws {SdkValidationError} before any RPC call when ID is invalid.
     */
    getOffer: (id: string, sourceAccount?: string): Promise<FinancingOffer> => {
      validateSymbolId(id, 'id');
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return readContract(cfg.financingId, 'get_offer', [encodeSymbol(id)], sourceAccount).then(parseOffer);
    },

    /**
     * Accept a financing offer (business side).
     *
     * Validates: offer ID and originator address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    acceptOffer: async (offerId: string, originatorAddress: string): Promise<FinancingOffer> => {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');

      const val = await invokeContract(
        cfg.financingId,
        'accept_offer',
        [encodeSymbol(offerId), encodeAddress(originatorAddress)],
        originatorAddress,
      );
      const offer = parseOffer(val);
      // Accepting an offer moves the invoice to Financed, mints a position
      // token to the lender, and settles this offer — all three cache
      // families are affected.
      invalidateCache(cache, ['invoices:', `offers:${offer.invoice_id}`, 'positions:']);
      return offer;
    },

    /**
     * Reject a financing offer (business side).
     *
     * Validates: offer ID and originator address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    rejectOffer: async (offerId: string, originatorAddress: string): Promise<FinancingOffer> => {
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(originatorAddress, 'originatorAddress');

      const val = await invokeContract(
        cfg.financingId,
        'reject_offer',
        [encodeSymbol(offerId), encodeAddress(originatorAddress)],
        originatorAddress,
      );
      const offer = parseOffer(val);
      invalidateCache(cache, [`offers:${offer.invoice_id}`]);
      return offer;
    },

    // ── Repayment contract ───────────────────────────────────────────────────

    /**
     * Submit a (partial or full) repayment toward a financed invoice.
     *
     * Validates: invoice ID, offer ID, repayer address, repayment amount (> 0).
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    repayInvoice: async (
      invoiceId: string,
      offerId: string,
      repayerAddress: string,
      amount: bigint,
    ): Promise<Invoice> => {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(repayerAddress, 'repayerAddress');
      validatePositiveI128(amount, 'amount');

      const val = await invokeContract(
        cfg.repaymentId,
        'repay_invoice',
        [
          encodeSymbol(invoiceId),
          encodeSymbol(offerId),
          encodeAddress(repayerAddress),
          encodeI128(amount),
        ],
        repayerAddress,
      );
      const invoice = parseInvoice(val);
      invalidateCache(cache, ['invoices:', `offers:${invoiceId}`, 'positions:']);
      return invoice;
    },

    /**
     * Mark a past-due Financed invoice as Overdue (permissionless keeper call).
     *
     * Validates: invoice ID and caller address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    markOverdue: async (invoiceId: string, callerAddress: string): Promise<Invoice> => {
      validateSymbolId(invoiceId, 'invoiceId');
      validateStellarAddress(callerAddress, 'callerAddress');

      const val = await invokeContract(
        cfg.repaymentId,
        'mark_overdue',
        [encodeSymbol(invoiceId)],
        callerAddress,
      );
      const invoice = parseInvoice(val);
      invalidateCache(cache, ['invoices:']);
      return invoice;
    },

    /**
     * Reclaim an overdue invoice after the grace period (lender call).
     *
     * Validates: invoice ID, offer ID, lender address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    reclaimInvoice: async (invoiceId: string, offerId: string, lenderAddress: string): Promise<FinancingOffer> => {
      validateSymbolId(invoiceId, 'invoiceId');
      validateSymbolId(offerId, 'offerId');
      validateStellarAddress(lenderAddress, 'lenderAddress');

      const val = await invokeContract(
        cfg.repaymentId,
        'reclaim_invoice',
        [encodeSymbol(invoiceId), encodeSymbol(offerId), encodeAddress(lenderAddress)],
        lenderAddress,
      );
      const offer = parseOffer(val);
      invalidateCache(cache, ['invoices:', `offers:${invoiceId}`, 'positions:']);
      return offer;
    },

    // ── Position tokens (Task 7/8: SEP-41 claim tokens) ─────────────────────
    // Minted to the lender on offer acceptance (1 token = 1 base unit of
    // financed principal — ADR-0002). Balance reads + transfers are plain
    // SEP-41 token-contract calls; the token address comes from the financing
    // contract (single source of truth, no separate env var).

    /**
     * Get the position token contract ID from the financing contract.
     */
    getPositionTokenId: (sourceAccount?: string): Promise<string | null> => {
      if (sourceAccount !== undefined) validateStellarAddress(sourceAccount, 'sourceAccount');
      return readContract(cfg.financingId, 'get_position_token', [], sourceAccount).then(
        val => (scValToNative(val) as string | null) ?? null,
      );
    },

    /**
     * Get the token balance for an address.
     *
     * Validates: token contract ID and holder address.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    getTokenBalance: (tokenId: string, address: string): Promise<bigint> => {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(address, 'address');
      return readContract(tokenId, 'balance', [encodeAddress(address)]).then(val => scValToNative(val) as bigint);
    },

    /**
     * Get the decimal precision of a token contract.
     *
     * Validates: token contract ID.
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    getTokenDecimals: (tokenId: string): Promise<number> => {
      validateStellarAddress(tokenId, 'tokenId');
      return readContract(tokenId, 'decimals', []).then(val => scValToNative(val) as number);
    },

    /**
     * Transfer position tokens from one wallet to another.
     *
     * Validates: token contract ID, sender address, recipient address,
     * and transfer amount (> 0).
     *
     * @throws {SdkValidationError} before any RPC call when inputs are invalid.
     */
    transferPositionToken: async (
      tokenId: string,
      fromAddress: string,
      toAddress: string,
      amount: bigint,
    ): Promise<void> => {
      validateStellarAddress(tokenId, 'tokenId');
      validateStellarAddress(fromAddress, 'fromAddress');
      validateStellarAddress(toAddress, 'toAddress');
      validatePositiveI128(amount, 'amount');

      await invokeContract(
        tokenId,
        'transfer',
        [encodeAddress(fromAddress), encodeAddress(toAddress), encodeI128(amount)],
        fromAddress,
      );
      invalidateCache(cache, [`positions:${fromAddress}`, `positions:${toAddress}`]);
    },

    // ── Batch transaction builder (atomic multi-op) ──────────────────────────

    /**
     * Build, sign, and submit a single Soroban transaction containing
     * multiple contract-call operations. All calls succeed or fail atomically
     * (all-or-nothing).
     *
     * @param calls  Array of `{ contractId, method, args }` — each entry
     *               becomes one `contract.call()` operation inside the
     *               transaction, in order.
     * @param sourceAddress  The Stellar account that signs and pays for
     *                       the transaction.
     * @returns Array of `xdr.ScVal` return values, one per call, in the
     *          same order as the input array.
     *
     * @throws {SdkValidationError} when `calls` is empty or inputs are invalid.
     * @throws {ContractError}       when simulation, signing, or submission
     *                               fails.
     */
    batch: async (
      calls: BatchCall[],
      sourceAddress: string,
    ): Promise<xdr.ScVal[]> => {
      if (!Array.isArray(calls) || calls.length === 0) {
        throw new SdkValidationError(
          ErrorCode.INVALID_AMOUNT,
          'calls',
          'batch() requires at least one call in the array',
        );
      }
      validateStellarAddress(sourceAddress, 'sourceAddress');

      const rpc = server();
      await ensureAccount(rpc, sourceAddress);
      const account = await rpc.getAccount(sourceAddress);

      // Keep the builder and the built Transaction on separate bindings —
      // `addOperation` returns TransactionBuilder, `.build()` returns Transaction.
      const builder = new TransactionBuilder(account, {
        fee: String(Number(BASE_FEE) * calls.length),
        networkPassphrase: cfg.networkPassphrase,
      });
      for (const call of calls) {
        const contract = new Contract(call.contractId);
        builder.addOperation(contract.call(call.method, ...call.args));
      }
      const tx = builder.setTimeout(30).build();

      // Simulate the entire batch before signing — catches errors early.
      const assembledTx = await simulateBatchOrThrow(rpc, tx, cfg.networkPassphrase);
      const signedXdr = await cfg.signTransaction(assembledTx.toXDR(), cfg.networkPassphrase);
      const signedTx = new Transaction(signedXdr, cfg.networkPassphrase);

      const sendResult = await rpc.sendTransaction(signedTx);
      if (sendResult.status === 'ERROR') {
        throw parseContractError(sendResult.errorResult, 'Batch transaction failed');
      }

      let getResult = await rpc.getTransaction(sendResult.hash);
      for (let attempts = 0; attempts < 20 && getResult.status === 'NOT_FOUND'; attempts++) {
        await new Promise(r => setTimeout(r, 1000));
        getResult = await rpc.getTransaction(sendResult.hash);
      }

      if (getResult.status !== 'SUCCESS') {
        throw parseContractError(getResult, `Batch transaction did not succeed (status: ${getResult.status})`);
      }

      return collectBatchReturnValues(getResult, calls.length);
    },

    // ── Typed envelope wrapper (#188) ───────────────────────────────────────
    // `send()` is a single-call convenience over the contract-invocation path
    // that returns a typed `SendEnvelope` instead of throwing. Decoded
    // contract failures (auth, insufficient balance, paused, not-found, …)
    // surface as `{ ok: false, error: InvofiError }` so UI layers can render a
    // toast from `error.message` and branch on `error.errorType` without
    // try/catch or regex-matching raw Soroban text. Network/validation
    // failures are still thrown — they are not decoded domain errors.

    /**
     * Submit a single contract call and return a typed result envelope.
     *
     * @param call          `{ contractId, method, args }` — one operation.
     * @param sourceAddress The Stellar account that signs and pays.
     * @param decode        Optional mapper from the raw `xdr.ScVal` return to
     *                      a domain value (e.g. `scValToNative`). Defaults to
     *                      the raw `ScVal`.
     * @returns `{ ok: true, value }` on success, or
     *          `{ ok: false, error: InvofiError }` on a decoded contract
     *          failure. Network/validation failures still reject.
     */
    send: async <T = xdr.ScVal>(
      call: SendCall,
      sourceAddress: string,
      decode?: (val: xdr.ScVal) => T,
    ): Promise<SendEnvelope<T>> => {
      validateStellarAddress(sourceAddress, 'sourceAddress');
      try {
        const val = await invokeContract(call.contractId, call.method, call.args, sourceAddress);
        return { ok: true, value: decode ? decode(val) : (val as unknown as T) };
      } catch (err) {
        // Decoded domain failures go into the envelope; everything else
        // (validation, transport) keeps rejecting so the caller knows it is
        // not a decoded contract error.
        if (err instanceof ContractError) {
          return { ok: false, error: err };
        }
        throw err;
      }
    },

    // ── Position-token trustline support ─────────────────────────────────────
    // POS is a Stellar asset, so a holder needs a trustline before the
    // financing contract can mint to them (accept_offer) or a transfer can
    // credit them.

    /**
     * Check whether an address has a trustline for the position token.
     *
     * Validates: holder address. Also requires `cfg.positionTokenAsset` to be set.
     *
     * @throws {SdkValidationError} if address is invalid or config is missing.
     */
    hasPositionTrustline: async (address: string): Promise<boolean> => {
      validateStellarAddress(address, 'address');
      if (!cfg.positionTokenAsset) {
        throw new SdkValidationError(
          ErrorCode.MISSING_CONFIG,
          'cfg.positionTokenAsset',
          'cfg.positionTokenAsset: required for trustline operations but not set in config',
        );
      }
      const { code, issuer } = parseAssetParts(cfg.positionTokenAsset);
      const account = await horizon().loadAccount(address);
      return account.balances.some(
        b => {
          const bal = b as { asset_code?: string; asset_issuer?: string };
          return bal.asset_code === code && bal.asset_issuer === issuer;
        },
      );
    },

    /**
     * Add a trustline for the position token to the given wallet.
     *
     * Validates: holder address. Also requires `cfg.positionTokenAsset` to be set.
     *
     * @throws {SdkValidationError} if address is invalid or config is missing.
     */
    addPositionTrustline: async (address: string): Promise<void> => {
      validateStellarAddress(address, 'address');
      if (!cfg.positionTokenAsset) {
        throw new SdkValidationError(
          ErrorCode.MISSING_CONFIG,
          'cfg.positionTokenAsset',
          'cfg.positionTokenAsset: required for trustline operations but not set in config',
        );
      }
      const { code, issuer } = parseAssetParts(cfg.positionTokenAsset);
      const account = await horizon().loadAccount(address);
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: cfg.networkPassphrase,
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset(code, issuer),
            limit: '922337203685.4775807',
          }),
        )
        .setTimeout(60)
        .build();
      const signedXdr = await cfg.signTransaction(tx.toXDR(), cfg.networkPassphrase);
      const signedTx = new Transaction(signedXdr, cfg.networkPassphrase);
      await horizon().submitTransaction(signedTx);
    },
  };

  return {
    ...base,
    /**
     * Typed, namespaced contract calls (#215):
     * `client.contracts.financing.acceptOffer({ offer_id, originator })`.
     * Each method is compile-time checked against the ABI in
     * `src/types/contract-abi.ts` (wrong name or param type is a TS error),
     * validates its params against that same ABI at runtime, then delegates
     * to the equivalent method above — no duplicate contract-call logic.
     */
    contracts: createContractsNamespace(base),
  };
}

export type InvofiClient = ReturnType<typeof createInvofiClient>;
