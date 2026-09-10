/**
 * Unit tests — `client.send()` typed envelope wrapper (#188)
 *
 * `send()` returns a `SendEnvelope` instead of throwing: decoded domain
 * failures surface as `{ ok: false, error: InvofiError }` so UI layers can
 * render a toast from `error.message` and branch on `error.errorType`
 * without regex-matching raw Soroban text.
 *
 * These tests exercise the mock client's `send()` (parity with the real
 * client), covering both envelope branches plus the error-normalisation rule
 * (a non-ContractError injection is wrapped as an UNKNOWN InvofiError, while
 * an injected ContractError passes through untouched).
 */

import { describe, it, expect } from 'vitest';
import { createMockClient, ContractError, ContractErrorType, xdr } from '../src/index';
import { MOCK_WALLET_ADDRESS, MOCK_FINANCING_ID } from '../src/mock';

const call = {
  contractId: MOCK_FINANCING_ID,
  method: 'accept_offer',
  args: [xdr.ScVal.scvSymbol('off_mock_006')],
};

describe('client.send() — success envelope', () => {
  it('returns { ok: true } with the raw ScVal when no decode is supplied', async () => {
    const client = createMockClient();
    const result = await client.send(call, MOCK_WALLET_ADDRESS);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(xdr.ScVal);
    }
  });

  it('applies the supplied decode mapper on success', async () => {
    const client = createMockClient();
    const result = await client.send(call, MOCK_WALLET_ADDRESS, val => `decoded:${String(val?.['switch']?.name ?? 'void')}`);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatch(/^decoded:/);
    }
  });
});

describe('client.send() — error envelope', () => {
  it('surfaces an injected ContractError inside the envelope, untouched', async () => {
    const client = createMockClient();
    const injected = new ContractError(5, ContractErrorType.INSUFFICIENT_BALANCE, 'Lender has no funds');
    client.failNext('send', injected);

    const result = await client.send(call, MOCK_WALLET_ADDRESS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(injected);
      expect(result.error.errorType).toBe(ContractErrorType.INSUFFICIENT_BALANCE);
      expect(result.error.rawCode).toBe(5);
      // Human-readable message + machine-readable code are both available.
      expect(result.error.message).toBe('Lender has no funds');
    }
  });

  it('wraps a non-ContractError injection as an UNKNOWN InvofiError', async () => {
    const client = createMockClient();
    client.failNext('send', undefined, 'simulated outage');

    const result = await client.send(call, MOCK_WALLET_ADDRESS);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ContractError);
      expect(result.error.errorType).toBe(ContractErrorType.UNKNOWN);
      expect(result.error.message).toContain('simulated outage');
    }
  });

  it('branches cleanly on the typed variant without try/catch', async () => {
    const client = createMockClient();
    client.failNext('send', undefined, 'contract paused');

    const result = await client.send(call, MOCK_WALLET_ADDRESS);

    if (result.ok) {
      // No failure injected on this branch — nothing to assert beyond shape.
      expect(result.value).toBeDefined();
    } else {
      expect(result.error.errorType).toBe(ContractErrorType.UNKNOWN);
    }
  });
});

describe('client.send() — validation', () => {
  it('still rejects on an invalid source address (not an envelope error)', async () => {
    const client = createMockClient();
    await expect(client.send(call, 'not-an-address')).rejects.toThrow();
  });
});
