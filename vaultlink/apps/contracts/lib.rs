#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, symbol_short, Address, Env, Map, Symbol};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Invoice {
    pub id: Symbol, // Unique identifier for the invoice (e.g., hash of invoice data)
    pub originator: Address, // Stellar address of the invoice originator
    pub amount: i128, // Invoice amount (in the smallest unit of the asset)
    pub currency: Symbol, // Asset code (e.g., "USDC", "XLM")
    pub due_date: u64, // Unix timestamp for due date
    pub status: InvoiceStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum InvoiceStatus {
    Pending = 0,
    Financed = 1,
    Repaid = 2,
    Overdue = 3,
    Cancelled = 4,
}

#[contract]
pub struct InvoiceRegistryContract;

#[contractimpl]
impl InvoiceRegistryContract {
    /// Initializes the contract (if needed, though for a simple registry, it might not be strictly necessary)
    pub fn initialize(_env: Env) {
        // No specific initialization logic for this simple registry
        // In a more complex contract, you might set an admin, fee, etc.
    } // Changed `env` to `_env` to suppress the unused variable warning.

    /// Registers a new invoice on-chain.
    /// Only the originator can register their own invoice.
    pub fn register_invoice(
        env: Env,
        id: Symbol,
        originator: Address,
        amount: i128,
        currency: Symbol,
        due_date: u64,
    ) -> Invoice {
        originator.require_auth();

        let mut invoices: Map<Symbol, Invoice> = env
            .storage()
            .persistent()
            .get(&symbol_short!("invoices"))
            .unwrap_or(Map::new(&env));

        // Ensure invoice ID is unique
        if invoices.contains_key(id.clone()) {
            panic!("Invoice with this ID already exists");
        }

        let invoice = Invoice {
            id,
            originator,
            amount,
            currency,
            due_date,
            status: InvoiceStatus::Pending,
        };
        invoices.set(invoice.id.clone(), invoice.clone());
        env.storage()
            .persistent()
            .set(&symbol_short!("invoices"), &invoices);
        invoice
    }

    /// Retrieves an invoice by its ID.
    pub fn get_invoice(env: Env, id: Symbol) -> Invoice {
        let invoices: Map<Symbol, Invoice> = env
            .storage()
            .persistent()
            .get(&symbol_short!("invoices"))
            .unwrap_or(Map::new(&env));
        invoices
            .get(id)
            .unwrap_or_else(|| panic!("Invoice not found"))
    }

    /// Updates the status of an invoice.
    /// This function would typically have more robust access control (e.g., only funder or originator).
    pub fn update_invoice_status(env: Env, id: Symbol, new_status: InvoiceStatus) -> Invoice {
        let mut invoices: Map<Symbol, Invoice> = env
            .storage()
            .persistent()
            .get(&symbol_short!("invoices"))
            .unwrap_or(Map::new(&env));
        let mut invoice = invoices
            .get(id.clone())
            .unwrap_or_else(|| panic!("Invoice not found"));

        // Example: Only originator can update status to cancelled, or a funder to financed
        // For simplicity, we'll allow any authenticated call for now.
        // In a real scenario, you'd check env.invoker() against invoice.originator or a funder address.

        invoice.status = new_status;
        invoices.set(invoice.id.clone(), invoice.clone());
        env.storage()
            .persistent()
            .set(&symbol_short!("invoices"), &invoices);
        invoice
    }
}

#[cfg(test)]
mod test;
