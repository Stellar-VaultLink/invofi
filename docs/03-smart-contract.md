# Smart Contract Reference

The InvoFi smart contract (`invofi/apps/contracts/lib.rs`) is a single Soroban contract called `invofi-invoice-registry`. It manages the complete lifecycle of invoices and financing offers on the Stellar ledger.

---

## Data Types

### Invoice

```rust
pub struct Invoice {
    pub id: Symbol,           // Unique ID (e.g. "inv_abc123")
    pub originator: Address,  // Stellar address of the business
    pub amount: i128,         // Amount in stroops (divide by 10^7 for display)
    pub currency: Symbol,     // "XLM" or "USDC"
    pub due_date: u64,        // Unix timestamp of the payment due date
    pub status: InvoiceStatus,
}
```

### InvoiceStatus

```rust
pub enum InvoiceStatus {
    Pending   = 0,   // Registered, accepting offers
    Financed  = 1,   // Offer accepted, funds expected
    Repaid    = 2,   // Business has repaid
    Overdue   = 3,   // Due date passed without repayment
    Cancelled = 4,   // Cancelled by originator
}
```

### FinancingOffer

```rust
pub struct FinancingOffer {
    pub id: Symbol,           // Unique ID (e.g. "off_xyz789")
    pub invoice_id: Symbol,   // The invoice this offer targets
    pub lender: Address,      // Stellar address of the investor
    pub amount: i128,         // Offer amount in stroops
    pub currency: Symbol,     // "XLM" or "USDC"
    pub interest_rate: u32,   // Basis points (500 = 5.00%)
    pub duration: u64,        // Financing duration in seconds
    pub status: OfferStatus,
    pub funded_at: u64,       // Unix timestamp of acceptance (0 = not yet accepted)
}
```

### OfferStatus

```rust
pub enum OfferStatus {
    Pending   = 0,   // Submitted, awaiting business decision
    Accepted  = 1,   // Business accepted this offer
    Rejected  = 2,   // Business rejected this offer
    Repaid    = 3,   // Invoice repaid, offer cycle complete
    Defaulted = 4,   // Invoice went overdue
}
```

---

## Storage

The contract uses two persistent storage maps keyed by `Symbol`:

| Key | Type | Contents |
| --- | --- | --- |
| `"invoices"` | `Map<Symbol, Invoice>` | All registered invoices |
| `"offers"` | `Map<Symbol, FinancingOffer>` | All financing offers |

---

## Functions

### register_invoice

```rust
pub fn register_invoice(
    env: Env,
    id: Symbol,
    originator: Address,
    amount: i128,
    currency: Symbol,
    due_date: u64,
) -> Invoice
```

Registers a new invoice on the Stellar ledger.

- **Auth:** `originator.require_auth()` — the business must sign this transaction.
- **Panics:** `"Invoice with this ID already exists"` if the ID is taken.
- **Returns:** The created `Invoice` struct.

---

### get_invoice

```rust
pub fn get_invoice(env: Env, id: Symbol) -> Invoice
```

Reads an invoice by ID. No auth required.

- **Panics:** `"Invoice not found"` if the ID does not exist.

---

### update_invoice_status

```rust
pub fn update_invoice_status(
    env: Env,
    id: Symbol,
    new_status: InvoiceStatus,
) -> Invoice
```

Manually updates an invoice's status. Intended for admin/originator use cases not covered by other functions.

---

### create_offer

```rust
pub fn create_offer(
    env: Env,
    offer_id: Symbol,
    invoice_id: Symbol,
    lender: Address,
    amount: i128,
    currency: Symbol,
    interest_rate: u32,
    duration: u64,
) -> FinancingOffer
```

Submits a financing offer on an existing invoice.

- **Auth:** `lender.require_auth()` — the investor must sign.
- **Panics:** `"Invoice not found"` if the invoice does not exist; `"Offer with this ID already exists"` if the offer ID is taken.

---

### get_offer

```rust
pub fn get_offer(env: Env, id: Symbol) -> FinancingOffer
```

Reads an offer by ID. No auth required.

- **Panics:** `"Offer not found"` if the ID does not exist.

---

### accept_offer

```rust
pub fn accept_offer(
    env: Env,
    offer_id: Symbol,
    invoice_originator: Address,
) -> FinancingOffer
```

Accepts a financing offer. This atomically:

1. Sets the offer status to `Accepted` and records the current timestamp in `funded_at`.
2. Sets the invoice status to `Financed`.

- **Auth:** `invoice_originator.require_auth()` — only the business that registered the invoice can accept.
- **Panics:** `"Offer is not in Pending status"`, `"Invoice not found"`, `"Only the invoice originator can accept offers"`, `"Invoice is not in Pending status"`.

---

### reject_offer

```rust
pub fn reject_offer(
    env: Env,
    offer_id: Symbol,
    invoice_originator: Address,
) -> FinancingOffer
```

Rejects a pending financing offer. The invoice remains `Pending` and can still receive other offers.

- **Auth:** `invoice_originator.require_auth()`
- **Panics:** Same originator and status checks as `accept_offer`.

---

### repay_invoice

```rust
pub fn repay_invoice(
    env: Env,
    invoice_id: Symbol,
    offer_id: Symbol,
    repayer: Address,
) -> Invoice
```

Marks an invoice as repaid. This atomically:

1. Sets the invoice status to `Repaid`.
2. Sets the linked offer status to `Repaid`.

- **Auth:** `repayer.require_auth()` — must be the invoice originator.
- **Panics:** `"Invoice must be Financed before repayment"`, `"Offer must be Accepted before repayment"`, `"Offer does not belong to this invoice"`.

---

### mark_overdue

```rust
pub fn mark_overdue(env: Env, invoice_id: Symbol) -> Invoice
```

Marks a financed invoice as overdue. Can be called by anyone once the `due_date` timestamp has passed.

- **Panics:** `"Only Financed invoices can be marked Overdue"`, `"Invoice due date has not passed"`.

---

## Invoice Lifecycle

```text
                    register_invoice()
                           │
                           ▼
                       [Pending]
                      /    |    \
        reject_offer()     |     reject_offer()
         (stays Pending)   |      (stays Pending)
                           |
                    accept_offer()
                           │
                           ▼
                      [Financed]
                      /         \
           repay_invoice()     mark_overdue()
                  │                  │
                  ▼                  ▼
              [Repaid]          [Overdue]
```

---

## Amounts and Precision

Amounts in the contract are stored as `i128` in **stroops**, following the Stellar convention:

```
1 XLM  = 10,000,000 stroops
1 USDC = 10,000,000 units (7 decimal places)
```

The frontend utility function `formatAmount(stroops: bigint): string` handles display conversion. The inverse is `amountToStroops(display: string): bigint`.

---

## Building and Testing

```bash
cd invofi/apps/contracts

# Run all tests
cargo test -- --nocapture

# Build WASM binary
cargo build --release --target wasm32-unknown-unknown

# Output: target/wasm32-unknown-unknown/release/invofi_invoice_registry.wasm
```

---

## Test Coverage

| Test | Covers |
| --- | --- |
| `test_register_and_get_invoice` | Happy path: create + read |
| `test_duplicate_invoice_id_panics` | Guard: duplicate ID rejected |
| `test_get_non_existent_invoice` | Guard: not-found panic |
| `test_update_invoice_status` | Status mutation |
| `test_create_and_get_offer` | Offer happy path |
| `test_accept_offer` | Accept flow + invoice state change |
| `test_reject_offer` | Reject flow + invoice stays Pending |
| `test_repay_invoice` | Full repayment flow |
| `test_repay_unfinanced_invoice_panics` | Guard: can't repay before financing |
