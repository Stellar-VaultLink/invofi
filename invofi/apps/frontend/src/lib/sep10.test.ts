import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signTransactionWithActiveWallet = vi.fn();
vi.mock('./walletkit', () => ({
  signTransactionWithActiveWallet: (txXdr: string, networkPassphrase: string) =>
    signTransactionWithActiveWallet(txXdr, networkPassphrase),
}));

const verifyOtp = vi.fn();
const getSupabaseClient = vi.fn(() => ({ auth: { verifyOtp } }));
vi.mock('./supabase', () => ({
  getSupabaseClient: () => getSupabaseClient(),
}));

// vi.mock calls above are hoisted, so the module under test always sees the
// mocked versions of './walletkit' and './supabase'.
import { requestChallenge, signChallenge, verifyChallenge, loginWithSep10 } from './sep10';

const ACCOUNT = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV';
const CHALLENGE_XDR = 'AAAA...challenge...';
const SIGNED_XDR = 'AAAA...signed...';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

function mockFetchOnce(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('lib/sep10 (client)', () => {
  beforeEach(() => {
    signTransactionWithActiveWallet.mockReset();
    verifyOtp.mockReset();
    getSupabaseClient.mockClear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('requestChallenge', () => {
    it('POSTs the account and returns the challenge', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(200, { transaction: CHALLENGE_XDR, networkPassphrase: NETWORK_PASSPHRASE }),
      );

      const result = await requestChallenge(ACCOUNT);

      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/sep10/challenge',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ account: ACCOUNT }),
        }),
      );
      expect(result).toEqual({ transaction: CHALLENGE_XDR, networkPassphrase: NETWORK_PASSPHRASE });
    });

    it('throws the server error message on failure', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(400, { error: 'A valid Stellar account (G...) is required.' }),
      );

      await expect(requestChallenge('not-an-account')).rejects.toThrow(
        'A valid Stellar account (G...) is required.',
      );
    });
  });

  describe('signChallenge', () => {
    it('delegates to signTransactionWithActiveWallet', async () => {
      signTransactionWithActiveWallet.mockResolvedValueOnce(SIGNED_XDR);

      const result = await signChallenge(CHALLENGE_XDR, NETWORK_PASSPHRASE);

      expect(signTransactionWithActiveWallet).toHaveBeenCalledWith(
        CHALLENGE_XDR,
        NETWORK_PASSPHRASE,
      );
      expect(result).toBe(SIGNED_XDR);
    });
  });

  describe('verifyChallenge', () => {
    it('POSTs the signed transaction and redeems the token hash for a session', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(200, { account: ACCOUNT, email: 'wallet@stellar.wallet', tokenHash: 'tok_123' }),
      );
      verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

      const result = await verifyChallenge(SIGNED_XDR);

      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/sep10/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ transaction: SIGNED_XDR }),
        }),
      );
      expect(verifyOtp).toHaveBeenCalledWith({ type: 'magiclink', token_hash: 'tok_123' });
      expect(result.account).toBe(ACCOUNT);
    });

    it('throws on a 401 from the server without calling verifyOtp', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(401, { error: 'Wallet signature verification failed.' }),
      );

      await expect(verifyChallenge(SIGNED_XDR)).rejects.toThrow(
        'Wallet signature verification failed.',
      );
      expect(verifyOtp).not.toHaveBeenCalled();
    });

    it('throws if verifyOtp itself fails', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(200, { account: ACCOUNT, email: 'wallet@stellar.wallet', tokenHash: 'tok_123' }),
      );
      verifyOtp.mockResolvedValueOnce({ data: null, error: new Error('otp expired') });

      await expect(verifyChallenge(SIGNED_XDR)).rejects.toThrow('otp expired');
    });
  });

  describe('loginWithSep10', () => {
    it('runs the full challenge -> sign -> verify cycle', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(
          mockFetchOnce(200, { transaction: CHALLENGE_XDR, networkPassphrase: NETWORK_PASSPHRASE }),
        )
        .mockResolvedValueOnce(
          mockFetchOnce(200, { account: ACCOUNT, email: 'wallet@stellar.wallet', tokenHash: 'tok_abc' }),
        );
      signTransactionWithActiveWallet.mockResolvedValueOnce(SIGNED_XDR);
      verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

      const result = await loginWithSep10(ACCOUNT);

      expect(fetch).toHaveBeenNthCalledWith(
        1,
        '/api/auth/sep10/challenge',
        expect.objectContaining({ body: JSON.stringify({ account: ACCOUNT }) }),
      );
      expect(signTransactionWithActiveWallet).toHaveBeenCalledWith(
        CHALLENGE_XDR,
        NETWORK_PASSPHRASE,
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        '/api/auth/sep10/verify',
        expect.objectContaining({ body: JSON.stringify({ transaction: SIGNED_XDR }) }),
      );
      expect(result.account).toBe(ACCOUNT);
    });

    it('propagates a wallet rejection without calling verify', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        mockFetchOnce(200, { transaction: CHALLENGE_XDR, networkPassphrase: NETWORK_PASSPHRASE }),
      );
      signTransactionWithActiveWallet.mockRejectedValueOnce(new Error('User declined access'));

      await expect(loginWithSep10(ACCOUNT)).rejects.toThrow('User declined access');
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
