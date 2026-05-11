use soroban_sdk::{Address, Env};

pub const ADMIN_KEY: &str = "admin";
pub const INVOICE_COUNTER: &str = "invoice_counter";
pub const FINANCING_COUNTER: &str = "financing_counter";

pub fn set_admin(e: &Env, admin: &Address) {
    e.storage().persistent().set(&ADMIN_KEY, admin);
}

pub fn get_admin(e: &Env) -> Address {
    e.storage().persistent().get(&ADMIN_KEY).unwrap()
}

pub fn has_admin(e: &Env) -> bool {
    e.storage().persistent().has(&ADMIN_KEY)
}

pub fn increment_invoice_counter(e: &Env) -> u32 {
    let count = e.storage().instance().get(&INVOICE_COUNTER).unwrap_or(0);
    let new_count = count + 1;
    e.storage().instance().set(&INVOICE_COUNTER, &new_count);
    new_count
}

pub fn increment_financing_counter(e: &Env) -> u32 {
    let count = e.storage().instance().get(&FINANCING_COUNTER).unwrap_or(0);
    let new_count = count + 1;
    e.storage().instance().set(&FINANCING_COUNTER, &new_count);
    new_count
}