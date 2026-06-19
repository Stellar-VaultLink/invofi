#![cfg(test)]
extern crate std;

use super::{InvoiceRegistryContract, InvoiceStatus, OfferStatus};
use soroban_sdk::{symbol_short, testutils::Address as _, Address, Env};

#[test]
fn test_register_and_get_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let invoice_id = symbol_short!("inv001");
    let amount: i128 = 1_000_000_000;
    let currency = symbol_short!("USDC");
    let due_date: u64 = 1_735_689_600;

    let registered = client.register_invoice(
        &invoice_id,
        &originator,
        &amount,
        &currency,
        &due_date,
    );

    assert_eq!(registered.id, invoice_id);
    assert_eq!(registered.originator, originator);
    assert_eq!(registered.amount, amount);
    assert_eq!(registered.currency, currency);
    assert_eq!(registered.due_date, due_date);
    assert_eq!(registered.status, InvoiceStatus::Pending);

    let fetched = client.get_invoice(&invoice_id);
    assert_eq!(fetched, registered);
}

#[test]
#[should_panic(expected = "Invoice with this ID already exists")]
fn test_duplicate_invoice_id_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let invoice_id = symbol_short!("dup001");
    let amount: i128 = 500_000_000;
    let currency = symbol_short!("XLM");
    let due_date: u64 = 1_735_689_600;

    client.register_invoice(&invoice_id, &originator, &amount, &currency, &due_date);
    client.register_invoice(&invoice_id, &originator, &amount, &currency, &due_date);
}

#[test]
#[should_panic(expected = "Invoice not found")]
fn test_get_non_existent_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    client.get_invoice(&symbol_short!("nope"));
}

#[test]
fn test_update_invoice_status() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let invoice_id = symbol_short!("inv002");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &(1_735_689_600u64),
    );

    let updated = client.update_invoice_status(&invoice_id, &InvoiceStatus::Financed);
    assert_eq!(updated.status, InvoiceStatus::Financed);
}

#[test]
fn test_create_and_get_offer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let lender = Address::generate(&env);
    let invoice_id = symbol_short!("inv003");
    let offer_id = symbol_short!("off001");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(2_000_000_000i128),
        &symbol_short!("USDC"),
        &(1_735_689_600u64),
    );

    let offer = client.create_offer(
        &offer_id,
        &invoice_id,
        &lender,
        &(2_000_000_000i128),
        &symbol_short!("USDC"),
        &500u32,
        &(2_592_000u64),
    );

    assert_eq!(offer.id, offer_id);
    assert_eq!(offer.invoice_id, invoice_id);
    assert_eq!(offer.lender, lender);
    assert_eq!(offer.status, OfferStatus::Pending);
    assert_eq!(offer.funded_at, 0u64);

    let fetched = client.get_offer(&offer_id);
    assert_eq!(fetched.id, offer_id);
}

#[test]
fn test_accept_offer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let lender = Address::generate(&env);
    let invoice_id = symbol_short!("inv004");
    let offer_id = symbol_short!("off002");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &(1_735_689_600u64),
    );
    client.create_offer(
        &offer_id,
        &invoice_id,
        &lender,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &300u32,
        &(1_296_000u64),
    );

    let accepted = client.accept_offer(&offer_id, &originator);
    assert_eq!(accepted.status, OfferStatus::Accepted);

    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.status, InvoiceStatus::Financed);
}

#[test]
fn test_reject_offer() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let lender = Address::generate(&env);
    let invoice_id = symbol_short!("inv005");
    let offer_id = symbol_short!("off003");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(1_000_000_000i128),
        &symbol_short!("XLM"),
        &(1_735_689_600u64),
    );
    client.create_offer(
        &offer_id,
        &invoice_id,
        &lender,
        &(1_000_000_000i128),
        &symbol_short!("XLM"),
        &200u32,
        &(864_000u64),
    );

    let rejected = client.reject_offer(&offer_id, &originator);
    assert_eq!(rejected.status, OfferStatus::Rejected);

    // Invoice should remain Pending
    let invoice = client.get_invoice(&invoice_id);
    assert_eq!(invoice.status, InvoiceStatus::Pending);
}

#[test]
fn test_repay_invoice() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let lender = Address::generate(&env);
    let invoice_id = symbol_short!("inv006");
    let offer_id = symbol_short!("off004");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &(1_735_689_600u64),
    );
    client.create_offer(
        &offer_id,
        &invoice_id,
        &lender,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &500u32,
        &(2_592_000u64),
    );
    client.accept_offer(&offer_id, &originator);

    let repaid = client.repay_invoice(&invoice_id, &offer_id, &originator);
    assert_eq!(repaid.status, InvoiceStatus::Repaid);

    let offer = client.get_offer(&offer_id);
    assert_eq!(offer.status, OfferStatus::Repaid);
}

#[test]
#[should_panic(expected = "Invoice must be Financed before repayment")]
fn test_repay_unfinanced_invoice_panics() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(InvoiceRegistryContract, ());
    let client = super::InvoiceRegistryContractClient::new(&env, &contract_id);

    let originator = Address::generate(&env);
    let lender = Address::generate(&env);
    let invoice_id = symbol_short!("inv007");
    let offer_id = symbol_short!("off005");

    client.register_invoice(
        &invoice_id,
        &originator,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &(1_735_689_600u64),
    );
    client.create_offer(
        &offer_id,
        &invoice_id,
        &lender,
        &(1_000_000_000i128),
        &symbol_short!("USDC"),
        &500u32,
        &(2_592_000u64),
    );
    // Note: offer NOT accepted — invoice stays Pending
    client.repay_invoice(&invoice_id, &offer_id, &originator);
}
