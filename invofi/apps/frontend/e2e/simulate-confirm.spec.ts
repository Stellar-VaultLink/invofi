import { test, expect, type Page } from '@playwright/test';
import {
  authenticate,
  mockSupabaseMirror,
  mockFreighter,
  invoiceScVal,
  ORIGINATOR,
  SMOKE_INVOICE,
  InvoiceStatus,
} from './fixtures';
import { Contract, TransactionBuilder, SorobanDataBuilder, nativeToScVal, xdr } from '@stellar/stellar-sdk';

/**
 * Transaction simulation before submission (Issue #216).
 *
 * Before broadcasting any state-changing transaction, the UI simulates it
 * against the current ledger and surfaces the expected effects in a
 * confirmation dialog. These tests drive the real path — a connected wallet,
 * the real `simulateContractCall` helper, the real `SimulateConfirm` dialog —
 * and stub only the Soroban RPC boundary.
 */

const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';
const LENDER = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6';
const REGISTRY_ID = 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7';

/** Decodes which contract function a `simulateTransaction` request invokes. */
function invokedFunction(txXdr: string): string | null {
  try {
    const tx = TransactionBuilder.fromXDR(txXdr, NETWORK_PASSPHRASE);
    const op = ('operations' in tx ? tx.operations[0] : null) as
      | { func?: xdr.HostFunction }
      | null;
    if (!op?.func) return null;
    return op.func.invokeContract().functionName().toString();
  } catch {
    return null;
  }
}

/**
 * A `DiagnosticEvent` carrying a SEP-41 `transfer`, base64-encoded exactly as
 * the Soroban RPC returns it (the SDK decodes `events[]` from XDR, so a plain
 * JSON object here would fail to parse).
 */
function transferEventXdr(): string {
  const topics = [
    nativeToScVal('transfer', { type: 'symbol' }),
    nativeToScVal(ORIGINATOR, { type: 'address' }),
    nativeToScVal(LENDER, { type: 'address' }),
  ];
  const body = new xdr.ContractEventBody(
    0,
    new xdr.ContractEventV0({ topics, data: nativeToScVal(25_000_000n, { type: 'i128' }) }),
  );
  const event = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    // The generated XDR type wants an `Opaque[]`; a 32-byte Buffer is what
    // the encoder actually accepts (and what stellar-base itself passes).
    contractId: new Contract(REGISTRY_ID).address().toBuffer() as unknown as xdr.Hash,
    type: xdr.ContractEventType.contract(),
    body,
  });
  return new xdr.DiagnosticEvent({ inSuccessfulContractCall: true, event }).toXDR('base64');
}

/** The contract-data ledger entry a status write would touch. */
const CONTRACT_ADDRESS = new Contract(REGISTRY_ID).address().toScAddress();
const ENTRY_KEY = nativeToScVal(['Invoice', SMOKE_INVOICE.id], { type: ['symbol', 'symbol'] });

function invoiceLedgerEntry(status: number): string {
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
  }).toXDR('base64');
}

/** A successful simulation carrying one SEP-41 `transfer` and one state write. */
function successResult() {
  return {
    transactionData: new SorobanDataBuilder().build().toXDR('base64'),
    minResourceFee: '200',
    results: [{ auth: [], xdr: nativeToScVal(1, { type: 'u32' }).toXDR('base64') }],
    events: [transferEventXdr()],
    stateChanges: [
      {
        type: 2,
        key: xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: CONTRACT_ADDRESS,
            key: ENTRY_KEY,
            durability: xdr.ContractDataDurability.persistent(),
          }),
        ).toXDR('base64'),
        before: invoiceLedgerEntry(0),
        after: invoiceLedgerEntry(4),
      },
    ],
    latestLedger: 5_000_000,
  };
}

/**
 * Routes the Soroban RPC so that read calls (`get_invoice`) always resolve
 * with the fixture invoice, while the state-changing call under test resolves
 * according to `mode`. Registered last so it wins over `authenticate`'s
 * broader stub.
 */
async function mockSimulation(
  page: Page,
  mode: 'success' | 'error',
): Promise<void> {
  await page.route('**/soroban-testnet.stellar.org/**', async (route) => {
    let body: { method?: string; params?: { transaction?: string } } | null;
    try {
      body = route.request().postDataJSON();
    } catch {
      return route.fallback();
    }
    if (body?.method !== 'simulateTransaction') return route.fallback();

    const fn = invokedFunction(body.params?.transaction ?? '');

    // Reads must always succeed, otherwise the page never renders the
    // action buttons the test is about to click.
    if (fn === 'get_invoice' || fn === null) {
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            transactionData: new SorobanDataBuilder().build().toXDR('base64'),
            minResourceFee: '100',
            results: [
              {
                auth: [],
                xdr: invoiceScVal({
                  ...SMOKE_INVOICE,
                  due_date: 2_000_000_000n,
                  status: InvoiceStatus.Pending,
                }).toXDR('base64'),
              },
            ],
            events: [],
            latestLedger: 5_000_000,
          },
        },
      });
    }

    if (mode === 'error') {
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            error: 'contract: unauthorized — only originator can cancel',
            latestLedger: 5_000_000,
          },
        },
      });
    }

    return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: successResult() } });
  });
}

const MIRROR_INVOICE = {
  id: SMOKE_INVOICE.id,
  originator: ORIGINATOR,
  amount: '2.0000000',
  currency: 'XLM' as const,
  due_date: '2033-01-01T00:00:00.000Z',
  status: 'Pending' as const,
  created_at: '2026-08-01T00:00:00.000Z',
};

const MIRROR_OFFER = {
  id: 'off_smoke_sim',
  invoice_id: SMOKE_INVOICE.id,
  lender: LENDER,
  lender_id: '00000000-0000-4000-8000-00000000aaaa',
  amount: '10000.00',
  currency: 'USDC',
  interest_rate: 500,
  duration: 2_592_000,
  amount_repaid: '0',
  status: 'Pending',
  funded_at: 1_770_000_000,
  created_at: '2026-08-01T00:00:00.000Z',
};

test.describe('transaction simulation', () => {
  test('cancel: simulation dialog previews token movements', async ({ page }) => {
    await mockFreighter(page);
    await authenticate(page);
    await mockSupabaseMirror(page, { invoices: [MIRROR_INVOICE] });
    await mockSimulation(page, 'success');

    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);

    const cancelBtn = page.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Preview: Cancel Invoice')).toBeVisible();

    // The parsed SEP-41 transfer event is surfaced to the user — decoded
    // strkeys, not `[object Object]`.
    await expect(dialog.getByText('Token Movements')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText('2.5 SEP-41')).toBeVisible();
    await expect(dialog.getByText(`${ORIGINATOR.slice(0, 6)}…${ORIGINATOR.slice(-4)}`)).toBeVisible();
    await expect(dialog.getByText(`${LENDER.slice(0, 6)}…${LENDER.slice(-4)}`)).toBeVisible();

    // …and the ledger entry the call would rewrite.
    await expect(dialog.getByText('State Changes')).toBeVisible();
    await expect(dialog.getByText(`updated`)).toBeVisible();
    await expect(dialog.getByText(new RegExp(`Invoice\\.${SMOKE_INVOICE.id}`))).toBeVisible();

    // Simulation succeeded → submission is allowed.
    await expect(dialog.getByRole('button', { name: 'Cancel Invoice' })).toBeEnabled();
  });

  test('cancel: failed simulation blocks submission', async ({ page }) => {
    await mockFreighter(page);
    await authenticate(page);
    await mockSupabaseMirror(page, { invoices: [MIRROR_INVOICE] });
    await mockSimulation(page, 'error');

    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);

    await page.getByRole('button', { name: 'Cancel', exact: true }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText('Transaction Would Fail')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(/unauthorized/)).toBeVisible();

    // Simulation failed → the confirm button is hard-blocked.
    await expect(dialog.getByRole('button', { name: 'Cancel Invoice' })).toBeDisabled();
  });

  test('offers: accept routes through simulation before submission', async ({ page }) => {
    await mockFreighter(page);
    await authenticate(page);
    await mockSupabaseMirror(page, {
      invoices: [MIRROR_INVOICE],
      offers: [MIRROR_OFFER],
    });
    await mockSimulation(page, 'success');

    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);

    const acceptBtn = page.getByRole('button', { name: 'Accept', exact: true });
    await expect(acceptBtn).toBeVisible({ timeout: 15_000 });
    await acceptBtn.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Preview: Accept Offer')).toBeVisible();
    await expect(dialog.getByText('Token Movements')).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('button', { name: 'Accept Offer' })).toBeEnabled();
  });
});
