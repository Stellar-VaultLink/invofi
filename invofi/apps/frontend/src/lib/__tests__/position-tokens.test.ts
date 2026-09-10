import { describe, expect, it } from 'vitest';
import {
  isPositionTokenPayment,
  parsePositionTokenAsset,
  toPositionTransfer,
} from '@/lib/horizon';

/**
 * Verification for issue #127: the portfolio "Position tokens" panel maps
 * Horizon payment operations for the SEP-41 POS asset into a lender's in/out
 * transfer history. These pure helpers are kept in lib/horizon.ts so the
 * acceptance criteria are unit-testable without a DOM or a network call.
 */

const ASSET = { code: 'POS', issuer: 'GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR' };
const WALLET = 'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H';
const OTHER = 'GBXDT4JUD7Q4H5Q7J7ZQKQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJ';

const baseRecord = {
  id: '123456789-1',
  transaction_hash: 'a'.repeat(64),
  created_at: '2026-08-27T10:00:00Z',
  from: OTHER,
  to: WALLET,
  amount: '100.0000000',
};

describe('parsePositionTokenAsset', () => {
  it('parses a well-formed "CODE:ISSUER" asset string', () => {
    expect(parsePositionTokenAsset('POS:GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR')).toEqual(ASSET);
  });

  it('rejects a missing issuer', () => {
    expect(parsePositionTokenAsset('POS')).toBeNull();
  });

  it('rejects an issuer that is not a valid Stellar address', () => {
    expect(parsePositionTokenAsset('POS:not-an-address')).toBeNull();
  });

  it('rejects an empty code', () => {
    expect(parsePositionTokenAsset(':GBDDLOWR6YUEEYUKFKS6ISTCLBQKDPUXAOVJMNJYAACT6UYQGEKYEVZR')).toBeNull();
  });
});

describe('isPositionTokenPayment', () => {
  it('accepts a payment of the matching POS asset', () => {
    expect(
      isPositionTokenPayment(
        { type: 'payment', asset_code: 'POS', asset_issuer: ASSET.issuer },
        ASSET,
      ),
    ).toBe(true);
  });

  it('rejects a different asset code', () => {
    expect(
      isPositionTokenPayment(
        { type: 'payment', asset_code: 'USDC', asset_issuer: ASSET.issuer },
        ASSET,
      ),
    ).toBe(false);
  });

  it('rejects a different issuer', () => {
    expect(
      isPositionTokenPayment(
        { type: 'payment', asset_code: 'POS', asset_issuer: 'G' + 'A'.repeat(55) },
        ASSET,
      ),
    ).toBe(false);
  });

  it('rejects native (XLM) payments, which have no asset code', () => {
    expect(isPositionTokenPayment({ type: 'payment', asset_code: null, asset_issuer: null }, ASSET)).toBe(false);
  });

  it('rejects non-payment operations', () => {
    expect(
      isPositionTokenPayment(
        { type: 'create_account', asset_code: 'POS', asset_issuer: ASSET.issuer },
        ASSET,
      ),
    ).toBe(false);
  });
});

describe('toPositionTransfer', () => {
  it('maps an incoming payment to a Received transfer', () => {
    expect(toPositionTransfer(baseRecord, WALLET)).toEqual({
      id: '123456789-1',
      hash: 'a'.repeat(64),
      createdAt: '2026-08-27T10:00:00Z',
      direction: 'in',
      counterparty: OTHER,
      amount: '100.0000000',
    });
  });

  it('maps an outgoing payment to a Sent transfer', () => {
    expect(
      toPositionTransfer({ ...baseRecord, from: WALLET, to: OTHER }, WALLET),
    ).toMatchObject({ direction: 'out', counterparty: OTHER });
  });

  it('returns null when the wallet is neither sender nor recipient', () => {
    expect(toPositionTransfer(baseRecord, 'G' + 'B'.repeat(55))).toBeNull();
  });
});
