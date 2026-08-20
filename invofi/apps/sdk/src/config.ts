// ── SDK configuration ────────────────────────────────────────────────────────
// The SDK is deliberately framework-agnostic: it has no knowledge of React,
// Next.js, or browser wallets. The consumer supplies the network endpoints,
// contract IDs, and a `signTransaction` callback (wired to the user's chosen
// wallet) via `createInvofiClient`.

import type { Networks } from '@stellar/stellar-sdk';

export interface InvofiClientConfig {
  rpcUrl: string;
  horizonUrl: string;
  /** Soroban network passphrase — pass Networks.PUBLIC or Networks.TESTNET. */
  networkPassphrase: typeof Networks.PUBLIC | typeof Networks.TESTNET;
  registryId: string;
  financingId: string;
  repaymentId: string;
  /**
   * "CODE:ISSUER" of the SEP-41 position token (Task 7/8). Only used by the
   * trustline helpers; position-token balance reads go through the financing
   * contract's `get_position_token` (single source of truth on-chain).
   */
  positionTokenAsset?: string;
  /**
   * The connected wallet's Stellar address, if any. Used only to scope the
   * offline cache (Task 218) per-account so switching wallets never serves
   * one identity's cached reads to another — omit while no wallet is
   * connected. Every state-changing call still takes its own explicit
   * address argument; this is not used for authorization.
   */
  accountAddress?: string;
  /**
   * Signs an XDR transaction with the connected wallet. The SDK assembles and
   * simulates the transaction, then hands it to this callback and submits the
   * returned signature.
   */
  signTransaction: (txXdr: string, networkPassphrase: string) => Promise<string>;
}
