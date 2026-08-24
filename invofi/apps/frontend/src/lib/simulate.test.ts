import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Account,
  Contract,
  SorobanDataBuilder,
  nativeToScVal,
  rpc as SorobanRpc,
  xdr,
} from '@stellar/stellar-sdk';

/**
 * Unit coverage for the simulation layer (Issue #216).
 *
 * `simulateContractCall` is the single gate every state-changing transaction
 * passes through, so the three behaviours the issue calls out are pinned here:
 * effects are parsed (not just "ok"), failures are surfaced as hard errors,
 * and identical calls inside the 5 s window reuse one RPC round trip while a
 * changed argument does not.
 */

const simulateTransaction = vi.fn();
const getAccount = vi.fn();

vi.mock('@stellar/stellar-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@stellar/stellar-sdk')>();
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: class {
        getAccount = getAccount;
        simulateTransaction = simulateTransaction;
      },
    },
  };
});

const { simulateContractCall, encodeSymbol, encodeAddress } = await import('./simulate');

const SOURCE = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';
const RECIPIENT = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6';
const CONTRACT = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7';

/** A base64 `DiagnosticEvent` holding one SEP-41 `transfer`, as the RPC emits. */
function transferEventXdr(amount: bigint): string {
  const body = new xdr.ContractEventBody(
    0,
    new xdr.ContractEventV0({
      topics: [
        nativeToScVal('transfer', { type: 'symbol' }),
        nativeToScVal(SOURCE, { type: 'address' }),
        nativeToScVal(RECIPIENT, { type: 'address' }),
      ],
      data: nativeToScVal(amount, { type: 'i128' }),
    }),
  );
  const event = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: new Contract(CONTRACT).address().toBuffer() as unknown as xdr.Hash,
    type: xdr.ContractEventType.contract(),
    body,
  });
  return new xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event }).toXDR('base64');
}

const CONTRACT_ADDRESS = new Contract(CONTRACT).address().toScAddress();
const ENTRY_KEY = nativeToScVal(['Invoice', 'inv_state'], { type: ['symbol', 'symbol'] });

/** The ledger key an invoice status write would touch. */
function invoiceLedgerKey(): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: CONTRACT_ADDRESS,
      key: ENTRY_KEY,
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );
}

/** The corresponding ledger entry holding `status`. */
function invoiceLedgerEntry(status: number): xdr.LedgerEntry {
  return new xdr.LedgerEntry({
    lastModifiedLedgerSeq: 1,
    data: xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ext: new xdr.ExtensionPoint(0),
        contract: CONTRACT_ADDRESS,
        key: ENTRY_KEY,
        durability: xdr.ContractDataDurability.persistent(),
        val: nativeToScVal(status, { type: 'u32' }),
      }),
    ),
    ext: new xdr.LedgerEntryExt(0),
  });
}

function successResponse(amount = 25_000_000n, withStateChange = false) {
  return SorobanRpc.parseRawSimulation({
    id: '1',
    latestLedger: 5_000_000,
    transactionData: new SorobanDataBuilder().build().toXDR('base64'),
    minResourceFee: '4321',
    events: [transferEventXdr(amount)],
    results: [{ auth: [], xdr: nativeToScVal(1, { type: 'u32' }).toXDR('base64') }],
    ...(withStateChange
      ? {
          stateChanges: [
            {
              type: 2,
              key: invoiceLedgerKey().toXDR('base64'),
              before: invoiceLedgerEntry(0).toXDR('base64'),
              after: invoiceLedgerEntry(4).toXDR('base64'),
            },
          ],
        }
      : {}),
  });
}

function errorResponse(message: string) {
  return SorobanRpc.parseRawSimulation({ id: '1', latestLedger: 5_000_000, error: message });
}

beforeEach(() => {
  simulateTransaction.mockReset();
  getAccount.mockReset();
  getAccount.mockResolvedValue(new Account(SOURCE, '1'));
});

describe('simulateContractCall', () => {
  it('parses SEP-41 transfers into concrete token movements', async () => {
    simulateTransaction.mockResolvedValue(successResponse(25_000_000n));

    const result = await simulateContractCall(
      CONTRACT,
      'accept_offer',
      [encodeSymbol('off_parse'), encodeAddress(SOURCE)],
      SOURCE,
    );

    expect(result.success).toBe(true);
    expect(result.resourceFee).toBe('4321');
    expect(result.tokenMovements).toEqual([
      { from: SOURCE, to: RECIPIENT, amount: '2.5', asset: 'SEP-41' },
    ]);
    expect(result.events[0]).toContain('transfer');
  });

  it('describes ledger state changes in readable terms', async () => {
    simulateTransaction.mockResolvedValue(successResponse(25_000_000n, true));

    const result = await simulateContractCall(
      CONTRACT,
      'cancel_invoice',
      [encodeSymbol('inv_state'), encodeAddress(SOURCE)],
      SOURCE,
    );

    expect(result.stateChanges).toHaveLength(1);
    const [change] = result.stateChanges;
    expect(change.type).toBe('updated');
    // Never `[object Object]` — the key names the contract and the entry.
    expect(change.key).toContain('Invoice.inv_state');
    expect(change.key).toContain(CONTRACT.slice(0, 6));
    expect(change.before).toBe('0');
    expect(change.after).toBe('4');
  });

  it('surfaces a simulation error instead of reporting success', async () => {
    simulateTransaction.mockResolvedValue(
      errorResponse('HostError: Error(Contract, #4) — only the originator can cancel'),
    );

    const result = await simulateContractCall(
      CONTRACT,
      'cancel_invoice',
      [encodeSymbol('inv_denied'), encodeAddress(SOURCE)],
      SOURCE,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('only the originator can cancel');
    expect(result.tokenMovements).toEqual([]);
  });

  it('serves a repeat call from the 5 s cache but re-simulates on changed args', async () => {
    simulateTransaction.mockResolvedValue(successResponse());

    const args = [encodeSymbol('inv_cache'), encodeAddress(SOURCE)];
    await simulateContractCall(CONTRACT, 'cancel_invoice', args, SOURCE);
    await simulateContractCall(CONTRACT, 'cancel_invoice', args, SOURCE);
    expect(simulateTransaction).toHaveBeenCalledTimes(1);

    // A changed argument must never be answered by the cached "ok".
    await simulateContractCall(
      CONTRACT,
      'cancel_invoice',
      [encodeSymbol('inv_cache_other'), encodeAddress(SOURCE)],
      SOURCE,
    );
    expect(simulateTransaction).toHaveBeenCalledTimes(2);
  });

  it('expires the cache after the 5 s TTL', async () => {
    vi.useFakeTimers();
    try {
      simulateTransaction.mockResolvedValue(successResponse());
      const args = [encodeSymbol('inv_ttl'), encodeAddress(SOURCE)];

      await simulateContractCall(CONTRACT, 'cancel_invoice', args, SOURCE);
      vi.advanceTimersByTime(5_001);
      await simulateContractCall(CONTRACT, 'cancel_invoice', args, SOURCE);

      expect(simulateTransaction).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
