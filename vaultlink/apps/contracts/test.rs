#![cfg(test)]
extern crate std;

use super::{Invoice, InvoiceRegistryContract, InvoiceRegistryContractClient, InvoiceStatus};
use soroban_sdk::{Env, Address, Symbol, symbol_short};

#[test]
fn test_register_and_get_invoice() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, InvoiceRegistryContract);
    let client = InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::random(&env);
    let invoice_id = symbol_short!("inv001");
    let amount = 1000_0000000; // 10 units with 7 decimals
    let currency = symbol_short!("USDC");
    let due_date = 1735689600; // Jan 1, 2025

    let registered_invoice = client.register_invoice(
        &invoice_id,
        &originator,
        &amount,
        &currency,
        &due_date,
    );

    assert_eq!(registered_invoice.id, invoice_id);
    assert_eq!(registered_invoice.originator, originator);
    assert_eq!(registered_invoice.amount, amount);
    assert_eq!(registered_invoice.currency, currency);
    assert_eq!(registered_invoice.due_date, due_date);
    assert_eq!(registered_invoice.status, InvoiceStatus::Pending);

    let fetched_invoice = client.get_invoice(&invoice_id);
    assert_eq!(fetched_invoice, registered_invoice);
}

#[test]
#[should_panic(expected = "Invoice not found")]
fn test_get_non_existent_invoice() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, InvoiceRegistryContract);
    let client = InvoiceRegistryContractClient::new(&env, &contract_id);

    client.get_invoice(&symbol_short!("nonexist"));
}