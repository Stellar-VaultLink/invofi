-- 003 — Escrow rail (Phase 2: Trustless Work disbursement)
-- Tracks the milestone-gated escrow contract created when an accepted
-- offer's disbursement is routed through the escrow rail (ADR: escrow rail).
-- Safe to re-run: additive, idempotent.

alter table financing_offers
  add column if not exists escrow_contract_id text;

comment on column financing_offers.escrow_contract_id is
  'Trustless Work escrow contract id (C...) for milestone-gated disbursement; null when the direct-transfer rail was used.';
