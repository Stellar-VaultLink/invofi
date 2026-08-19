# @invofi/sdk

Typed TypeScript client for the **InvoFi** protocol (Task 15). It owns every
Soroban contract call — invoice registration, offers, acceptance/repayment,
position tokens, and trustlines — so the frontend and any future consumers
share one implementation instead of each holding a private copy.

> **Not published yet.** Consumed internally by `apps/frontend`; publishing to
> npm is a fast follow once the ABI is stable (Task 6 done).

## Design

- **Framework-agnostic** — no React, no Next.js, no wallet imports. The
  consumer injects a `signTransaction(txXdr, networkPassphrase)` callback so
  the SDK works with Freighter, LOBSTR, xBull, or anything else behind that
  one function.
- **Single source of truth for types** — `Invoice`, `FinancingOffer`,
  `Currency`, and status unions live here and are re-exported by the frontend.
- **One binding point** — `apps/frontend/src/lib/contract.ts` configures the
  client once (contract IDs + the active wallet signer) and re-exports the
  typed methods. No duplicate contract-call code remains in the frontend.

## Usage

```ts
import { createInvofiClient, Networks } from '@invofi/sdk';
import { signTransactionWithActiveWallet } from './your-wallet';

const invofi = createInvofiClient({
  rpcUrl: 'https://soroban-testnet.stellar.org',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  registryId: 'C…',
  financingId: 'C…',
  repaymentId: 'C…',
  positionTokenAsset: 'POS:GBDD…', // for trustline helpers
  signTransaction: signTransactionWithActiveWallet,
});

const invoice = await invofi.getInvoice('inv_001');
await invofi.acceptOffer('off_001', originatorAddress);
```

## API surface

| Method | Contract | Notes |
|---|---|---|
| `registerInvoice(params, originator)` | registry | emits `inv_reg` |
| `getInvoice(id)` / `cancelInvoice(id, originator)` | registry | `inv_cxl` on cancel |
| `createOffer(params, lender)` | financing | `off_new` |
| `getOffer(id)` / `acceptOffer(id, originator)` / `rejectOffer(id, originator)` | financing | `off_acc` / `off_rej` |
| `repayInvoice(invoiceId, offerId, repayer, amount)` | repayment | `inv_rep` |
| `markOverdue(invoiceId, caller)` | repayment | `inv_ovd` |
| `reclaimInvoice(invoiceId, offerId, lender)` | repayment | default path |
| `getPositionTokenId()` / `getTokenBalance()` / `getTokenDecimals()` | financing + token | Task 7/8 |
| `transferPositionToken(tokenId, from, to, amount)` | token (SEP-41) | Task 8 |
| `hasPositionTrustline(addr)` / `addPositionTrustline(addr)` | Horizon | POS trustline support |

Read-only calls accept an optional `sourceAccount` (the connected wallet);
when omitted they fall back to a fixed read account that is funded on testnet,
so reads never fail because a throw-away account doesn't exist in the ledger.

## Event stream — `listenToEvents`

`listenToEvents` polls the Stellar Soroban RPC for on-chain protocol events and
delivers **strongly-typed payloads** to your callback. No WebSocket or
subgraph infrastructure is required — RPC polling on a 5 s interval matches
the ~5 s Stellar ledger cadence.

```ts
import { listenToEvents, Networks } from '@invofi/sdk';

const stop = listenToEvents({
  rpcUrl:            'https://soroban-testnet.stellar.org',
  networkPassphrase: Networks.TESTNET,
  // Pass all relevant contract IDs to cover the full protocol event surface:
  contractIds: [registryId, financingId, repaymentId, insuranceId, reputationId],
  // Optionally filter to a subset of the 20 protocol event types:
  eventTypes:  ['inv_reg', 'off_acc', 'inv_rep'],
  pollIntervalMs: 5_000,
  onEvent(event) {
    // TypeScript narrows `event.data` to the correct payload via `event.type`:
    switch (event.type) {
      case 'inv_reg':
        console.log('Invoice registered:', event.subjectId, 'by', event.data.originator);
        break;
      case 'off_acc':
        console.log('Offer accepted:', event.subjectId, 'lender', event.data.lender);
        break;
      case 'inv_rep':
        console.log('Repayment:', event.subjectId, 'fully paid?', event.data.fullyRepaid);
        break;
    }
  },
  onError(err, { attempt, nextRetryMs }) {
    console.error(`Poll attempt ${attempt} failed: ${err.message} — retry in ${nextRetryMs}ms`);
  },
});

// Stop polling when the component unmounts / script exits:
stop();
```

### All event types

| `event.type` | Contract   | Key payload fields                          |
|--------------|------------|---------------------------------------------|
| `inv_reg`    | registry   | `originator`, `amount`, `dueDate`           |
| `inv_amt`    | registry   | `newAmount`                                 |
| `inv_sts`    | registry   | `newStatus`                                 |
| `inv_cxl`    | registry   | `originator`                                |
| `inv_ovd`    | registry   | `dueDate`                                   |
| `inv_def`    | registry   | `invoiceId`                                 |
| `inv_dsp`    | registry   | `originator`                                |
| `inv_rsl`    | registry   | `newStatus`                                 |
| `off_new`    | financing  | `invoiceId`, `lender`, `amount`, `interestRate` |
| `off_wdr`    | financing  | `lender`                                    |
| `off_acc`    | financing  | `invoiceId`, `lender`, `amount`             |
| `off_rej`    | financing  | `invoiceId`                                 |
| `off_def`    | repayment  | `invoiceId`, `lender`                       |
| `pos_mint`   | financing  | `lender`, `amount`                          |
| `inv_rep`    | repayment  | `offerId`, `amount`, `fullyRepaid`          |
| `pool_stk`   | insurance  | `staker`, `amount`                          |
| `pool_un`    | insurance  | `staker`, `amount`                          |
| `pool_pay`   | insurance  | `recipient`, `amount`                       |
| `reputn`     | reputation | `address`, `score`                          |

### Event-driven upgrade path

The polling implementation is isolated inside `listenToEvents`. When a
WebSocket or server-sent-event relay becomes available, replace the internal
`poll()` loop with a streaming source. The `ProtocolEvent` types, `onEvent`,
and `onError` interfaces are unchanged — consumers migrate with zero code
changes.

### Options reference

| Option            | Type                        | Default    | Description |
|-------------------|-----------------------------|------------|-------------|
| `rpcUrl`          | `string`                    | required   | Soroban RPC endpoint |
| `networkPassphrase` | `string`                  | required   | e.g. `Networks.TESTNET` |
| `contractIds`     | `string[]`                  | required   | Contract IDs to listen on |
| `eventTypes`      | `ProtocolEventName[]`       | all events | Subset of event types to receive |
| `onEvent`         | `(event: ProtocolEvent) => void` | required | Typed event callback |
| `onError`         | `(err, ctx) => void`        | none       | Error callback (polling continues) |
| `pollIntervalMs`  | `number`                    | `5000`     | Poll interval in ms |
| `startLedger`     | `number`                    | latest     | Starting ledger (omit for live-only) |
| `maxRetries`      | `number`                    | `3`        | Max consecutive failures before back-off |

## Contract-interaction testing framework (issue #226)

The mock client is a full contract-interaction testing framework. Tests run
entirely in memory — no testnet, no RPC, no wallet — and can assert on the
same typed surfaces the real client exposes, including the `ProtocolEvent`
shapes that `listenToEvents` delivers.

### What you get

- **In-memory state** — `createMockClient()` starts from deterministic
  pre-seeded fixtures (invoices in every status, offers, position-token
  balances). Each instance gets a fresh copy, so tests never leak state.
- **Event emission tracking** — every successful state-changing call records
  the protocol event it would have emitted on-chain in `client.events`
  (`inv_reg`, `inv_cxl`, `off_new`, `off_acc`, `off_rej`, `inv_rep`,
  `inv_ovd`, `off_def`), each with a deterministic fake `ledger`/`txHash`.
- **Typed failure scenarios** — domain failures throw typed `ContractError`s:
  `NOT_FOUND` (missing id), `UNAUTHORIZED` (wrong originator/lender),
  `ALREADY_EXISTS` (duplicate id), `INSUFFICIENT_BALANCE` (overdraft).
- **Configurable failure injection** — simulate arbitrary RPC/contract
  failures deterministically with the `failures` option, `failNext(...)`, or
  `addFailure(...)`.
- **State control** — `reset()` restores the seed between tests,
  `setBalance`/`getBalance` set up balance scenarios, and
  `seededInvoices()`/`seededOffers()` expose the fixture builders.
- **Fixture builders** — `createTestInvoice()` / `createTestOffer()` compose
  SDK-valid pre-seeded data with sensible defaults and full overrides.

### Example — happy path with event assertions

```ts
import { createMockClient, createTestInvoice, MOCK_BUSINESS_A, ContractErrorType } from '@invofi/sdk';

const client = createMockClient();

// Compose a custom fixture and register it like a real call.
const invoice = createTestInvoice({ id: 'inv_42', amount: toStroops(500) });
await client.registerInvoice(
  { id: invoice.id, amount: invoice.amount, currency: invoice.currency, dueDate: invoice.due_date },
  invoice.originator,
);

// The mock emitted the same event the registry contract would publish:
expect(client.events).toHaveLength(1);
const emitted = client.events[0];
expect(emitted.type).toBe('inv_reg');
if (emitted.type === 'inv_reg') {
  expect(emitted.subjectId).toBe('inv_42');
  expect(emitted.data.amount).toBe(toStroops(500));
}
```

### Example — failure scenarios

```ts
// Typed domain failures need no setup:
await expect(client.getInvoice('inv_nope')).rejects.toMatchObject({
  errorType: ContractErrorType.NOT_FOUND,
});
await expect(client.cancelInvoice('inv_mock_p001', MOCK_BUSINESS_A)).rejects.toMatchObject({
  errorType: ContractErrorType.UNAUTHORIZED, // only the originator may cancel
});

// Inject an arbitrary failure for the next call only:
client.failNext('acceptOffer', undefined, 'simulated outage');
await expect(client.acceptOffer(offerId, originator)).rejects.toThrow(/simulated outage/);

// Or configure a sticky rule up front:
const flaky = createMockClient({
  failures: [{ on: 'transferPositionToken', message: 'token contract paused' }],
});
```

### Example — reset between test cases

```ts
const client = createMockClient();

await client.acceptOffer('off_mock_006', MOCK_BUSINESS_B);   // mutates state + emits off_acc
await client.reset();                                        // back to the seed

expect((await client.getInvoice('inv_mock_p002')).status).toBe('Pending');
expect(client.events).toHaveLength(0);
```

### Fixture builders

| Helper             | Defaults                                                              |
|--------------------|-----------------------------------------------------------------------|
| `createTestInvoice`| `inv_test_001`, `MOCK_BUSINESS_A`, 100 XLM, due in 30 days, `Pending` |
| `createTestOffer`  | `off_test_001`, `inv_test_001`, `MOCK_LENDER_B`, 5 %, 30 days, `Pending` |

Both accept full overrides (`id`, `amount`, `currency`, `status`, …) plus
readable aliases (`dueDate` for `due_date`, `invoiceId` for `invoice_id`). Use
`toStroops(n)` to convert whole XLM/USDC units to stroops.

> **Design note:** the mock implements the complete `InvofiClient` method
> surface, so it is a drop-in for real contract interactions in tests and
> demo mode alike. It deliberately does not simulate Soroban transaction
> assembly/signing — validation, typed errors, events, and state transitions
> are what test suites exercise against it.

## Local dev

```bash
cd invofi/apps/sdk
npm install
npm run type-check
npm test
```
