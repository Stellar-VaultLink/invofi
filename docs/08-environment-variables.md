# Environment Variables

All environment variables for the InvoFi frontend are prefixed with `NEXT_PUBLIC_` so they are available in the browser. There are no server-side secrets in this stack.

---

## Full Reference

| Variable | Required | Example | Description |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | `https://xxxx.supabase.co` | Your Supabase project URL, from Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | `eyJhbGci...` | Supabase anon/public key, from Settings → API |
| `NEXT_PUBLIC_CONTRACT_ID` | Yes | `CACJR3SZ...` | Deployed Soroban contract address (56 characters, starts with C) |
| `NEXT_PUBLIC_STELLAR_NETWORK` | Yes | `testnet` | `testnet` for development, `mainnet` for production |
| `NEXT_PUBLIC_RPC_URL` | Yes | See below | Soroban RPC endpoint (differs by network) |
| `NEXT_PUBLIC_HORIZON_URL` | Yes | See below | Stellar Horizon REST API (differs by network) |
| `NEXT_PUBLIC_USDC_ISSUER` | No | `GBBD47IF...` | USDC issuer address. Required to display USDC balances. |

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
| `CONTRACT_ID` | `lib/contract.ts` — addresses the Soroban contract |
| `STELLAR_NETWORK` | `lib/contract.ts`, `lib/freighter.ts` — selects network passphrase and Freighter network |
| `RPC_URL` | `lib/contract.ts` — connects to the Soroban RPC for simulating and sending transactions |
| `HORIZON_URL` | `lib/horizon.ts` — reads account balances and transaction history |
| `USDC_ISSUER` | `lib/horizon.ts` — identifies the USDC asset when reading balances |
