# Architecture Decision Records — InvoFi (app monorepo)

ADRs capture decisions with lasting consequences. New ADRs get the next number;
append, never rewrite (status updates go in the file).

| # | Decision | Status |
|---|---|---|
| 0001 | [Approved-wallet allowlist](./0001-approved-wallet-allowlist.md) | Accepted |
| 0002 | [Event indexer + off-chain store](./0002-event-indexer.md) | Accepted |
| 0003 | [SDK extraction (@invofi/sdk)](./0003-sdk-extraction.md) | Accepted |
| 0004 | [Secondary-market discovery for position tokens](./0004-position-token-listings.md) | Accepted |
| 0005 | [Event-driven keeper](./0005-event-driven-keeper.md) | Accepted |
| 0006 | [Multi-signature approval for high-value operations](./0006-multisig-transaction-approval.md) | Accepted |

Contract-facing decisions live in the contracts repo: [invofi-contracts/docs/adr](https://github.com/Stellar-VaultLink/invofi-contracts/tree/main/docs/adr).

## Why ADRs

- Reviewers (and the SCF audit bank) can see *why* a choice was made without
  digging through commit history.
- Future contributors get a decision map instead of tribal knowledge.
