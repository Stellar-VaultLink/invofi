# ADR-0007: Repository topology and SDK location

**Status:** Accepted (2026-08-29)

## Context

InvoFi has two active repositories with different ownership and change
cadences. The application repository contains the user-facing application and
its supporting TypeScript tooling. The contract repository contains the
Soroban protocol implementation. The former standalone frontend repository is
archived.

[ADR-0003](./0003-sdk-extraction.md) established `apps/sdk` as the
framework-agnostic `@invofi/sdk` package. This ADR records where that package
belongs and formalises the repository boundary; it does not introduce a
repository move.

## Decision

1. **The active project uses two repositories.**
   [Stellar-VaultLink/invofi](https://github.com/Stellar-VaultLink/invofi) is
   the application monorepo. It owns the frontend, `apps/sdk`, the indexer,
   application scripts, and application documentation.
   [Stellar-VaultLink/invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts)
   owns the Soroban contract source, contract tests, deployments, and
   contract-facing architectural decisions.
2. **Contracts remain separate.** Contract changes have a slower, more
   controlled lifecycle because they require security review and may affect an
   audited protocol surface. A dedicated repository gives reviewers a focused,
   traceable contract history and prevents faster-moving application work from
   obscuring contract changes or coupling the two release cadences.
3. **The frontend and SDK remain together.** The frontend is the SDK's direct
   application consumer. Keeping them in one repository allows contract-call
   adapters, shared types, and application integration to change and be tested
   together without routine cross-repository coordination.
4. **`apps/sdk` belongs in the application repository.** The SDK is the typed,
   framework-agnostic boundary between application consumers and deployed
   contract interfaces. It can serve scripts, bots, the indexer, or future
   applications without moving the contract implementation into this
   repository. Its location does not transfer ownership of contract source or
   contract-facing decisions from `invofi-contracts`.
5. **The old standalone frontend repository stays archived.**
   [Stellar-VaultLink/invofi-frontend](https://github.com/Stellar-VaultLink/invofi-frontend)
   is a historical repository, not an active development target. Frontend
   changes belong in `invofi`; the archived repository is not maintained as a
   synchronized copy.

## Rationale

Contract code benefits from a narrow, audit-friendly review surface, explicit
security ownership, and a history that changes only when the protocol changes.
Application code benefits from shorter iteration cycles and coordinated
changes across its UI and reusable client boundary. The two-repository split
preserves those different workflows while `apps/sdk` makes the boundary
between them explicit.

A third active repository for the SDK would add version and pull-request
coordination between the SDK and its primary consumer without improving
contract isolation. Keeping it in `invofi` preserves reuse at the package
boundary while avoiding that extra coordination.

## Consequences

- Contract development can follow a slower security-review and audit cadence
  without being mixed into application history.
- Frontend and SDK types, adapters, and tests can evolve together in one pull
  request.
- Repository ownership is explicit: application integration belongs in
  `invofi`; contract implementation and contract decisions belong in
  `invofi-contracts`.
- Changes that alter both a contract interface and its application integration
  may require coordinated pull requests and release sequencing across the two
  repositories.
- Contributors must identify the owning repository before starting work, and
  cross-repository documentation links must be kept current.
- The SDK shares the application repository's governance and release workflow;
  if its external-consumer needs diverge materially, this decision should be
  revisited rather than creating an untracked copy.
- The archived frontend repository may contain stale instructions or links;
  current frontend documentation and contributions belong in `invofi`.

## Repository references

- Application repository: [Stellar-VaultLink/invofi](https://github.com/Stellar-VaultLink/invofi)
- Contracts repository: [Stellar-VaultLink/invofi-contracts](https://github.com/Stellar-VaultLink/invofi-contracts)
- Contracts ADR index: [invofi-contracts/docs/adr/README.md](https://github.com/Stellar-VaultLink/invofi-contracts/blob/master/docs/adr/README.md)
- Archived frontend repository: [Stellar-VaultLink/invofi-frontend](https://github.com/Stellar-VaultLink/invofi-frontend)
