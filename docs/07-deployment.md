# Deployment Guide

This guide covers the full deployment process for InvoFi on free infrastructure. By the end you will have:

- A live Soroban smart contract on Stellar testnet
- A running Next.js frontend on Vercel
- A configured Supabase project for auth and data

Total cost: **$0**

---

## Prerequisites

Install these tools before starting:

```bash
# Rust (for building the contract)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI (for deploying the contract)
cargo install --locked stellar-cli

# Node.js 20+ (for the frontend)
# https://nodejs.org or via nvm: nvm install 20
```

---

## Step 1 — Set Up Supabase

Follow the [Supabase Setup guide](./06-supabase.md) to:

1. Create a free Supabase project
2. Run the database schema SQL
3. Copy your **Project URL** and **Anon Key**

---

## Step 2 — Deploy the Smart Contract

### 2a. Generate a deployer keypair

```bash
stellar keys generate --global invofi-deployer --network testnet
```

This creates a keypair stored in `~/.config/stellar/identity/invofi-deployer.toml`.

### 2b. Fund the deployer account (testnet only)

```bash
stellar keys fund invofi-deployer --network testnet
```

This uses Stellar's Friendbot to add 10,000 XLM to your testnet account.

### 2c. Build the contract

```bash
cd invofi/apps/contracts
cargo build --release --target wasm32-unknown-unknown
```

The WASM binary is at:

```text
target/wasm32-unknown-unknown/release/invofi_invoice_registry.wasm
```

### 2d. Deploy to testnet

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/invofi_invoice_registry.wasm \
  --source invofi-deployer \
  --network testnet
```

The output is a **contract ID** that looks like:

```text
CACJR3SZ6TK2IGOEQB33GMPOGNDFGD74Z3L32P5WJY2Y5BMWEFJFFWH6
```

**Copy this.** You need it in the next step.

---

## Step 3 — Configure the Frontend

```bash
cd invofi/apps/frontend
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

NEXT_PUBLIC_CONTRACT_ID=CACJR3SZ6TK2IGOEQB33GMPOGNDFGD74Z3L32P5WJY2Y5BMWEFJFFWH6

NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
```

### Verify locally

```bash
npm install
npm run dev
# → http://localhost:3000
```

Test the full flow:
1. Register with an email
2. Install and connect Freighter wallet (get testnet XLM from [Stellar Laboratory](https://laboratory.stellar.org/#account-creator))
3. Create an invoice
4. Open a second browser profile, register as a lender, make an offer
5. Accept the offer as the business
6. Repay the invoice

If all steps work locally, deploy to Vercel.

---

## Step 4 — Deploy to Vercel

### 4a. Push to GitHub

```bash
git add .
git commit -m "feat: ready for deployment"
git push origin main
```

### 4b. Import to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **Add New → Project**.
3. Select the `invofi` repository (formerly `vault-link`).
4. Set **Root Directory** to `invofi/apps/frontend`.
5. Framework preset: **Next.js** (auto-detected).

### 4c. Add environment variables

In the Vercel project settings under **Environment Variables**, add:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key |
| `NEXT_PUBLIC_CONTRACT_ID` | Your deployed contract ID |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-testnet.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon-testnet.stellar.org` |

### 4d. Deploy

Click **Deploy**. Vercel builds the Next.js app and gives you a URL like `https://invofi.vercel.app`.

### 4e. Update your Supabase Auth redirect URL

1. In Supabase: go to **Authentication → URL Configuration**.
2. Add your Vercel URL to **Redirect URLs**: `https://invofi.vercel.app/**`
3. Set **Site URL** to `https://invofi.vercel.app`.

---

## Step 5 — Verify Production

Once deployed, test the golden path:

1. Open your Vercel URL in a browser with Freighter installed
2. Register as a business
3. Connect your Freighter wallet (use testnet XLM from Friendbot if needed)
4. Create an invoice
5. Switch to a different account, register as a lender
6. Find the invoice in the marketplace and make an offer
7. Switch back to the business account and accept the offer
8. Repay the invoice

All state changes should be visible on [Stellar Expert](https://stellar.expert/explorer/testnet).

---

## Deploying to Mainnet

When ready to go to mainnet:

1. Fund a real mainnet keypair (buy XLM from an exchange).
2. Deploy the contract to mainnet:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/invofi_invoice_registry.wasm \
  --source invofi-deployer \
  --network mainnet
```

3. Update Vercel environment variables:

| Variable | Mainnet value |
| --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `mainnet` |
| `NEXT_PUBLIC_RPC_URL` | `https://soroban-rpc.stellar.org` |
| `NEXT_PUBLIC_HORIZON_URL` | `https://horizon.stellar.org` |
| `NEXT_PUBLIC_CONTRACT_ID` | Your mainnet contract ID |

4. Redeploy on Vercel.

---

## Continuous Deployment

Once Vercel is connected to your GitHub repo, every push to `main` triggers an automatic redeploy. No CI configuration needed for the frontend.

For contract changes, you must redeploy manually using `stellar contract deploy` and update the `NEXT_PUBLIC_CONTRACT_ID` environment variable in Vercel.
