import { afterEach, describe, expect, it } from 'vitest';
import {
  LAST_WALLET_STORAGE_KEY,
  readLastWallet,
  persistLastWallet,
  clearLastWallet,
} from './last-wallet';

describe('last-wallet storage', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  describe('readLastWallet', () => {
    it('returns null when nothing is stored', () => {
      expect(readLastWallet()).toBeNull();
    });

    it('returns null when stored JSON is malformed', () => {
      window.localStorage.setItem(LAST_WALLET_STORAGE_KEY, '{bad json');
      expect(readLastWallet()).toBeNull();
    });

    it('returns null when walletId is missing', () => {
      window.localStorage.setItem(
        LAST_WALLET_STORAGE_KEY,
        JSON.stringify({ publicKey: 'GABC123' }),
      );
      expect(readLastWallet()).toBeNull();
    });

    it('returns null when publicKey is missing', () => {
      window.localStorage.setItem(
        LAST_WALLET_STORAGE_KEY,
        JSON.stringify({ walletId: 'freighter' }),
      );
      expect(readLastWallet()).toBeNull();
    });

    it('returns null when publicKey does not start with G', () => {
      window.localStorage.setItem(
        LAST_WALLET_STORAGE_KEY,
        JSON.stringify({ walletId: 'freighter', publicKey: 'SABCDEF' }),
      );
      expect(readLastWallet()).toBeNull();
    });

    it('reads a valid last-wallet entry', () => {
      window.localStorage.setItem(
        LAST_WALLET_STORAGE_KEY,
        JSON.stringify({ walletId: 'freighter', publicKey: 'GABCDEF123456' }),
      );
      const entry = readLastWallet();
      expect(entry).not.toBeNull();
      expect(entry!.walletId).toBe('freighter');
      expect(entry!.publicKey).toBe('GABCDEF123456');
    });
  });

  describe('persistLastWallet', () => {
    it('writes a valid JSON entry', () => {
      persistLastWallet('lobstr', 'GXYZ789');
      const raw = window.localStorage.getItem(LAST_WALLET_STORAGE_KEY);
      expect(raw).toBe(JSON.stringify({ walletId: 'lobstr', publicKey: 'GXYZ789' }));
    });

    it('is immediately readable back', () => {
      persistLastWallet('freighter', 'GABC');
      const entry = readLastWallet();
      expect(entry).toEqual({ walletId: 'freighter', publicKey: 'GABC' });
    });
  });

  describe('clearLastWallet', () => {
    it('removes the stored entry', () => {
      persistLastWallet('freighter', 'GABC');
      clearLastWallet();
      expect(window.localStorage.getItem(LAST_WALLET_STORAGE_KEY)).toBeNull();
    });

    it('makes readLastWallet return null', () => {
      persistLastWallet('freighter', 'GABC');
      clearLastWallet();
      expect(readLastWallet()).toBeNull();
    });

    it('is safe to call when nothing is stored', () => {
      expect(() => clearLastWallet()).not.toThrow();
    });
  });
});