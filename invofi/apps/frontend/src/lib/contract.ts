// ── SDK binding (Task 15) ────────────────────────────────────────────────────
// All contract-call logic lives in `@invofi/sdk`. This file is the frontend's
// single binding point: it wires the SDK to this app's env vars (contract IDs,
// RPC/Horizon endpoints) and to the connected wallet's signer, then re-exports
// the typed methods so components keep importing from '@/lib/contract'.
import { Contract, Networks, createInvofiClient, createMockClient } from '@invofi/sdk';
import { isMockMode } from './mock-mode';
import { signTransactionWithActiveWallet } from './walletkit';
import { POSITION_TOKEN_ASSET } from './constants';

// ── Contract IDs (Task 6: 3-contract deployment) ─────────────────────────────
// The protocol runs across three Soroban contracts:
//   registry   — invoice CRUD, admin, pause, rates, blacklist, disputes
//   financing  — offer CRUD, accept/reject, currency registry, lender stats
//   repayment  — repay, mark overdue, reclaim
// For backwards compatibility, if the new variables are unset we fall back to
// the legacy single NEXT_PUBLIC_CONTRACT_ID (all calls route to that contract).
const LEGACY_CONTRACT_ID = process.env.NEXT_PUBLIC_CONTRACT_ID ?? '';
const REGISTRY_ID = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID ?? LEGACY_CONTRACT_ID;
const FINANCING_ID = process.env.NEXT_PUBLIC_FINANCING_CONTRACT_ID ?? LEGACY_CONTRACT_ID;
const REPAYMENT_ID = process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID ?? LEGACY_CONTRACT_ID;

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? 'https://soroban-testnet.stellar.org';
const HORIZON_URL = process.env.NEXT_PUBLIC_HORIZON_URL ?? 'https://horizon-testnet.stellar.org';
const NETWORK = (process.env.NEXT_PUBLIC_STELLAR_NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const NETWORK_PASSPHRASE = NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;

/** Returns true when all three contracts are configured and StrKey-valid. */
export function isContractConfigured(): boolean {
  // Offline demo mode (#177): the mock client is always "configured" — there
  // are no contract ids to validate.
  if (isMockMode()) return true;
  return [REGISTRY_ID, FINANCING_ID, REPAYMENT_ID].every(id => {
    if (!id) return false;
    try {
      new Contract(id);
      return true;
    } catch {
      return false;
    }
  });
}

const client = isMockMode()
  ? createMockClient({ positionTokenAsset: POSITION_TOKEN_ASSET })
  : createInvofiClient({
      rpcUrl: RPC_URL,
      horizonUrl: HORIZON_URL,
      networkPassphrase: NETWORK_PASSPHRASE,
      registryId: REGISTRY_ID,
      financingId: FINANCING_ID,
      repaymentId: REPAYMENT_ID,
      positionTokenAsset: POSITION_TOKEN_ASSET,
      signTransaction: signTransactionWithActiveWallet,
    });

export const {
  // Registry
  registerInvoice,
  getInvoice,
  cancelInvoice,
  // Financing
  createOffer,
  getOffer,
  acceptOffer,
  rejectOffer,
  // Repayment
  repayInvoice,
  markOverdue,
  reclaimInvoice,
  // Position tokens (Task 7/8)
  getPositionTokenId,
  getTokenBalance,
  getTokenDecimals,
  transferPositionToken,
  hasPositionTrustline,
  addPositionTrustline,
} = client;

export { client };

export type { Invoice, FinancingOffer, Currency } from '@invofi/sdk';
