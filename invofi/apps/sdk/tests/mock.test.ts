/**
 * Unit tests — offline MockClient (#177)
 *
 * Verifies that `createMockClient` is a drop-in replacement for
 * `createInvofiClient`: same method surface, same validation errors, but pure
 * in-memory state with deterministic fixtures. No network calls are made.
 */

import { describe, it, expect } from 'vitest';
import {
  createMockClient,
  MOCK_WALLET_ADDRESS,
  MOCK_BUSINESS_A,
  MOCK_BUSINESS_B,
  MOCK_POSITION_TOKEN_ID,
  MOCK_POSITION_BALANCE,
} from '../src/mock';
import { SdkValidationError, ErrorCode } from '../src/validation';
import type { Invoice, FinancingOffer } from '../src/types';

const FUTURE_TS = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

describe('createMockClient — deterministic fixtures', () => {
  it('seeds the same invoices across independent client instances', async () => {
    const a = createMockClient();
    const b = createMockClient();

    const invA = await a.getInvoice('inv_mock_p001');
    const invB = await b.getInvoice('inv_mock_p001');

    expect(invA).toEqual(invB);
    expect(invA.amount).toEqual(10_000n * 10_000_000n);
    expect(invA.status).toBe('Pending');
  });

  it('seeds an invoice in every protocol status', async () => {
    const client = createMockClient();
    const ids = [
      'inv_mock_p001',   // Pending
      'inv_mock_f001',   // Financed
      'inv_mock_r001',   // Repaid
      'inv_mock_o001',   // Overdue
      'inv_mock_c001',   // Cancelled
      'inv_mock_d001',   // Disputed
      'inv_mock_def001', // Defaulted
    ];
    const statuses = new Set<string>();
    for (const id of ids) statuses.add((await client.getInvoice(id)).status);
    expect(statuses).toEqual(
      new Set(['Pending', 'Financed', 'Repaid', 'Overdue', 'Cancelled', 'Disputed', 'Defaulted']),
    );
  });

  it('seeds offers and a non-zero position-token balance for the demo wallet', async () => {
    const client = createMockClient();
    const offer = await client.getOffer('off_mock_001');
    expect(offer.lender).toBe(MOCK_WALLET_ADDRESS);
    expect(await client.getTokenBalance(MOCK_POSITION_TOKEN_ID, MOCK_WALLET_ADDRESS)).toBe(MOCK_POSITION_BALANCE);
  });

  it('starts each instance from a fresh seed (mutations do not leak)', async () => {
    const a = createMockClient();
    await a.cancelInvoice('inv_mock_p001', MOCK_BUSINESS_A);
    const b = createMockClient();
    expect((await b.getInvoice('inv_mock_p001')).status).toBe('Pending');
  });
});

describe('createMockClient — read methods', () => {
  it('getInvoice throws a clear error for an unknown id', async () => {
    const client = createMockClient();
    await expect(client.getInvoice('inv_mock_missing')).rejects.toThrow(/Invoice not found/);
  });

  it('getOffer throws a clear error for an unknown id', async () => {
    const client = createMockClient();
    await expect(client.getOffer('off_mock_missing')).rejects.toThrow(/Offer not found/);
  });

  it('getPositionTokenId returns the mock token id', async () => {
    const client = createMockClient();
    await expect(client.getPositionTokenId()).resolves.toBe(MOCK_POSITION_TOKEN_ID);
  });

  it('getTokenBalance returns 0 for an unknown address', async () => {
    const client = createMockClient();
    await expect(client.getTokenBalance(MOCK_POSITION_TOKEN_ID, MOCK_BUSINESS_A)).resolves.toBe(0n);
  });

  it('hasPositionTrustline is true for the seeded demo wallet', async () => {
    const client = createMockClient();
    await expect(client.hasPositionTrustline(MOCK_WALLET_ADDRESS)).resolves.toBe(true);
    await expect(client.hasPositionTrustline(MOCK_BUSINESS_A)).resolves.toBe(false);
  });
});

describe('createMockClient — state-changing methods', () => {
  it('registerInvoice adds an invoice and rejects duplicates', async () => {
    const client = createMockClient();
    const params = { id: 'inv_new_001', amount: 5_000n, currency: 'XLM' as const, dueDate: FUTURE_TS };
    const invoice = await client.registerInvoice(params, MOCK_BUSINESS_A);
    expect(invoice.status).toBe('Pending');
    expect(invoice.originator).toBe(MOCK_BUSINESS_A);
    await expect(client.getInvoice('inv_new_001')).resolves.toEqual(invoice);
    await expect(client.registerInvoice(params, MOCK_BUSINESS_A)).rejects.toThrow(/already exists/);
  });

  it('cancelInvoice only succeeds for the originator', async () => {
    const client = createMockClient();
    await expect(client.cancelInvoice('inv_mock_p001', MOCK_WALLET_ADDRESS)).rejects.toThrow(/originator/);
    const cancelled = await client.cancelInvoice('inv_mock_p001', MOCK_BUSINESS_A);
    expect(cancelled.status).toBe('Cancelled');
  });

  it('createOffer → acceptOffer transitions the invoice to Financed', async () => {
    const client = createMockClient();
    const offer = await client.createOffer(
      { offerId: 'off_new_001', invoiceId: 'inv_mock_p002', amount: 25_000n, currency: 'XLM', interestRate: 500, duration: 86_400 },
      MOCK_WALLET_ADDRESS,
    );
    expect(offer.status).toBe('Pending');
    const accepted = await client.acceptOffer('off_new_001', MOCK_BUSINESS_B);
    expect(accepted.status).toBe('Accepted');
    expect((await client.getInvoice('inv_mock_p002')).status).toBe('Financed');
  });

  it('rejectOffer marks the offer Rejected', async () => {
    const client = createMockClient();
    const offer = await client.createOffer(
      { offerId: 'off_new_002', invoiceId: 'inv_mock_p002', amount: 25_000n, currency: 'XLM', interestRate: 500, duration: 86_400 },
      MOCK_WALLET_ADDRESS,
    );
    expect((await client.rejectOffer(offer.id, MOCK_BUSINESS_B)).status).toBe('Rejected');
  });

  it('partial repayment keeps the invoice Financed and tracks amount_repaid', async () => {
    const client = createMockClient();
    const invoice = await client.repayInvoice('inv_mock_f001', 'off_mock_001', MOCK_BUSINESS_A, 1_000n);
    expect(invoice.status).toBe('Financed');
    const offer = await client.getOffer('off_mock_001');
    expect(offer.amount_repaid).toBe(10_000n * 10_000_000n + 1_000n);
  });

  it('full repayment flips the invoice and offer to Repaid', async () => {
    const client = createMockClient();
    const offer = await client.getOffer('off_mock_001');
    const totalDue = offer.amount + (offer.amount * BigInt(offer.interest_rate)) / 10_000n;
    const outstanding = totalDue - offer.amount_repaid;
    const invoice = await client.repayInvoice('inv_mock_f001', 'off_mock_001', MOCK_BUSINESS_A, outstanding);
    expect(invoice.status).toBe('Repaid');
    expect((await client.getOffer('off_mock_001')).status).toBe('Repaid');
  });

  it('transferPositionToken moves balance and rejects overdrafts', async () => {
    const client = createMockClient();
    await client.transferPositionToken(MOCK_POSITION_TOKEN_ID, MOCK_WALLET_ADDRESS, MOCK_BUSINESS_A, 1_000n);
    expect(await client.getTokenBalance(MOCK_POSITION_TOKEN_ID, MOCK_BUSINESS_A)).toBe(1_000n);
    expect(await client.getTokenBalance(MOCK_POSITION_TOKEN_ID, MOCK_WALLET_ADDRESS)).toBe(MOCK_POSITION_BALANCE - 1_000n);
    await expect(
      client.transferPositionToken(MOCK_POSITION_TOKEN_ID, MOCK_BUSINESS_A, MOCK_WALLET_ADDRESS, 999_999n),
    ).rejects.toThrow(/Insufficient/);
  });

  it('addPositionTrustline enables holding the position token', async () => {
    const client = createMockClient();
    await client.addPositionTrustline(MOCK_BUSINESS_A);
    await expect(client.hasPositionTrustline(MOCK_BUSINESS_A)).resolves.toBe(true);
  });
});

describe('createMockClient — validation parity', () => {
  it('reuses the real SDK validators (same SdkValidationError contract)', async () => {
    const client = createMockClient();
    // getInvoice validates its id synchronously, exactly like the real client.
    expect(() => client.getInvoice('')).toThrow(SdkValidationError);
    await expect(
      client.registerInvoice(
        { id: 'inv_x', amount: 0n, currency: 'XLM', dueDate: FUTURE_TS },
        MOCK_BUSINESS_A,
      ),
    ).rejects.toBeInstanceOf(SdkValidationError);
  });

  it('throws the expected error code for an invalid address', async () => {
    const client = createMockClient();
    try {
      await client.getTokenBalance(MOCK_POSITION_TOKEN_ID, 'not-an-address');
      expect.unreachable('expected SdkValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(SdkValidationError);
      expect((err as SdkValidationError).code).toBe(ErrorCode.INVALID_ADDRESS);
    }
  });

  it('returns the canonical SDK shapes (Invoice / FinancingOffer)', async () => {
    const client = createMockClient();
    const invoice: Invoice = await client.getInvoice('inv_mock_f001');
    const offer: FinancingOffer = await client.getOffer('off_mock_001');
    expect(typeof invoice.amount).toBe('bigint');
    expect(typeof offer.amount).toBe('bigint');
    expect(typeof offer.interest_rate).toBe('number');
  });
});
