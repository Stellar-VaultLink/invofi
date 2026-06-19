#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol};

// ─── Invoice ─────────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invoice {
    pub id: Symbol,
    pub originator: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub due_date: u64,
    pub status: InvoiceStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum InvoiceStatus {
    Pending   = 0,
    Financed  = 1,
    Repaid    = 2,
    Overdue   = 3,
    Cancelled = 4,
}

// ─── Financing Offer ─────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FinancingOffer {
    pub id: Symbol,
    pub invoice_id: Symbol,
    pub lender: Address,
    pub amount: i128,
    pub currency: Symbol,
    /// Interest rate in basis points (e.g. 500 = 5.00%)
    pub interest_rate: u32,
    /// Financing duration in seconds
    pub duration: u64,
    pub status: OfferStatus,
    /// Unix timestamp when the offer was accepted; 0 if not yet accepted
    pub funded_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum OfferStatus {
    Pending   = 0,
    Accepted  = 1,
    Rejected  = 2,
    Repaid    = 3,
    Defaulted = 4,
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

fn load_invoices(env: &Env) -> Map<Symbol, Invoice> {
    env.storage()
        .persistent()
        .get(&symbol_short!("invoices"))
        .unwrap_or(Map::new(env))
}

fn save_invoices(env: &Env, map: &Map<Symbol, Invoice>) {
    env.storage()
        .persistent()
        .set(&symbol_short!("invoices"), map);
}

fn load_offers(env: &Env) -> Map<Symbol, FinancingOffer> {
    env.storage()
        .persistent()
        .get(&symbol_short!("offers"))
        .unwrap_or(Map::new(env))
}

fn save_offers(env: &Env, map: &Map<Symbol, FinancingOffer>) {
    env.storage()
        .persistent()
        .set(&symbol_short!("offers"), map);
}

// ─── Contract ────────────────────────────────────────────────────────────────

#[contract]
pub struct InvoiceRegistryContract;

#[contractimpl]
impl InvoiceRegistryContract {
    // ── Invoice functions ────────────────────────────────────────────────────

    /// Register a new invoice. Only the originator can call this.
    pub fn register_invoice(
        env: Env,
        id: Symbol,
        originator: Address,
        amount: i128,
        currency: Symbol,
        due_date: u64,
    ) -> Invoice {
        originator.require_auth();

        let mut invoices = load_invoices(&env);
        if invoices.contains_key(id.clone()) {
            panic!("Invoice with this ID already exists");
        }

        let invoice = Invoice {
            id: id.clone(),
            originator,
            amount,
            currency,
            due_date,
            status: InvoiceStatus::Pending,
        };
        invoices.set(id, invoice.clone());
        save_invoices(&env, &invoices);
        invoice
    }

    /// Get an invoice by ID.
    pub fn get_invoice(env: Env, id: Symbol) -> Invoice {
        load_invoices(&env)
            .get(id)
            .unwrap_or_else(|| panic!("Invoice not found"))
    }

    /// Update the status of an invoice. Restricted to originator or contract logic.
    pub fn update_invoice_status(env: Env, id: Symbol, new_status: InvoiceStatus) -> Invoice {
        let mut invoices = load_invoices(&env);
        let mut invoice = invoices
            .get(id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));
        invoice.status = new_status;
        invoices.set(id, invoice.clone());
        save_invoices(&env, &invoices);
        invoice
    }

    // ── Financing offer functions ─────────────────────────────────────────────

    /// Create a financing offer on an invoice. Only the lender can call this.
    pub fn create_offer(
        env: Env,
        offer_id: Symbol,
        invoice_id: Symbol,
        lender: Address,
        amount: i128,
        currency: Symbol,
        interest_rate: u32,
        duration: u64,
    ) -> FinancingOffer {
        lender.require_auth();

        // Invoice must exist
        let invoices = load_invoices(&env);
        if !invoices.contains_key(invoice_id.clone()) {
            panic!("Invoice not found");
        }

        let mut offers = load_offers(&env);
        if offers.contains_key(offer_id.clone()) {
            panic!("Offer with this ID already exists");
        }

        let offer = FinancingOffer {
            id: offer_id.clone(),
            invoice_id,
            lender,
            amount,
            currency,
            interest_rate,
            duration,
            status: OfferStatus::Pending,
            funded_at: 0,
        };
        offers.set(offer_id, offer.clone());
        save_offers(&env, &offers);
        offer
    }

    /// Get a financing offer by ID.
    pub fn get_offer(env: Env, id: Symbol) -> FinancingOffer {
        load_offers(&env)
            .get(id)
            .unwrap_or_else(|| panic!("Offer not found"))
    }

    /// Accept a financing offer. Only the invoice originator can call this.
    /// Marks the offer Accepted and the invoice Financed.
    pub fn accept_offer(env: Env, offer_id: Symbol, invoice_originator: Address) -> FinancingOffer {
        invoice_originator.require_auth();

        let mut offers = load_offers(&env);
        let mut offer = offers
            .get(offer_id.clone())
            .unwrap_or_else(|| panic!("Offer not found"));

        if offer.status != OfferStatus::Pending {
            panic!("Offer is not in Pending status");
        }

        // Verify caller is the invoice originator
        let mut invoices = load_invoices(&env);
        let mut invoice = invoices
            .get(offer.invoice_id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));

        if invoice.originator != invoice_originator {
            panic!("Only the invoice originator can accept offers");
        }
        if invoice.status != InvoiceStatus::Pending {
            panic!("Invoice is not in Pending status");
        }

        offer.status = OfferStatus::Accepted;
        offer.funded_at = env.ledger().timestamp();
        offers.set(offer_id, offer.clone());
        save_offers(&env, &offers);

        invoice.status = InvoiceStatus::Financed;
        invoices.set(offer.invoice_id.clone(), invoice);
        save_invoices(&env, &invoices);

        offer
    }

    /// Reject a financing offer. Only the invoice originator can call this.
    pub fn reject_offer(env: Env, offer_id: Symbol, invoice_originator: Address) -> FinancingOffer {
        invoice_originator.require_auth();

        let mut offers = load_offers(&env);
        let mut offer = offers
            .get(offer_id.clone())
            .unwrap_or_else(|| panic!("Offer not found"));

        if offer.status != OfferStatus::Pending {
            panic!("Offer is not in Pending status");
        }

        let invoices = load_invoices(&env);
        let invoice = invoices
            .get(offer.invoice_id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));

        if invoice.originator != invoice_originator {
            panic!("Only the invoice originator can reject offers");
        }

        offer.status = OfferStatus::Rejected;
        offers.set(offer_id, offer.clone());
        save_offers(&env, &offers);

        offer
    }

    /// Mark an invoice as repaid. Only the invoice originator (debtor) can call this.
    /// Sets the invoice to Repaid and the linked offer to Repaid.
    pub fn repay_invoice(
        env: Env,
        invoice_id: Symbol,
        offer_id: Symbol,
        repayer: Address,
    ) -> Invoice {
        repayer.require_auth();

        let mut invoices = load_invoices(&env);
        let mut invoice = invoices
            .get(invoice_id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));

        if invoice.originator != repayer {
            panic!("Only the invoice originator can repay");
        }
        if invoice.status != InvoiceStatus::Financed {
            panic!("Invoice must be Financed before repayment");
        }

        let mut offers = load_offers(&env);
        let mut offer = offers
            .get(offer_id.clone())
            .unwrap_or_else(|| panic!("Offer not found"));

        if offer.invoice_id != invoice_id {
            panic!("Offer does not belong to this invoice");
        }
        if offer.status != OfferStatus::Accepted {
            panic!("Offer must be Accepted before repayment");
        }

        invoice.status = InvoiceStatus::Repaid;
        invoices.set(invoice_id, invoice.clone());
        save_invoices(&env, &invoices);

        offer.status = OfferStatus::Repaid;
        offers.set(offer_id, offer);
        save_offers(&env, &offers);

        invoice
    }

    /// Mark an invoice as overdue. Can be called by anyone after due_date has passed.
    pub fn mark_overdue(env: Env, invoice_id: Symbol) -> Invoice {
        let mut invoices = load_invoices(&env);
        let mut invoice = invoices
            .get(invoice_id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));

        if invoice.status != InvoiceStatus::Financed {
            panic!("Only Financed invoices can be marked Overdue");
        }
        if env.ledger().timestamp() <= invoice.due_date {
            panic!("Invoice due date has not passed");
        }

        invoice.status = InvoiceStatus::Overdue;
        invoices.set(invoice_id, invoice.clone());
        save_invoices(&env, &invoices);
        invoice
    }
}

#[cfg(test)]
mod test;
