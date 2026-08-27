# ADR-0001: Approved-Wallet Allowlist

- Status: Accepted
- Date: 2026-08-04

## Context

Wallet support must be extensible without touching connection/signing code.
Hand-wiring each wallet's browser API (e.g. Freighter's raw extension API)
means every new wallet doubles maintenance and risks divergent behavior
between wallets.

## Decision

All wallets connect through `@creit.tech/stellar-wallets-kit`. The approved
subset lives in exactly one file — `src/lib/approved-wallets.ts` — which is
the single extension point: approving a third wallet is one new entry in that
list and nothing else. The wallet dialog, provider, and signer all read from
that list. Currently approved: Freighter, LOBSTR, Albedo, xBull, and Ledger.

## Consequences

- New wallet = one config entry, no new code.
- Consistent connect/sign behavior across approved wallets.
- Unapproved kit modules stay excluded until explicitly added.

## Hardware-wallet caveats

Ledger (and any future hardware wallet) differs from browser/bridge wallets in
ways that the app must account for:

- **No auto-restore.** Connecting a hardware wallet opens the native WebUSB
  device picker, so it must never be attempted during automatic session
  restore on page load. Such wallets opt out via `autoConnectable: false` in
  the allowlist entry and are connected only on explicit user action.
- **Keys never leave the device.** All signing happens on the Ledger itself;
  the app only ever sees the public address and a signed transaction.
- **WebUSB is required.** Ledger works only in browsers that expose
  `navigator.usb` (Chromium-based). Availability is gated on that capability,
  and the kit re-validates with the transport at connect time.
- **Buffer polyfill.** The Ledger module pulls in `@ledgerhq/hw-transport-webusb`,
  which references the Node `Buffer` global. The frontend polyfills it (see
  `next.config.mjs`) so the module can load and sign in the browser.
- **Testnet signing needs a device.** End-to-end verification requires a
  physical Ledger with the Stellar app installed; CI covers the allowlist
  wiring, build, and lint instead of live signing.
