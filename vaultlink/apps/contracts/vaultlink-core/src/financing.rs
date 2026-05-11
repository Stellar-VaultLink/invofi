use soroban_sdk::{Address, Env, contracttype};
use crate::storage;

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum OfferStatus {
    Pending = 0,
    Accepted = 1,
    Rejected = 2,
    Expired = 3,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct FinancingOffer {
    pub id: u32,
    pub invoice_id: u32,
    pub lender: Address,
    pub amount: i128,
    pub interest_rate: i128,
    pub duration: u64,
    pub status: OfferStatus,
}

pub const OFFER_KEY: &str = "offer";

pub fn create_offer(
    e: &Env,
    invoice_id: u32,
    lender: Address,
    amount: i128,
    interest_rate: i128,
    duration: u64,
) -> u32 {
    lender.require_auth();

    let id = storage::increment_financing_counter(e);

    let offer = FinancingOffer {
        id,
        invoice_id,
        lender,
        amount,
        interest_rate,
        duration,
        status: OfferStatus::Pending,
    };

    let key = (OFFER_KEY, id);
    e.storage().persistent().set(&key, &offer);

    id
}

pub fn get_offer(e: &Env, id: u32) -> Option<FinancingOffer> {
    let key = (OFFER_KEY, id);
    e.storage().persistent().get(&key)
}

pub fn accept_offer(e: &Env, id: u32) {
    let mut offer = get_offer(e, id).unwrap();
    offer.status = OfferStatus::Accepted;
    let key = (OFFER_KEY, id);
    e.storage().persistent().set(&key, &offer);
}

pub fn reject_offer(e: &Env, id: u32) {
    let mut offer = get_offer(e, id).unwrap();
    offer.status = OfferStatus::Rejected;
    let key = (OFFER_KEY, id);
    e.storage().persistent().set(&key, &offer);
}