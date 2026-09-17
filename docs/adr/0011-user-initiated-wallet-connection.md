# ADR-0011: User-Initiated Wallet Connection

- Status: Accepted
- Date: 2026-09-17
- Deciders: @samjay8 (maintainer)
- Related: [ADR-0001 approved-wallet allowlist](./0001-approved-wallet-allowlist.md) ·
  issues #172/#187 (last-wallet persistence contract) ·
  commit `027c61ca` (the fix this ADR records) ·
  e2e coverage `apps/frontend/e2e/wallet-connection.spec.ts`

## Context

On page load, `WalletProvider` used to probe **every** installed wallet with
`fetchAddress()` looking for a previously-granted session. For bridge/web
wallets (Albedo, xBull) that call **opens their sign-up window** — so a user
who never touched any wallet saw multiple auth popups on load, and the
popups queued for the not-chosen wallets stayed on screen even after one
wallet connected. Sessions were restored from whichever wallet answered
first, not the one the user chose.

## Decision

**Connection is strictly user-initiated.** Three rules, enforced in
`WalletProvider` and `lib/approved-wallets.ts`:

1. **No probes on load.** The startup effect never calls `fetchAddress()` on
   any wallet except through rule 2. `fetchAddress()` fires from exactly two
   places: the hint-gated silent restore, and an explicit user click in the
   wallet-select dialog.
2. **Hint-gated silent restore, extension-only.** A returning session is
   restored only when the persisted last-wallet hint (`invofi:last-wallet`,
   see `lib/last-wallet.ts`) names a wallet that (a) is installed and
   (b) is flagged `silentRestore: true` in the allowlist — i.e. an extension
   wallet (Freighter, LOBSTR) whose `fetchAddress()` answers without UI once
   access was granted. Bridge/web wallets (Albedo, xBull) are never touched
   without an explicit click, so they can never pop UI on load.
3. **One click, one wallet.** The select dialog connects only the wallet
   whose Connect button was clicked. Disconnect clears the hint, so the next
   load is cold.

## Consequences

- Opening the app is popup-free; returning extension users land connected.
- Bridge wallets require a deliberate click every time — accepted cost;
  their sign-in window *is* the auth step.
- Adding a new wallet to the allowlist now includes a **safety decision**:
  `silentRestore` must be set honestly. An extension wallet that might open
  UI from `fetchAddress()` must ship with `silentRestore: false`.
- The contract is enforced by browser tests
  (`e2e/wallet-connection.spec.ts`: popup observability on cold load, on a
  bridge-wallet hint, and on dialog connect) and by unit tests in
  `src/lib/approved-wallets.test.ts`.
