# Frontend Guide

The InvoFi frontend is a **Next.js 14** application using the App Router. It lives at `invofi/apps/frontend/`.

---

## Pages

### Landing Page — `/`

The public homepage. No authentication required.

- Hero section with protocol description and CTA buttons
- Protocol stats (total invoices, volume, lenders, avg rate) — populated from on-chain data once the contract is live
- Feature cards explaining how InvoFi works
- Call-to-action directing businesses and lenders to register
- Footer with GitHub link

### Login — `/auth/login`

Two sign-in methods on one page:

1. **Freighter wallet** — click "Connect Freighter", approve in the extension, and you're signed in. If you don't have a Supabase account linked to this wallet yet, you're redirected to register.
2. **Email + password** — standard form using Supabase Auth.

After successful login, redirects to `/dashboard`.

### Register — `/auth/register`

Role-based registration with a visual role picker:

- **Business** — for companies that want to finance invoices
- **Lender / Investor** — for investors who want to earn yield

Collects: display name / company name, email, password, password confirmation. Creates a Supabase auth user and a `user_profiles` row with the selected role.

### Dashboard — `/dashboard`

Role-aware landing page after login.

**Business view:**
- Wallet connection panel (shows XLM balance if connected)
- Stats: total invoices, pending, financed, repaid
- Invoice list (cards linking to detail pages)
- "New Invoice" button → `/invoices/new`

**Lender view:**
- Wallet connection panel
- Stats: active investments, pending offers, completed
- Active investments list
- "Browse Marketplace" button → `/marketplace`

### Create Invoice — `/invoices/new`

Form that registers an invoice on the Stellar blockchain.

Fields:
- **Amount** — numeric with 7 decimal places
- **Currency** — XLM or USDC picker
- **Due date** — date picker (must be in the future)

On submit:
1. Validates the form with Zod
2. Checks that Freighter is connected
3. Calls `registerInvoice()` from `lib/contract.ts` — this builds, simulates, signs, and submits the Soroban transaction
4. Mirrors the invoice to Supabase for fast display
5. Redirects to the invoice detail page

### Invoice Detail — `/invoices/[id]`

Shows the full state of one invoice.

- Invoice metadata: ID, amount, currency, due date, originator address, status badge
- External link to Stellar Explorer for the originator's account
- **Offer list** (the `OfferList` component):
  - If the viewer is the invoice originator: shows Accept and Reject buttons on pending offers
  - If the viewer is a lender: shows a "Make Offer" form (only when invoice is Pending and viewer is not the originator)

### Marketplace — `/marketplace`

Lender-facing page listing all `Pending` invoices.

- Search bar (filter by invoice ID)
- Currency filter (All / XLM / USDC)
- Grid of `MarketplaceCard` components
- Each card links to the invoice detail page where lenders can submit offers

### Portfolio — `/portfolio`

Lender's investment tracker.

- Summary stats: active investments, pending offers, completed, total deployed amount
- List of all the lender's financing offers with status, amount, interest rate, duration, and funded date

---

## Component Reference

### `components/auth/WalletProvider.tsx`

React context that holds the wallet connection state. Wraps the entire app in `Providers.tsx`.

Exposes via `useWallet()`:

| Property | Type | Description |
| --- | --- | --- |
| `publicKey` | `string \| null` | Connected wallet's Stellar address |
| `isConnected` | `boolean` | Whether a wallet is connected |
| `isConnecting` | `boolean` | Connection in progress |
| `connect()` | `async () => void` | Trigger Freighter connection |
| `disconnect()` | `() => void` | Clear wallet state |

### `components/auth/WalletButton.tsx`

Renders a "Connect Freighter" button when disconnected, or an address chip + disconnect button when connected. Used in the Navbar and Dashboard.

### `components/auth/AuthGuard.tsx`

Wraps authenticated pages. Checks Supabase session on mount and redirects to `/auth/login` if no session exists.

### `components/invoices/InvoiceCard.tsx`

A clickable card showing invoice summary: ID, amount, currency, due date, status badge. Links to the detail page.

### `components/invoices/InvoiceForm.tsx`

The create invoice form. Handles Zod validation, wallet check, Soroban contract call, Supabase mirror, and redirect.

### `components/invoices/OfferList.tsx`

Displays offers on an invoice. Handles:
- Loading offers from Supabase
- Showing the offer creation form (for lenders)
- Accept/reject buttons (for originators)
- Calling the Soroban contract and updating Supabase on each action

### `components/marketplace/MarketplaceCard.tsx`

A card for the marketplace listing. Shows amount, currency, due date, originator address (truncated), and a "Make Offer" button linking to the detail page.

---

## Lib Reference

### `lib/contract.ts`

The bridge between the frontend and the Soroban contract. All functions follow the same pattern:

1. Load the user's account from the Soroban RPC
2. Build a transaction with the contract call
3. Simulate it to get the fee and resource budget
4. Assemble the transaction with the simulation result
5. Sign with Freighter
6. Submit and poll until confirmed

Key exports:

```typescript
registerInvoice(params, originatorAddress)  → Promise<Invoice>
getInvoice(id)                              → Promise<Invoice>
createOffer(params, lenderAddress)          → Promise<FinancingOffer>
getOffer(id)                                → Promise<FinancingOffer>
acceptOffer(offerId, originatorAddress)     → Promise<FinancingOffer>
rejectOffer(offerId, originatorAddress)     → Promise<FinancingOffer>
repayInvoice(invoiceId, offerId, repayer)   → Promise<Invoice>
```

### `lib/freighter.ts`

Thin wrappers around `@stellar/freighter-api`:

```typescript
isFreighterInstalled()   → Promise<boolean>
isFreighterAllowed()     → Promise<boolean>
connectFreighter()       → Promise<string>  // returns public key
getFreighterPublicKey()  → Promise<string | null>
signTxWithFreighter(xdr) → Promise<string>  // returns signed XDR
```

### `lib/supabase.ts`

Auth and profile helpers:

```typescript
signUpWithEmail(email, password, role, displayName)
signInWithEmail(email, password)
signOut()
getCurrentUser()
getUserProfile(userId)
linkWalletAddress(userId, walletAddress)
```

### `lib/horizon.ts`

Stellar Horizon API helpers:

```typescript
getAccountBalances(publicKey)  → Promise<AccountBalance[]>
getXlmBalance(publicKey)       → Promise<string>
getUsdcBalance(publicKey)      → Promise<string>
getRecentTransactions(pk, n)   → Promise<TxRecord[]>
explorerUrl(txHash)            → string
```

### `lib/utils.ts`

Formatting utilities:

```typescript
formatAmount(stroops: bigint)   → string   // "1000.0000000"
amountToStroops(str: string)    → bigint   // "1000" → 10000000000n
formatDate(unixTimestamp)       → string   // "Jan 1, 2025"
formatAddress(addr: string)     → string   // "GABC…XYZ1"
interestRateLabel(bps: number)  → string   // "5.00%"
durationLabel(seconds: number)  → string   // "30d", "2mo"
generateInvoiceId()             → string   // "inv_abc123"
generateOfferId()               → string   // "off_xyz789"
```
