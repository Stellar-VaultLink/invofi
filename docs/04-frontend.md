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

**Demo mode (issue #107):** when `NEXT_PUBLIC_DEMO_MODE=1` (or the app runs on
the offline mock stack, `NEXT_PUBLIC_USE_MOCK=1`) the hero shows a
**"Try the demo"** button linking to `/portfolio`, labeled as testnet-only. The
demo experience reuses the seeded offline mock data — invoices, offers, and a
position token — so a visiting reviewer can reach a portfolio containing seeded
data without creating an account or connecting a wallet. See
[`src/lib/mock-mode.ts`](invofi/apps/frontend/src/lib/mock-mode.ts) and
[`docs/08-environment-variables.md`](./08-environment-variables.md).

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
- **On-chain activity timeline** (the `EventTimeline` component):
  - Lists this invoice's lifecycle events newest-first — registered, offers
    created/accepted/rejected, repayments, marked overdue, disputes, defaults
  - Sourced live from the Soroban RPC `getEvents`, scoped to this invoice id;
    each row shows a human-readable label plus the raw event type, timestamp,
    ledger number, and tx hash deep-linked to Stellar Expert
  - Empty state explains that the RPC keeps only ~5 days of event history;
    hidden entirely in offline demo mode or when no contracts are configured
  - Data layer (`lib/invoiceEvents.ts`) returns an `InvoiceTimelineEntry[]`
    shape designed to be re-sourced from the indexer events table later (#95)
    without touching the hook or component

### Marketplace — `/marketplace`

Lender-facing page listing all `Pending` invoices.

- Search bar (filter by invoice ID)
- Currency filter (All / XLM / USDC)
- Grid of `MarketplaceCard` components
- Each card links to the invoice detail page where lenders can submit offers

### Position listings — `/marketplace/positions`

Secondary-market discovery for position tokens ([ADR-0004](./adr/0004-position-token-listings.md)).
Discovery only — InvoFi never escrows the token or the payment.

- **Sell a position**: a lender picks one of their live positions (an
  `Accepted`/`Financed` offer), sets the number of position tokens and an
  asking price, and publishes a row in `position_listings`. A listing may not
  exceed the position's principal (1 token = 1 base unit of principal).
- **Your listings**: the seller's own rows in every status, with
  "Settle: transfer" (hands off to `/portfolio` with the size prefilled),
  "Mark settled", and "Withdraw".
- **Open listings**: everyone else's asks — search by invoice reference or
  seller, filter by asking currency, sort by price or size.
- Settlement is a plain SEP-41 transfer the seller signs on `/portfolio`;
  buyers are told to verify the seller's balance on-chain before paying.

### Portfolio — `/portfolio`

Lender's investment tracker.

- Summary stats: active investments, pending offers, completed, total deployed amount
- List of all the lender's financing offers with status, amount, interest rate, duration, and funded date
- **Transfer Position** card: shows the lender's `POS` position-token
  balance and lets them transfer it to any Stellar wallet in one signed
  transaction. Since POS is a Stellar asset, a missing trustline is detected
  and added with a one-click "Add POS trustline" button (changeTrust signed by
  the connected wallet). This is also where a secondary-market sale settles: a
  listing links here with `?amount=` prefilled, and the seller signs the
  transfer themselves

### Forbidden — `/403`

Branded 403 Forbidden error page styled identically to the custom 404 page. Rendered or redirected to whenever a user attempts to access an unauthorized resource or another user's invoice.

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

Wraps authenticated pages. Checks Supabase session/wallet on mount and redirects to `/auth/login` if no session exists. Supports resource-level protection via `isUnauthorized` prop, redirecting to `/403` when unauthorized access is detected.

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

### `components/invoices/EventTimeline.tsx`

The invoice's on-chain audit trail as a simple vertical timeline, newest first. Fetches this invoice's contract events from the Soroban RPC (`getEvents` via `lib/invoiceEvents.ts` + `hooks/useInvoiceEvents.ts`) and renders one row per lifecycle event: colored dot + icon by category, human-readable label with the raw event type chip, timestamp, ledger number, and a truncated tx hash linked to Stellar Expert. Fails soft (loading skeletons / quiet empty + error states) and returns null when no contracts are configured.

### `app/invoices/[id]/print/InvoicePrintView.tsx`

Client-only print view for an individual invoice. Fetches the invoice and financing offers, renders a clean print-optimised layout, and automatically opens the browser print dialog once the data is ready.

Handles:

* Invoice metadata and status
* Financing offers and repayment information
* Contract address and invoice ID in the footer
* Print-specific layout and formatting
* Automatic `window.print()` after the invoice data loads

### `app/invoices/[id]/print/page.tsx`

Print route wrapper for the invoice. Uses a client-only dynamic import with SSR disabled so browser-only APIs such as `useParams` and `window.print()` can be used safely without hydration issues.

### `app/invoices/[id]/page.tsx`

The invoice detail page. Adds a **Print / Export PDF** action that opens the dedicated print view in a new browser tab, and renders the on-chain activity timeline (see `components/invoices/EventTimeline.tsx`) below the financing offers.

### `globals.css`

Adds print-specific styles that hide screen-only UI such as the Navbar, Footer, and toast notifications when generating the printed/PDF version of an invoice.


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
repayInvoice(invoiceId, offerId, repayer, amountStroops)   → Promise<Invoice>  // supports partial repayment
```

### `lib/approved-wallets.ts`

The **approved-wallet allowlist** — the single extension point for wallet
support (see `docs/adr/0001-approved-wallet-allowlist.md`). Approving a third
wallet is one new entry here, nothing else:

```typescript
APPROVED_WALLETS: [{ id, name, description, installUrl, module, isInstalled }]
// currently: Freighter, LOBSTR
```

### `lib/walletkit.ts`

`@creit.tech/stellar-wallets-kit` wiring, driven entirely by the allowlist:

```typescript
initWalletKit()                                // registers approved wallet modules
signTransactionWithActiveWallet(xdr, passphrase) → Promise<string>  // signs with connected wallet
probeWalletNetwork(walletId)                   → Promise<string | null>  // Freighter only
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
