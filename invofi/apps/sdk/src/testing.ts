// ── Test fixture builders (contract-interaction testing framework, #226) ────
//
// Helpers for composing pre-seeded test data without hand-rolling every field.
// The defaults are chosen so the produced objects pass the SDK's own validators
// (`registerInvoice` / `createOffer` accept them as-is), and any field can be
// overridden — including the `dueDate` / `invoiceId` aliases for readability.
//
// Combine with `createMockClient` from `./mock` for fast, isolated contract
// interaction tests: seed a client, register an invoice created here, assert
// on the returned shapes and on `client.events`, and reset between cases.

import type { Currency, FinancingOffer, Invoice, InvoiceStatus, OfferStatus } from './types';
import { MOCK_BUSINESS_A, MOCK_LENDER_B } from './mock';

/**
 * One XLM / USDC base unit in stroops — mirrors the protocol's 7-decimal
 * convention used throughout the SDK and the mock fixtures.
 */
export const STROOP_BASE = 10_000_000n;

/** Convert a whole-unit (XLM/USDC) amount to stroops. */
export function toStroops(units: number | bigint): bigint {
  return BigInt(units) * STROOP_BASE;
}

/** A future Unix timestamp (seconds) — valid for `registerInvoice` due dates. */
function futureTimestamp(daysFromNow: number): number {
  return Math.floor(Date.now() / 1000) + daysFromNow * 86_400;
}

/**
 * Overrides for {@link createTestInvoice}. All fields of {@link Invoice} can be
 * overridden; `dueDate` is a convenience alias for `due_date` (and wins if both
 * are given).
 */
export interface TestInvoiceOverrides extends Partial<Invoice> {
  /** Convenience alias for `due_date` (Unix seconds in the future). */
  dueDate?: number;
}

/**
 * A ready-to-use {@link Invoice} fixture with deterministic defaults:
 *
 * | Field        | Default                              |
 * |--------------|--------------------------------------|
 * | `id`         | `inv_test_001`                       |
 * | `originator` | `MOCK_BUSINESS_A`                    |
 * | `amount`     | `1_000_000_000n` (100 XLM / USDC)    |
 * | `currency`   | `XLM`                                |
 * | `due_date`   | now + 30 days                        |
 * | `status`     | `Pending`                            |
 * | `created_at` | now (ISO)                            |
 *
 * Pass the result straight to `registerInvoice(params, originator)` — every
 * default passes the SDK's validators. Override fields to shape the fixture,
 * e.g. `createTestInvoice({ id: 'inv_a', amount: toStroops(5), currency: 'USDC' })`.
 */
export function createTestInvoice(overrides: TestInvoiceOverrides = {}): Invoice {
  const { dueDate, ...rest } = overrides;
  const base: Invoice = {
    id: 'inv_test_001',
    originator: MOCK_BUSINESS_A,
    amount: toStroops(100),
    currency: 'XLM',
    due_date: futureTimestamp(30),
    status: 'Pending',
    created_at: new Date().toISOString(),
  };
  return {
    ...base,
    ...rest,
    due_date: dueDate ?? rest.due_date ?? base.due_date,
  };
}

/**
 * Overrides for {@link createTestOffer}. All fields of {@link FinancingOffer}
 * can be overridden; `invoiceId` is a convenience alias for `invoice_id` (and
 * wins if both are given).
 */
export interface TestOfferOverrides extends Partial<FinancingOffer> {
  /** Convenience alias for `invoice_id`. */
  invoiceId?: string;
}

/**
 * A ready-to-use {@link FinancingOffer} fixture with deterministic defaults:
 *
 * | Field           | Default                           |
 * |-----------------|-----------------------------------|
 * | `id`            | `off_test_001`                    |
 * | `invoice_id`    | `inv_test_001`                    |
 * | `lender`        | `MOCK_LENDER_B`                   |
 * | `amount`        | `1_000_000_000n` (100 XLM / USDC) |
 * | `currency`      | `XLM`                              |
 * | `interest_rate` | `500` (5%)                        |
 * | `duration`      | 30 days (seconds)                 |
 * | `amount_repaid` | `0n`                              |
 * | `status`        | `Pending`                         |
 * | `funded_at`     | `0`                               |
 *
 * Pass the result straight to `createOffer(params, lenderAddress)` — every
 * default passes the SDK's validators.
 */
export function createTestOffer(overrides: TestOfferOverrides = {}): FinancingOffer {
  const { invoiceId, ...rest } = overrides;
  const base: FinancingOffer = {
    id: 'off_test_001',
    invoice_id: 'inv_test_001',
    lender: MOCK_LENDER_B,
    amount: toStroops(100),
    currency: 'XLM',
    interest_rate: 500,
    duration: 30 * 86_400,
    amount_repaid: 0n,
    status: 'Pending',
    funded_at: 0,
  };
  return {
    ...base,
    ...rest,
    invoice_id: invoiceId ?? rest.invoice_id ?? base.invoice_id,
  };
}

// ── Re-exports for convenience ───────────────────────────────────────────────
// Consumers building fixtures alongside mock state usually need the mock
// identities too; re-export them so one import covers both concerns.

export { MOCK_BUSINESS_A, MOCK_LENDER_B } from './mock';
export type { Currency, FinancingOffer, Invoice, InvoiceStatus, OfferStatus };