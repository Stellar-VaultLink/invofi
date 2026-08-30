# Deployment Guide

This guide deploys the current InvoFi application stack to **Stellar testnet**
from a clean machine:

- the `registry`, `financing`, and `repayment` Soroban contracts;
- the `POS` Stellar Asset Contract used by the position-token UI;
- the Next.js frontend, backed by Supabase; and
- an optional Vercel deployment of that frontend.

The three protocol contracts are separate deployments. The pre-split contract
and its single-contract deployment flow are historical and are not used here.

> **Testnet only:** every Stellar command in this guide explicitly targets
> `testnet`. Testnet assets have no real-world value. Do not reuse a production
> account, production secret, or mainnet contract ID.

---

## Architecture and repositories

InvoFi is split across two repositories. Clone them beside each other so it is
always clear which directory a command belongs in.

| Repository | Purpose | Default branch |
| --- | --- | --- |
| [`invofi`](https://github.com/Stellar-VaultLink/invofi) | Next.js frontend, SDK, scripts, and this documentation | `main` |
| [`invofi-contracts`](https://github.com/Stellar-VaultLink/invofi-contracts) | Rust source for the Soroban contracts | `master` |

The frontend directly calls these three contracts:

| Order | Contract | Deployment dependency |
| --- | --- | --- |
| 1 | `registry` | None; stores invoices and controls lifecycle transitions |
| 2 | `financing` | Constructor receives the registry ID and default settlement token |
| 3 | `repayment` | Constructor receives both earlier IDs and the settlement token |

The contracts repository also contains insurance and reputation extensions.
They are not contract IDs consumed by the current frontend and are outside this
three-contract deployment. The `POS` position token is a Stellar Asset Contract,
not a fourth InvoFi Rust contract, but configuring it enables the frontend's
position-token features.

---

## Prerequisites

You need Git, Node.js 22 or later, npm, Rust installed through `rustup`, Stellar
CLI, and a free Supabase project. A Vercel account is needed only for hosting.

Install Rust and the contract build target on macOS, Linux, or WSL:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
. "$HOME/.cargo/env"
rustup default stable
rustup target add wasm32v1-none
```

Install the latest released Stellar CLI with its official installer:

```bash
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh \
  | sh -s -- --user
export PATH="$HOME/.local/bin:$PATH"
```

The contracts CI instead uses `cargo install --locked stellar-cli`. That route
also requires C build tools, `pkg-config`, DBus development headers, and udev
development headers on Linux.

Verify the installation:

```bash
git --version
node --version
npm --version
rustc --version
cargo --version
rustup target list --installed | grep '^wasm32v1-none$'
stellar --version
```

Success means every command prints a version and the target check prints
`wasm32v1-none`.

---

## 1. Clone both repositories

Run this from the directory in which you keep source code:

```bash
mkdir -p invofi-testnet-deployment
cd invofi-testnet-deployment
git clone https://github.com/Stellar-VaultLink/invofi.git
git clone https://github.com/Stellar-VaultLink/invofi-contracts.git
```

The resulting layout is:

```text
invofi-testnet-deployment/
├── invofi/                 # frontend, SDK, and docs
└── invofi-contracts/       # Rust contracts
```

If you contribute from a fork, clone your fork for `invofi/`. Keep the upstream
contracts clone beside it unless you are also changing contract source.

---

## 2. Configure testnet and create a deployer

The public `testnet` network is built into Stellar CLI. Select it and check its
RPC endpoint:

```bash
stellar network use testnet
stellar network info --network testnet
```

Create and fund a dedicated CLI-managed identity:

```bash
stellar keys generate invofi-deployer --network testnet
stellar keys fund invofi-deployer --network testnet
stellar keys address invofi-deployer
```

Funding uses testnet Friendbot. The final command prints only the public `G...`
address. Do not print the identity's secret, paste it into shell commands, add it
to `.env.local`, or commit the Stellar CLI configuration directory.

If the identity name already exists, reuse it or choose another name and replace
`invofi-deployer` consistently below. Do not overwrite it accidentally.

---

## 3. Build the contracts

Run from the contracts repository:

```bash
cd invofi-testnet-deployment/invofi-contracts
stellar contract build

test -f target/wasm32v1-none/release/invofi_registry.wasm
test -f target/wasm32v1-none/release/invofi_financing.wasm
test -f target/wasm32v1-none/release/invofi_repayment.wasm
```

No output from the three `test -f` commands means all required artifacts exist.

---

## 4. Deploy all three contracts

Stay in `invofi-testnet-deployment/invofi-contracts`. Current contracts receive
their setup through atomic `__constructor` arguments during deploy; they do not
use a separate `initialize` call.

```bash
ADMIN_PUBLIC=$(stellar keys address invofi-deployer)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
USDC_TOKEN=$(stellar contract id asset \
  --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet)

REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_registry.wasm \
  --source invofi-deployer --network testnet \
  -- --admin "$ADMIN_PUBLIC")

FINANCING_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_financing.wasm \
  --source invofi-deployer --network testnet \
  -- --admin "$ADMIN_PUBLIC" --registry "$REGISTRY_ID" --token "$XLM_TOKEN")

REPAYMENT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_repayment.wasm \
  --source invofi-deployer --network testnet \
  -- --admin "$ADMIN_PUBLIC" --registry "$REGISTRY_ID" \
  --financing "$FINANCING_ID" --token "$XLM_TOKEN")

printf 'Registry contract:  %s\n' "$REGISTRY_ID"
printf 'Financing contract: %s\n' "$FINANCING_ID"
printf 'Repayment contract: %s\n' "$REPAYMENT_ID"
```

Each returned value must start with `C` and be 56 characters long. Save these
public, environment-specific IDs. Do not swap their labels.

### Wire callers and currencies

The constructors establish forward dependencies. The reverse caller allowlists
and supported currencies still require admin-authorized calls. Current admin
entry points expect a JSON array of signer addresses:

```bash
SIGNERS="[\"$ADMIN_PUBLIC\"]"

stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- set_financing_contract \
  --signers "$SIGNERS" --financing "$FINANCING_ID"
stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- set_repayment_contract \
  --signers "$SIGNERS" --repayment "$REPAYMENT_ID"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- set_repayment_contract \
  --signers "$SIGNERS" --repayment "$REPAYMENT_ID"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- register_currency \
  --signers "$SIGNERS" --currency XLM --token_addr "$XLM_TOKEN"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- register_currency \
  --signers "$SIGNERS" --currency USDC --token_addr "$USDC_TOKEN"
```

Every call should complete without a contract error.

### Configure the position token

This enables the current position-token balance, trustline, mint, and transfer
features. It creates a `POS` asset, hands the asset contract's admin role to
financing, and configures financing to mint it.

```bash
POSITION_TOKEN_ASSET="POS:$ADMIN_PUBLIC"
POSITION_TOKEN_ID=$(stellar contract id asset \
  --asset "$POSITION_TOKEN_ASSET" --network testnet)

if ! stellar contract info interface --id "$POSITION_TOKEN_ID" \
  --network testnet >/dev/null 2>&1; then
  stellar contract asset deploy --asset "$POSITION_TOKEN_ASSET" \
    --source invofi-deployer --network testnet
fi

stellar contract invoke --id "$POSITION_TOKEN_ID" \
  --source invofi-deployer --network testnet -- \
  set_admin --new_admin "$FINANCING_ID"
stellar contract invoke --id "$FINANCING_ID" \
  --source invofi-deployer --network testnet -- \
  set_position_token --signers "$SIGNERS" --token "$POSITION_TOKEN_ID"

printf 'Position-token asset: %s\n' "$POSITION_TOKEN_ASSET"
printf 'Position-token ID:    %s\n' "$POSITION_TOKEN_ID"
```

The frontend expects `POS:<DEPLOYER_PUBLIC_KEY>`, not the `C...` asset contract
ID, in `NEXT_PUBLIC_POSITION_TOKEN_ASSET`.

---

## 5. Verify the contract deployment

These read-only calls confirm the contract IDs, shared admin, dependency, token
mappings, and position token:

```bash
stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$REPAYMENT_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_registry
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- \
  get_currency_token --currency XLM
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- \
  get_currency_token --currency USDC
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_position_token
```

The first three outputs should equal `$ADMIN_PUBLIC`; `get_registry` should
equal `$REGISTRY_ID`; and the token queries should return the IDs derived above.

---

## 6. Set up Supabase

Follow the [Supabase Setup guide](./06-supabase.md) to create a project and run
the current schema. Copy its public project URL and anon key.

For SEP-10 wallet login, also complete the `wallet_verified` and
`sep10_used_challenges` schema additions in
[Environment Variables](./08-environment-variables.md#server-side-secrets).
Keep the service-role key in server-side secret storage only.

---

## 7. Configure and run the frontend locally

Change from the contracts repository to the nested frontend directory:

```bash
cd ../invofi/invofi/apps/frontend
cp .env.local.example .env.local
```

Replace the placeholders in `.env.local`. Contract IDs and public network
addresses are public; values marked server-only are secrets and must never be
committed.

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=<SUPABASE_PROJECT_URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>

# Stellar testnet
NEXT_PUBLIC_STELLAR_NETWORK=testnet
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_HORIZON_URL=https://horizon-testnet.stellar.org
NEXT_PUBLIC_USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

# Three protocol contracts
NEXT_PUBLIC_REGISTRY_CONTRACT_ID=<REGISTRY_CONTRACT_ID>
NEXT_PUBLIC_FINANCING_CONTRACT_ID=<FINANCING_CONTRACT_ID>
NEXT_PUBLIC_REPAYMENT_CONTRACT_ID=<REPAYMENT_CONTRACT_ID>

# Position-token asset in CODE:ISSUER form
NEXT_PUBLIC_POSITION_TOKEN_ASSET=POS:<DEPLOYER_PUBLIC_KEY>

# SEP-10 wallet login
NEXT_PUBLIC_SEP10_HOME_DOMAIN=localhost
NEXT_PUBLIC_SEP10_WEB_AUTH_DOMAIN=localhost
SEP10_SERVER_SIGNING_SECRET=<DEDICATED_SEP10_SERVER_SECRET>
SUPABASE_SERVICE_ROLE_KEY=<SUPABASE_SERVICE_ROLE_KEY>
```

The frontend accepts `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as an alternative
to `NEXT_PUBLIC_SUPABASE_ANON_KEY`; the checked-in template uses the latter.

These current frontend variables are feature-specific and can remain unset:

| Variable | When to set it |
| --- | --- |
| `PINATA_API_KEY`, `PINATA_SECRET_API_KEY` | Server-only credentials for invoice-document uploads |
| `IPFS_GATEWAY_URL` | Override the default `https://ipfs.io/ipfs` gateway |
| `NEXT_PUBLIC_WS_URL` | Use a WebSocket relay instead of polling |
| `NEXT_PUBLIC_XLM_USD_PRICE` | Pin the fallback XLM/USD display price |
| `NEXT_PUBLIC_SENTRY_DSN` | Send errors to Sentry |
| `NEXT_PUBLIC_MULTISIG_THRESHOLD_XLM`, `NEXT_PUBLIC_MULTISIG_THRESHOLD_USDC` | Override multisig amount thresholds |
| `NEXT_PUBLIC_MULTISIG_REQUIRED_SIGNATURES` | Override the required signature count |
| `NEXT_PUBLIC_MULTISIG_TIMEOUT_SECS` | Override the multisig request timeout |
| `NEXT_PUBLIC_HORIZON_TIMEOUT_MS` | Override the Horizon HTTP timeout |

Do not set `NEXT_PUBLIC_USE_MOCK=1`; it bypasses Supabase and Stellar. Do not
configure the historical single-contract variable; this deployment uses all
three explicit IDs.

Install locked dependencies and start Next.js:

```bash
npm ci --legacy-peer-deps
npm run dev
```

Open <http://localhost:3000>. The page should load without a missing-contract
configuration banner.

---

## 8. Deploy the frontend to Vercel

1. Push the branch you want to deploy to your own GitHub fork.
2. In Vercel, select **Add New → Project** and import that fork.
3. Set **Root Directory** to `invofi/apps/frontend`.
4. Leave the framework as auto-detected **Next.js**. The tracked `vercel.json`
   already provides install, build, output, and development commands.
5. Add every variable from the required `.env.local` block above under
   **Settings → Environment Variables**. For the SEP-10 domain variables, use
   the Vercel hostname without `https://` instead of `localhost`.
6. Add any feature-specific variables you enabled. Treat the Pinata values,
   `SEP10_SERVER_SIGNING_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` as secrets.
7. Apply the values to Preview, Production, or both, then redeploy.
   `NEXT_PUBLIC_` values are embedded at build time.
8. In Supabase **Authentication → URL Configuration**, allow the Vercel URL and
   set the site URL for that environment.

Although `vercel.json` supplies testnet defaults for the network, RPC, and
Horizon variables, setting them explicitly beside the three contract IDs keeps
local and hosted configuration identical.

---

## 9. Smoke-test the stack

1. Open the local or Vercel site and confirm the header identifies testnet.
2. Register with email, then sign out and complete SEP-10 wallet login.
3. Connect a testnet wallet and confirm its XLM balance loads from Horizon.
4. Open each deployed ID in the
   [Stellar Expert testnet explorer](https://stellar.expert/explorer/testnet).
5. As a business, register an invoice and confirm it calls registry.
6. As a second, lender account, create an offer and confirm it calls financing.
7. Establish the `POS` trustline and approve the settlement token, then accept
   the offer; confirm test assets move and a position token is minted.
8. Repay as the business; confirm repayment updates the invoice and offer.

If reads work but a write fails, compare the labeled frontend IDs first. A
swapped ID or omitted caller-wiring call is the most common deployment cause.

---

## Verified testnet deployment command sequence

This is the shortest complete contract-side flow. It mirrors the maintained
contracts workflow's constructor arguments, WASM paths, signer format, funding,
and wiring. Run it from a directory that does not already contain these clones
or an `invofi-deployer` identity.

> **Live verification (2026-08-30):** the testnet contract deployment commands
> below were executed successfully against Stellar testnet on 2026-08-30. The
> run created and funded a throwaway CLI-managed identity, built and deployed
> registry, financing, and repayment in dependency order, completed caller,
> XLM/USDC, and position-token wiring, and passed the read-only checks. No
> secret material is included. The final production frontend build also
> completed with the resulting public IDs and placeholder-only Supabase values.

```bash
set -euo pipefail

git clone https://github.com/Stellar-VaultLink/invofi.git
git clone https://github.com/Stellar-VaultLink/invofi-contracts.git

stellar --version
stellar network use testnet
stellar network info --network testnet
stellar keys generate invofi-deployer --network testnet
stellar keys fund invofi-deployer --network testnet

cd invofi-contracts
stellar contract build
test -f target/wasm32v1-none/release/invofi_registry.wasm
test -f target/wasm32v1-none/release/invofi_financing.wasm
test -f target/wasm32v1-none/release/invofi_repayment.wasm

ADMIN_PUBLIC=$(stellar keys address invofi-deployer)
XLM_TOKEN=$(stellar contract id asset --asset native --network testnet)
USDC_TOKEN=$(stellar contract id asset \
  --asset USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  --network testnet)

REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_registry.wasm \
  --source invofi-deployer --network testnet -- --admin "$ADMIN_PUBLIC")
FINANCING_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_financing.wasm \
  --source invofi-deployer --network testnet -- \
  --admin "$ADMIN_PUBLIC" --registry "$REGISTRY_ID" --token "$XLM_TOKEN")
REPAYMENT_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/invofi_repayment.wasm \
  --source invofi-deployer --network testnet -- \
  --admin "$ADMIN_PUBLIC" --registry "$REGISTRY_ID" \
  --financing "$FINANCING_ID" --token "$XLM_TOKEN")

SIGNERS="[\"$ADMIN_PUBLIC\"]"
stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- set_financing_contract \
  --signers "$SIGNERS" --financing "$FINANCING_ID"
stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- set_repayment_contract \
  --signers "$SIGNERS" --repayment "$REPAYMENT_ID"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- set_repayment_contract \
  --signers "$SIGNERS" --repayment "$REPAYMENT_ID"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- register_currency \
  --signers "$SIGNERS" --currency XLM --token_addr "$XLM_TOKEN"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- register_currency \
  --signers "$SIGNERS" --currency USDC --token_addr "$USDC_TOKEN"

POSITION_TOKEN_ASSET="POS:$ADMIN_PUBLIC"
POSITION_TOKEN_ID=$(stellar contract id asset \
  --asset "$POSITION_TOKEN_ASSET" --network testnet)
if ! stellar contract info interface --id "$POSITION_TOKEN_ID" \
  --network testnet >/dev/null 2>&1; then
  stellar contract asset deploy --asset "$POSITION_TOKEN_ASSET" \
    --source invofi-deployer --network testnet
fi
stellar contract invoke --id "$POSITION_TOKEN_ID" --source invofi-deployer \
  --network testnet -- set_admin --new_admin "$FINANCING_ID"
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- set_position_token \
  --signers "$SIGNERS" --token "$POSITION_TOKEN_ID"

printf 'NEXT_PUBLIC_REGISTRY_CONTRACT_ID=%s\n' "$REGISTRY_ID"
printf 'NEXT_PUBLIC_FINANCING_CONTRACT_ID=%s\n' "$FINANCING_ID"
printf 'NEXT_PUBLIC_REPAYMENT_CONTRACT_ID=%s\n' "$REPAYMENT_ID"
printf 'NEXT_PUBLIC_POSITION_TOKEN_ASSET=%s\n' "$POSITION_TOKEN_ASSET"

stellar contract invoke --id "$REGISTRY_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$REPAYMENT_ID" --source invofi-deployer \
  --network testnet -- get_admin
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_registry
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- \
  get_currency_token --currency XLM
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- \
  get_currency_token --currency USDC
stellar contract invoke --id "$FINANCING_ID" --source invofi-deployer \
  --network testnet -- get_position_token

cd ../invofi/invofi/apps/frontend
cp .env.local.example .env.local
npm ci --legacy-peer-deps
npm run build
```

Before running the frontend build, fill `.env.local` with the placeholder-safe
configuration from Step 7. Never paste or commit deployment, Supabase, Pinata,
or SEP-10 secrets while recording the command output.
