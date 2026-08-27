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
the single extension point: approving a new wallet is one new entry in that
list and nothing else. The wallet dialog, provider, and signer all read from
that list. Currently approved: Freighter, LOBSTR, and Albedo.

## Consequences

- New wallet = one config entry, no new code.
- Consistent connect/sign behavior across approved wallets.
- Unapproved kit modules stay excluded until explicitly added.
