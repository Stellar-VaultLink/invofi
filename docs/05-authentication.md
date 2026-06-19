# Authentication

InvoFi supports two authentication methods that can be used independently or together.

---

## Method 1 — Email + Password (via Supabase)

Standard email/password auth backed by Supabase Auth.

### Sign up flow

1. User visits `/auth/register`
2. Selects a role: **Business** or **Lender**
3. Fills in display name, email, password, password confirmation
4. Frontend calls `signUpWithEmail(email, password, role, displayName)` from `lib/supabase.ts`
5. Supabase creates an auth user and sends a verification email
6. A row is inserted into `user_profiles` with the user's ID, role, and display name
7. User is redirected to `/auth/login` with a "check your email" message

### Login flow

1. User visits `/auth/login`
2. Enters email and password
3. Frontend calls `signInWithEmail(email, password)`
4. Supabase returns a JWT session token stored in an httpOnly cookie
5. User is redirected to `/dashboard`

### Session persistence

Supabase JS client handles session storage and refresh automatically. The session persists across page reloads.

---

## Method 2 — Freighter Wallet

For users who prefer to authenticate with their Stellar wallet rather than creating an email account.

### Connect flow

1. User clicks "Connect Freighter" on the login page or in the Navbar
2. `connectFreighter()` from `lib/freighter.ts` calls `requestAccess()` on the Freighter extension
3. The Freighter extension popup appears asking the user to approve
4. On approval, `getPublicKey()` returns the user's Stellar address
5. The `WalletProvider` context stores the public key in React state
6. If the user has a Supabase account with this wallet address linked, they are treated as signed in

### Wallet linking

A user can register with email and link their Freighter wallet later:

1. Sign in with email
2. On the Dashboard, click "Connect Freighter"
3. The frontend calls `linkWalletAddress(userId, walletAddress)` which updates the `wallet_address` column in `user_profiles`
4. From this point, the wallet can be used to sign on-chain transactions

### On-chain signing

Wallet connection is separate from transaction signing. Even if the user is logged in with email, they need Freighter connected to:

- Register an invoice (signs with `register_invoice`)
- Submit a financing offer (signs with `create_offer`)
- Accept or reject an offer (signs with `accept_offer` / `reject_offer`)
- Repay an invoice (signs with `repay_invoice`)

The frontend always checks `isConnected` before attempting any contract call and shows a warning if the wallet is not connected.

---

## Auth State in the App

The app uses two independent auth states that work together:

| State | Source | What it controls |
| --- | --- | --- |
| Supabase session | `supabase.auth.getUser()` | Route protection (AuthGuard), user profile, role-based UI |
| Wallet state | `WalletProvider` context | Contract signing, address display, XLM balance |

A user can be:
- **Email only** — can browse the app but cannot submit on-chain transactions
- **Wallet only** — can sign transactions but has no persistent profile unless a Supabase account is linked
- **Both** — full functionality

---

## Route Protection

Protected pages are wrapped in `<AuthGuard>`:

```tsx
// Every protected page
export default function DashboardPage() {
  return (
    <AuthGuard>
      {/* page content */}
    </AuthGuard>
  );
}
```

`AuthGuard` checks `supabase.auth.getUser()` on mount. If no session exists, it redirects to `/auth/login`. While checking, it renders a centered loading spinner.

---

## Security Notes

- Supabase session tokens are managed by the Supabase JS client using secure cookies.
- Wallet private keys never leave the Freighter extension — InvoFi only receives signed transaction XDR strings.
- The `user_profiles` table has Row Level Security enabled: users can only read and write their own profile row.
- The `wallet_address` field in `user_profiles` is informational — on-chain transactions are validated by Soroban's `require_auth()`, not by the database.
