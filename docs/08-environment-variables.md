# Environment Variables

All environment variables for the InvoFi frontend are prefixed with `NEXT_PUBLIC_` so they are available in the browser. There are no server-side secrets in this stack.

---

## Full Reference

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `https://xxxx.supabase.co` | Your Supabase project URL, from Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `eyJhbGci...` | Supabase anon/public key, from Settings → API |
| `NEXT_PUBLIC_REGISTRY_CONTRACT_ID` | Yes* | `CAXNTWS...` | Registry contract (invoices, admin, pause) — 56 chars, starts with C |
| `NEXT_PUBLIC_FINANCING_CONTRACT_ID` | Yes* | `CBGRA34...` | Financing contract (offers, accept/reject) |
| `NEXT_PUBLIC_REPAYMENT_CONTRACT_ID` | Yes* | `CCDATW5...` | Repayment contract (repay, overdue, reclaim) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` | `testnet` for development, `mainnet` for production |
| `NEXT_PUBLIC_RPC_URL` | Yes | See below | Soroban RPC endpoint (differs by network) |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | See below | Stellar Horizon REST API (differs by network) |
| `NEXT_PUBLIC_USDC_ISSUER` | No | `GBBD47IF...` | USDC issuer address. Required to display USDC balances. |
| `NEXT_PUBLIC_WS_URL` | No | `wss://relay.invofi.dev` | WebSocket relay for the live portfolio dashboard (issue #221). When empty or unreachable the dashboard degrades to Soroban event-stream + Supabase polling. |
| `NEXT_PUBLIC_XLM_USD_PRICE` | No | `0.15` | XLM/USD fallback price used for live USD position values when the live price feed (CoinGecko) is unreachable. |

\* Legacy fallback: if the three `*_CONTRACT_ID` variables are unset, the app
uses the single `NEXT_PUBLIC_CONTRACT_ID` and routes every call to that one
contract (pre-3-contract deployments keep working).

---

## Network Endpoints

### Testnet

```env
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
```

### Mainnet

```env
NEXT_PUBLIC_STELLAR_NETWORK=mainnet
NEXT_PUBLIC_RPC_URL=https://soroban-rpc.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
```

---

## Local Development

Copy the template and fill in your values:

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
```

`.env.local` is in `.gitignore` and will never be committed to the repository.

---

## Vercel

In the Vercel project dashboard, go to **Settings → Environment Variables** and add each variable. Vercel rebuilds and redeploys automatically when you change an environment variable.

To use different values for Preview and Production deployments, set the environment scope for each variable (Vercel lets you target Development, Preview, and Production separately).

---

## How Variables Are Used

| Variable | Used in |
| --- | --- |
| `SUPABASE_URL` + `SUPABASE_ANON_KEY` | `lib/supabase.ts` — creates the Supabase client |
| `REGISTRY_CONTRACT_ID` | `lib/contract.ts` — invoice CRUD calls on the registry contract |
| `FINANCING_CONTRACT_ID` | `lib/contract.ts` — offer/accept calls on the financing contract |
| `REPAYMENT_CONTRACT_ID` | `lib/contract.ts` — repay/reclaim calls on the repayment contract |
| `STELLAR_NETWORK` | `lib/contract.ts`, `lib/walletkit.ts` — network passphrase + wallet network |
| `RPC_URL` | `lib/contract.ts` — Soroban RPC for simulating and sending transactions |
| `HORIZON_URL` | `lib/horizon.ts` — reads account balances and transaction history |
| `USDC_ISSUER` | `lib/horizon.ts` — identifies the USDC asset when reading balances |
| `WS_URL` | `lib/live/*` — live portfolio dashboard WebSocket relay; falls back to polling |
| `XLM_USD_PRICE` | `lib/live/prices.ts` — fallback XLM/USD price for live USD position values |
