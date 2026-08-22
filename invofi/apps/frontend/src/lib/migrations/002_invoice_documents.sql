-- Migration: invoice_documents table
-- Run this in your Supabase SQL Editor to enable the invoice document upload
-- and verification workflow (issue #222). Originators attach PDF/image proof
-- files; lenders verify them before offering financing.
--
-- The document bytes live on IPFS (via Pinata); this table stores the content
-- address (CID) plus a SHA-256 hash of the file for tamper detection.

create table if not exists invoice_documents (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    text not null references invoices(id) on delete cascade,
  uploader_id   uuid not null references auth.users(id),
  file_name     text not null,
  mime_type     text not null
    check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  file_size     integer not null
    check (file_size > 0 and file_size <= 10485760), -- max 10 MB
  ipfs_cid      text not null,
  document_hash text not null,                       -- SHA-256 hex of the file
  status        text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  verification_comment text,
  verified_by   uuid references auth.users(id),
  verified_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- RLS: only invoice parties can read documents, the originator can attach
-- them, and only a lender with an offer on the invoice can verify them.
alter table invoice_documents enable row level security;

-- Anyone party to the invoice — the uploader/originator, or a lender with an
-- offer on the invoice — can read documents.
create policy "documents_select" on invoice_documents
  for select using (
    auth.uid() = uploader_id
    or exists (
      select 1 from invoices i
      where i.id = invoice_documents.invoice_id
        and i.originator_id = auth.uid()
    )
    or exists (
      select 1 from financing_offers f
      where f.invoice_id = invoice_documents.invoice_id
        and f.lender_id = auth.uid()
    )
  );

-- Only the invoice originator can attach documents.
create policy "documents_insert" on invoice_documents
  for insert with check (
    exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.originator_id = auth.uid()
    )
  );

-- Only a lender with an offer on the invoice can update documents (verify /
-- reject). A trigger below limits the change to the verification columns so a
-- lender cannot rewrite the stored file name, CID, or hash.
create policy "documents_verify" on invoice_documents
  for update using (
    exists (
      select 1 from financing_offers f
      where f.invoice_id = invoice_documents.invoice_id
        and f.lender_id = auth.uid()
    )
  );

-- Indexes
create index invoice_documents_invoice_id_idx on invoice_documents (invoice_id);
create index invoice_documents_uploader_id_idx on invoice_documents (uploader_id);
create index invoice_documents_status_idx on invoice_documents (status);

-- Verification guard: only the verification fields may change after upload,
-- and verified_by / verified_at are always stamped from the caller's session.
create or replace function enforce_document_verification_update()
returns trigger language plpgsql as $$
begin
  if new.status not in ('pending', 'verified', 'rejected') then
    raise exception 'invalid document status: %', new.status;
  end if;

  if new.status = 'pending' then
    new.verified_by = null;
    new.verified_at = null;
  else
    new.verified_by = auth.uid();
    new.verified_at = now();
  end if;

  if new.invoice_id <> old.invoice_id
    or new.uploader_id <> old.uploader_id
    or new.file_name <> old.file_name
    or new.mime_type <> old.mime_type
    or new.file_size <> old.file_size
    or new.ipfs_cid <> old.ipfs_cid
    or new.document_hash <> old.document_hash
    or new.created_at <> old.created_at
  then
    raise exception 'only the verification fields (status, verification_comment, verified_by, verified_at) may be updated';
  end if;

  return new;
end;
$$;

create trigger invoice_documents_verify_trigger
  before update on invoice_documents
  for each row execute function enforce_document_verification_update();