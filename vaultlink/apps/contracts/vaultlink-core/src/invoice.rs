use soroban_sdk::{Address, Env, Symbol, contracttype};
use crate::storage;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum InvoiceStatus {
    Draft = 0,
    Pending = 1,
    Funded = 2,
    Repaid = 3,
    Defaulted = 4,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Invoice {
    pub id: u32,
    pub creator: Address,
    pub amount: i128,
    pub currency: Symbol,
    pub issuer: Address,
    pub recipient: Address,
    pub due_date: u64,
    pub status: InvoiceStatus,
    pub token_id: Option<u32>,
}

pub const INVOICE_KEY: &str = "invoice";

pub fn create_invoice(
    e: &Env,
    creator: Address,
    amount: i128,
    currency: Symbol,
    issuer: Address,
    recipient: Address,
    due_date: u64,
) -> u32 {
    creator.require_auth();

    let id = storage::increment_invoice_counter(e);

    let invoice = Invoice {
        id,
        creator: creator.clone(),
        amount,
        currency,
        issuer,
        recipient,
        due_date,
        status: InvoiceStatus::Draft,
        token_id: None,
    };

    let key = (INVOICE_KEY, id);
    e.storage().persistent().set(&key, &invoice);

    id
}

pub fn get_invoice(e: &Env, id: u32) -> Option<Invoice> {
    let key = (INVOICE_KEY, id);
    e.storage().persistent().get(&key)
}

pub fn update_invoice_status(e: &Env, id: u32, status: InvoiceStatus) {
    let mut invoice = get_invoice(e, id).unwrap();
    invoice.status = status;
    let key = (INVOICE_KEY, id);
    e.storage().persistent().set(&key, &invoice);
}

pub fn set_invoice_token(e: &Env, id: u32, token_id: u32) {
    let mut invoice = get_invoice(e, id).unwrap();
    invoice.token_id = Some(token_id);
    let key = (INVOICE_KEY, id);
    e.storage().persistent().set(&key, &invoice);
}