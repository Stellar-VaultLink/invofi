#![no_std]

mod invoice;
mod financing;
mod storage;

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct VaultLink;

#[contractimpl]
impl VaultLink {
    pub fn initialize(e: soroban_sdk::Env) {
        storage::set_admin(&e, &e.invoker());
    }
}

mod test;
pub use invoice::*;
pub use financing::*;