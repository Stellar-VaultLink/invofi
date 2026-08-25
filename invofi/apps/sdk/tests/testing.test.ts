/**
 * Unit tests — contract-interaction testing framework (#226)
 *
 * Covers the mock's testing surface: emitted protocol-event tracking, typed
 * domain failures (not found / unauthorized / insufficient balance / already
 * exists), deterministic failure injection (`failures` option, `failNext`,
 * `addFailure`), state control (`reset`, `setBalance`/`getBalance`,
 * `seededInvoices`/`seededOffers`), and the `createTestInvoice` /
 * `createTestOffer` fixture builders.
 */

import { describe, it, expect } from 'vitest';
import {
  createMockClient,
  createTestInvoice,
  createTestOffer,
  toStroops,
  STROOP_BASE,
  MOCK_WALLET_ADDRESS,
  MOCK_BUSINESS_A,
  MOCK_BUSINESS_B,
  MOCK_LENDER_B,
  MOCK_POSITION_TOKEN_ID,
  MOCK_REGISTRY_ID,
  MOCK_FINANCING_ID,
  MOCK_REPAYMENT_ID,
  ContractError,
  ContractErrorType,
} from '../src/index';
import { SdkValidationError } from '../src/validation';

describe('fixture builders — createTestInvoice', () => {
  it('produces valid deterministic defaults', () => {
    const invoice = createTestInvoice();
    expect(invoice.id).toBe('inv_test_001');
    expect(invoice.originator).toBe(MOCK_BUSINESS_A);
    expect(invoice.amount).toBe(100n * STROOP_BASE);
    expect(invoice.currency).toBe('XLM');
    expect(invoice.status).toBe('Pending');
    expect(invoice.due_date).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(invoice.created_at).toBeTruthy();
  });

  it('applies field overrides and the dueDate alias', () => {
    const due = Math.floor(Date.now() / 1000) + 10 * 86_400;
    const invoice = createTestInvoice({ id: 'inv_custom', amount: toStroops(5), currency: 'USDC', dueDate: due });
    expect(invoice.id).toBe('inv_custom');
    expect(invoice.amount).toBe(5n * STROOP_BASE);
    expect(invoice.currency).toBe('USDC');
    expect(invoice.due_date).toBe(due);
    // dueDate wins over due_date when both are supplied.
    const both = createTestInvoice({ due_date: due + 1, dueDate: due });
    expect(both.due_date).toBe(due);
  });

  it('is accepted by the mock client (registerInvoice) as-is', async () => {
    const client = createMockClient();
    const invoice = createTestInvoice();
    const registered = await client.registerInvoice(
      { id: invoice.id, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.due_date },
      invoice.originator,
    );
    expect(registered.status).toBe('Pending');
    expect((await client.getInvoice(invoice.id)).id).toBe(invoice.id);
  });
});

describe('fixture builders — createTestOffer', () => {
  it('produces valid deterministic defaults', () => {
    const offer = createTestOffer();
    expect(offer.id).toBe('off_test_001');
    expect(offer.invoice_id).toBe('inv_test_001');
    expect(offer.lender).toBe(MOCK_LENDER_B);
    expect(offer.amount).toBe(100n * STROOP_BASE);
    expect(offer.interest_rate).toBe(500);
    expect(offer.duration).toBe(30 * 86_400);
    expect(offer.amount_repaid).toBe(0n);
    expect(offer.status).toBe('Pending');
    expect(offer.funded_at).toBe(0);
  });

  it('applies field overrides and the invoiceId alias', () => {
    const offer = createTestOffer({ id: 'off_custom', invoiceId: 'inv_x', interest_rate: 800 });
    expect(offer.id).toBe('off_custom');
    expect(offer.invoice_id).toBe('inv_x');
    expect(offer.interest_rate).toBe(800);
    // invoiceId wins over invoice_id when both are supplied.
    const both = createTestOffer({ invoice_id: 'inv_y', invoiceId: 'inv_x' });
    expect(both.invoice_id).toBe('inv_x');
  });

  it('is accepted by the mock client (createOffer) as-is', async () => {
    const client = createMockClient();
    const invoice = createTestInvoice();
    await client.registerInvoice(
      { id: invoice.id, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.due_date },
      invoice.originator,
    );
    const offer = createTestOffer({ invoiceId: invoice.id });
    const created = await client.createOffer(
      {
        offerId: offer.id,
        invoiceId: offer.invoice_id,
        amount: offer.amount,
        currency: offer.currency,
        interestRate: offer.interest_rate,
        duration: offer.duration,
      },
      offer.lender,
    );
    expect(created.status).toBe('Pending');
  });
});

describe('event emission tracking', () => {
  it('records inv_reg on registerInvoice and inv_cxl on cancelInvoice', async () => {
    const client = createMockClient();
    const invoice = createTestInvoice();
    await client.registerInvoice(
      { id: invoice.id, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.due_date },
      invoice.originator,
    );
    expect(client.events).toHaveLength(1);
    const reg = client.events[0];
    expect(reg.type).toBe('inv_reg');
    expect(reg.subjectId).toBe(invoice.id);
    expect(reg.contractId).toBe(MOCK_REGISTRY_ID);
    expect(reg.ledger).toBeGreaterThan(0);
    expect(reg.txHash).toMatch(/^0+[0-9a-f]+$/);
    if (reg.type === 'inv_reg') {
      expect(reg.data.originator).toBe(invoice.originator);
      expect(reg.data.amount).toBe(invoice.amount);
    }

    await client.cancelInvoice(invoice.id, invoice.originator);
    const cxl = client.events[1];
    expect(cxl.type).toBe('inv_cxl');
    if (cxl.type === 'inv_cxl') expect(cxl.data.originator).toBe(invoice.originator);
  });

  it('records off_new, off_acc, off_rej with financing contract ids', async () => {
    const client = createMockClient();
    await client.createOffer(
      { offerId: 'off_t1', invoiceId: 'inv_mock_p002', amount: 25_000n, currency: 'XLM', interestRate: 500, duration: 86_400 },
      MOCK_WALLET_ADDRESS,
    );
    expect(client.events[0].type).toBe('off_new');
    expect(client.events[0].contractId).toBe(MOCK_FINANCING_ID);

    await client.acceptOffer('off_t1', MOCK_BUSINESS_B);
    const acc = client.events[1];
    expect(acc.type).toBe('off_acc');
    if (acc.type === 'off_acc') {
      expect(acc.data.invoiceId).toBe('inv_mock_p002');
      expect(acc.data.lender).toBe(MOCK_WALLET_ADDRESS);
      expect(acc.data.amount).toBe(25_000n);
    }

    await client.rejectOffer('off_mock_006', MOCK_BUSINESS_B);
    expect(client.events[2].type).toBe('off_rej');
    expect(client.events[2].contractId).toBe(MOCK_FINANCING_ID);
  });

  it('records inv_rep with fullyRepaid, inv_ovd, and off_def', async () => {
    const client = createMockClient();
    // Partial repayment → fullyRepaid: false.
    await client.repayInvoice('inv_mock_f001', 'off_mock_001', MOCK_BUSINESS_A, 1_000n);
    const partial = client.events[0];
    expect(partial.type).toBe('inv_rep');
    expect(partial.contractId).toBe(MOCK_REPAYMENT_ID);
    if (partial.type === 'inv_rep') {
      expect(partial.data.offerId).toBe('off_mock_001');
      expect(partial.data.amount).toBe(1_000n);
      expect(partial.data.fullyRepaid).toBe(false);
    }

    // Full repayment → fullyRepaid: true.
    const offer = await client.getOffer('off_mock_001');
    const totalDue = offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
    const outstanding = totalDue - offer.amount_repaid;
    await client.repayInvoice('inv_mock_f001', 'off_mock_001', MOCK_BUSINESS_A, outstanding);
    const full = client.events[1];
    if (full.type === 'inv_rep') expect(full.data.fullyRepaid).toBe(true);

    await client.markOverdue('inv_mock_p001', MOCK_BUSINESS_A);
    const ovd = client.events[2];
    expect(ovd.type).toBe('inv_ovd');
    if (ovd.type === 'inv_ovd') expect(ovd.data.dueDate).toBe(BigInt((await client.getInvoice('inv_mock_p001')).due_date));

    await client.reclaimInvoice('inv_mock_o001', 'off_mock_004', MOCK_WALLET_ADDRESS);
    const def = client.events[3];
    expect(def.type).toBe('off_def');
    if (def.type === 'off_def') {
      expect(def.data.invoiceId).toBe('inv_mock_o001');
      expect(def.data.lender).toBe(MOCK_WALLET_ADDRESS);
    }
  });

  it('does not record events for read-only calls, and clearEvents wipes the log', async () => {
    const client = createMockClient();
    await client.getInvoice('inv_mock_p001');
    await client.getOffer('off_mock_001');
    await client.getTokenBalance(MOCK_POSITION_TOKEN_ID, MOCK_WALLET_ADDRESS);
    expect(client.events).toHaveLength(0);

    await client.registerInvoice(
      { id: 'inv_evt', amount: 1_000n, currency: 'XLM', dueDate: Math.floor(Date.now() / 1000) + 86_400 },
      MOCK_BUSINESS_A,
    );
    expect(client.events).toHaveLength(1);
    client.clearEvents();
    expect(client.events).toHaveLength(0);
  });

  it('does not record an event when a call fails', async () => {
    const client = createMockClient();
    await expect(client.acceptOffer('off_mock_006', MOCK_WALLET_ADDRESS)).rejects.toMatchObject({
      errorType: ContractErrorType.UNAUTHORIZED,
    });
    expect(client.events).toHaveLength(0);
  });
});

describe('typed domain failures (#226)', () => {
  it('throws ContractError NOT_FOUND for missing resources', async () => {
    const client = createMockClient();
    await expect(client.getInvoice('inv_nope')).rejects.toMatchObject({
      errorType: ContractErrorType.NOT_FOUND,
    });
    await expect(client.getOffer('off_nope')).rejects.toMatchObject({
      errorType: ContractErrorType.NOT_FOUND,
    });
  });

  it('throws ContractError UNAUTHORIZED for auth failures', async () => {
    const client = createMockClient();
    await expect(client.cancelInvoice('inv_mock_p001', MOCK_WALLET_ADDRESS)).rejects.toMatchObject({
      errorType: ContractErrorType.UNAUTHORIZED,
    });
    await expect(client.acceptOffer('off_mock_006', MOCK_WALLET_ADDRESS)).rejects.toMatchObject({
      errorType: ContractErrorType.UNAUTHORIZED,
    });
    await expect(client.reclaimInvoice('inv_mock_o001', 'off_mock_004', MOCK_BUSINESS_A)).rejects.toMatchObject({
      errorType: ContractErrorType.UNAUTHORIZED,
    });
  });

  it('throws ContractError ALREADY_EXISTS for duplicate registrations', async () => {
    const client = createMockClient();
    await expect(
      client.registerInvoice(
        { id: 'inv_mock_p001', amount: 1_000n, currency: 'XLM', dueDate: Math.floor(Date.now() / 1000) + 86_400 },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toMatchObject({ errorType: ContractErrorType.ALREADY_EXISTS });
    await expect(
      client.createOffer(
        { offerId: 'off_mock_001', invoiceId: 'inv_mock_p002', amount: 1_000n, currency: 'XLM', interestRate: 500, duration: 86_400 },
        MOCK_WALLET_ADDRESS,
      ),
    ).rejects.toMatchObject({ errorType: ContractErrorType.ALREADY_EXISTS });
  });

  it('throws ContractError INSUFFICIENT_BALANCE on overdraft transfers', async () => {
    const client = createMockClient();
    client.setBalance(MOCK_BUSINESS_A, 5n);
    await expect(
      client.transferPositionToken(MOCK_POSITION_TOKEN_ID, MOCK_BUSINESS_A, MOCK_BUSINESS_B, 10n),
    ).rejects.toMatchObject({ errorType: ContractErrorType.INSUFFICIENT_BALANCE });
  });
});

describe('failure injection', () => {
  it('failNext rejects exactly once, then the call succeeds', async () => {
    const client = createMockClient();
    const boom = new ContractError(5, ContractErrorType.INSUFFICIENT_BALANCE, 'lender is broke');
    client.failNext('acceptOffer', boom);
    await expect(client.acceptOffer('off_mock_006', MOCK_BUSINESS_B)).rejects.toMatchObject({
      errorType: ContractErrorType.INSUFFICIENT_BALANCE,
    });
    await expect(client.acceptOffer('off_mock_006', MOCK_BUSINESS_B)).resolves.toBeDefined();
  });

  it('failNext default error is a ContractError UNKNOWN with a readable message', async () => {
    const client = createMockClient();
    client.failNext('getInvoice', undefined, 'testnet is down');
    await expect(client.getInvoice('inv_mock_p001')).rejects.toMatchObject({
      errorType: ContractErrorType.UNKNOWN,
      message: 'testnet is down',
    });
  });

  it('options.failures with on: "*" matches every method and respects times', async () => {
    const client = createMockClient({ failures: [{ on: '*', message: 'chain down', times: 2 }] });
    await expect(client.getInvoice('inv_mock_p001')).rejects.toThrow(/chain down/);
    await expect(client.getOffer('off_mock_001')).rejects.toThrow(/chain down/);
    await expect(client.getInvoice('inv_mock_p001')).resolves.toBeDefined();
  });

  it('options.failures can target a single method', async () => {
    const client = createMockClient({ failures: [{ on: 'transferPositionToken', error: new Error('simulated slop') }] });
    await expect(
      client.transferPositionToken(MOCK_POSITION_TOKEN_ID, MOCK_WALLET_ADDRESS, MOCK_BUSINESS_A, 1n),
    ).rejects.toThrow(/simulated slop/);
    // Reads still work.
    await expect(client.getInvoice('inv_mock_p001')).resolves.toBeDefined();
  });

  it('addFailure installs a sticky rule until reset', async () => {
    const client = createMockClient();
    client.addFailure({ on: 'rejectOffer', message: 'reject is disabled' });
    await expect(client.rejectOffer('off_mock_006', MOCK_BUSINESS_B)).rejects.toThrow(/reject is disabled/);
    await client.reset();
    await expect(client.rejectOffer('off_mock_006', MOCK_BUSINESS_B)).resolves.toBeDefined();
  });

  it('validation still runs before injected failures (SdkValidationError wins)', async () => {
    const client = createMockClient();
    client.failNext('registerInvoice');
    await expect(
      client.registerInvoice(
        { id: '', amount: 1_000n, currency: 'XLM', dueDate: Math.floor(Date.now() / 1000) + 86_400 },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toBeInstanceOf(SdkValidationError);
  });
});

describe('state control', () => {
  it('reset restores the seeded state and clears events + one-shot failures', async () => {
    const client = createMockClient();
    await client.cancelInvoice('inv_mock_p001', MOCK_BUSINESS_A);
    client.failNext('getOffer');
    await expect(client.getOffer('off_mock_001')).rejects.toThrow(/Simulated failure/);

    await client.reset();

    expect((await client.getInvoice('inv_mock_p001')).status).toBe('Pending');
    expect(client.events).toHaveLength(0);
    await expect(client.getOffer('off_mock_001')).resolves.toBeDefined();
  });

  it('reset restores failures configured via options', async () => {
    const client = createMockClient({ failures: [{ on: 'getInvoice', message: 'boom', times: 1 }] });
    await expect(client.getInvoice('inv_mock_p001')).rejects.toThrow(/boom/);
    await client.reset();
    await expect(client.getInvoice('inv_mock_p001')).rejects.toThrow(/boom/);
  });

  it('setBalance/getBalance drive balance-based scenarios', () => {
    const client = createMockClient();
    expect(client.getBalance(MOCK_BUSINESS_A)).toBe(0n);
    client.setBalance(MOCK_BUSINESS_A, 42n);
    expect(client.getBalance(MOCK_BUSINESS_A)).toBe(42n);
    // Unrelated to the position token's demo wallet balance.
    expect(client.getBalance(MOCK_WALLET_ADDRESS)).toBeGreaterThan(0n);
  });

  it('seededInvoices/seededOffers return fresh copies of the fixtures', async () => {
    const client = createMockClient();
    const seeded = client.seededInvoices();
    expect(seeded.length).toBeGreaterThan(0);
    seeded[0].status = 'Cancelled';
    // Mutating the returned copy must not affect the client's state.
    expect((await client.getInvoice(seeded[0].id)).status).not.toBe('Cancelled');
    expect(client.seededOffers().length).toBeGreaterThan(0);
  });
});

describe('API surface', () => {
  it('exposes the testing framework from the package root', () => {
    const client = createMockClient();
    expect(typeof createTestInvoice).toBe('function');
    expect(typeof createTestOffer).toBe('function');
    expect(toStroops(1)).toBe(STROOP_BASE);
    expect(MOCK_REGISTRY_ID).toMatch(/^C[A-Z2-7]{55}$/);
    expect(MOCK_FINANCING_ID).toMatch(/^C[A-Z2-7]{55}$/);
    expect(MOCK_REPAYMENT_ID).toMatch(/^C[A-Z2-7]{55}$/);
    expect(typeof client.reset).toBe('function');
    expect(typeof client.failNext).toBe('function');
    expect(typeof client.clearEvents).toBe('function');
    expect(Array.isArray(client.events)).toBe(true);
    expect(client.cache).toBeDefined();
  });
});
