/**
 * Unit tests — typed contract call builder (#215)
 *
 * Verifies `client.contracts.<name>.<method>(params)`:
 *  - happy-path calls reach the same underlying flat method and produce the
 *    same result (exercised end-to-end against `createMockClient`, so no
 *    network calls are made),
 *  - runtime validation rejects a missing required parameter,
 *  - runtime validation rejects a value of the wrong JS type for its
 *    declared ABI scalar type,
 *  - an optional parameter (`source_account`) may be omitted.
 */

import { describe, it, expect } from 'vitest';
import { createMockClient, MOCK_WALLET_ADDRESS, MOCK_BUSINESS_A, MOCK_LENDER_B } from '../src/mock';
import { SdkValidationError, ErrorCode } from '../src/validation';

const FUTURE_TS = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

describe('client.contracts — registry', () => {
  it('registerInvoice → getInvoice → cancelInvoice round-trips through the typed builder', async () => {
    const client = createMockClient();

    const registered = await client.contracts.registry.registerInvoice({
      id: 'inv_typed_001',
      originator: MOCK_BUSINESS_A,
      amount: 1_000_000n,
      currency: 'XLM',
      due_date: FUTURE_TS,
    });
    expect(registered.status).toBe('Pending');
    expect(registered.originator).toBe(MOCK_BUSINESS_A);

    const fetched = await client.contracts.registry.getInvoice({ id: 'inv_typed_001' });
    expect(fetched).toEqual(registered);

    const cancelled = await client.contracts.registry.cancelInvoice({
      id: 'inv_typed_001',
      originator: MOCK_BUSINESS_A,
    });
    expect(cancelled.status).toBe('Cancelled');
  });

  it('getInvoice accepts an omitted optional source_account', async () => {
    const client = createMockClient();
    const invoice = await client.contracts.registry.getInvoice({ id: 'inv_mock_p001' });
    expect(invoice.id).toBe('inv_mock_p001');
  });

  it('rejects a missing required parameter before any call is made', async () => {
    const client = createMockClient();
    await expect(
      // @ts-expect-error — deliberately omitting the required `originator` field
      client.contracts.registry.registerInvoice({
        id: 'inv_typed_002',
        amount: 1_000_000n,
        currency: 'XLM',
        due_date: FUTURE_TS,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.MISSING_FIELD });
  });

  it('rejects a value of the wrong scalar type (amount as number, not bigint)', async () => {
    const client = createMockClient();
    await expect(
      client.contracts.registry.registerInvoice({
        id: 'inv_typed_003',
        originator: MOCK_BUSINESS_A,
        // @ts-expect-error — deliberately wrong type: i128 params are bigint
        amount: 1_000_000,
        currency: 'XLM',
        due_date: FUTURE_TS,
      }),
    ).rejects.toThrow(SdkValidationError);
  });

  it('rejects an invalid currency value', async () => {
    const client = createMockClient();
    await expect(
      client.contracts.registry.registerInvoice({
        id: 'inv_typed_004',
        originator: MOCK_BUSINESS_A,
        amount: 1_000_000n,
        // @ts-expect-error — deliberately invalid currency
        currency: 'EUR',
        due_date: FUTURE_TS,
      }),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_TYPE });
  });
});

describe('client.contracts — financing', () => {
  it('createOffer → acceptOffer moves the invoice to Financed via the typed builder', async () => {
    const client = createMockClient();
    await client.contracts.registry.registerInvoice({
      id: 'inv_typed_fin',
      originator: MOCK_BUSINESS_A,
      amount: 5_000_000n,
      currency: 'XLM',
      due_date: FUTURE_TS,
    });

    const offer = await client.contracts.financing.createOffer({
      offer_id: 'off_typed_001',
      invoice_id: 'inv_typed_fin',
      lender: MOCK_LENDER_B,
      amount: 5_000_000n,
      currency: 'XLM',
      interest_rate: 500,
      duration: 30 * 86_400,
    });
    expect(offer.status).toBe('Pending');

    const accepted = await client.contracts.financing.acceptOffer({
      offer_id: 'off_typed_001',
      originator: MOCK_BUSINESS_A,
    });
    expect(accepted.status).toBe('Accepted');

    const invoice = await client.contracts.registry.getInvoice({ id: 'inv_typed_fin' });
    expect(invoice.status).toBe('Financed');
  });

  it('getPositionTokenId works with no parameters at all', async () => {
    const client = createMockClient();
    const tokenId = await client.contracts.financing.getPositionTokenId({});
    expect(typeof tokenId).toBe('string');
  });
});

describe('client.contracts — repayment', () => {
  it('repayInvoice delegates to the underlying flat method', async () => {
    const client = createMockClient();
    const invoice = await client.contracts.repayment.repayInvoice({
      invoice_id: 'inv_mock_f001',
      offer_id: 'off_mock_001',
      repayer: MOCK_WALLET_ADDRESS,
      amount: 1_000_000n,
    });
    expect(['Financed', 'Repaid']).toContain(invoice.status);
  });
});

describe('client.contracts — positionToken', () => {
  it('getBalance/getDecimals/transfer delegate to the underlying flat methods', async () => {
    const client = createMockClient();
    const tokenId = await client.getPositionTokenId();
    expect(tokenId).not.toBeNull();

    const decimals = await client.contracts.positionToken.getDecimals({ token_id: tokenId! });
    expect(decimals).toBe(7);

    const balance = await client.contracts.positionToken.getBalance({
      token_id: tokenId!,
      address: MOCK_WALLET_ADDRESS,
    });
    expect(balance).toBeGreaterThan(0n);

    await client.contracts.positionToken.transfer({
      token_id: tokenId!,
      from: MOCK_WALLET_ADDRESS,
      to: MOCK_BUSINESS_A,
      amount: 1_000n,
    });
    const recipientBalance = await client.contracts.positionToken.getBalance({
      token_id: tokenId!,
      address: MOCK_BUSINESS_A,
    });
    expect(recipientBalance).toBe(1_000n);
  });
});
