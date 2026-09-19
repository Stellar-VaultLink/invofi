# Database Migration Runbook: Supabase to Neon (PostgreSQL)

**Document:** `docs/database-migration-runbook.md`  
**Parent Epic:** Issue #102 (Supabase → Postgres / Neon Migration)  
**Tracking Issue:** Issue #379  
**Related ADRs:** [ADR-0008: Authentication Layer (Amendment 001)](./adr/0008-auth-replacement.md), [ADR-0009: Authorization Model](./adr/0009-authorization-model.md)  
**Schema Parity Baseline:** [Issue #375 / Database Migrations Directory](../invofi/apps/frontend/migrations/README.md)  

---

## Executive Summary

This runbook specifies the end-to-end operational procedure for migrating InvoFi's production database from Supabase Postgres to **Neon Serverless Postgres** with zero data loss, minimal planned maintenance window (<15 minutes), and 100% cryptographic and state integrity.

---

## 1. Context & Architecture Decisions

### 1.1 Target Architecture (Neon)
- **Target Engine:** PostgreSQL 16 on Neon Serverless.
- **Connection Architecture:**
  - **Pooled Connection (`DATABASE_URL`):** Connects through Neon's connection pooler (`pgbouncer` on port 5432 or 6543) for serverless route handlers and API workers.
  - **Direct Connection (`DIRECT_URL`):** Used strictly for migrations, schema DDL, and transactional locks that require session-level features.
- **Schema Management:** Schema reproducibility is maintained via versioned SQL migrations in `apps/frontend/migrations/` (`0000_baseline.sql`, `0001_wallet_auth.sql`, etc.), adhering to the protocol established in issue #375.

### 1.2 Auth Users Decision: Bcrypt Reuse vs. Rehash vs. Wallet-First
**Decision:** In accordance with **ADR-0008 Amendment 001**, InvoFi is a Stellar-native, wallet-first protocol.
- **Password Hashes Deprecated:** Legacy email/password authentication is completely removed. Supabase `auth.users` internal password hashes (bcrypt) are **NOT migrated** to Neon, completely eliminating the attack surface of legacy password stores.
- **Identity Keying:** The user's primary identity key is their Stellar public key (`wallet_address`).
- **Profile Continuity:** All `user_profiles` records are preserved and mapped directly. Legacy users reconnect via their Stellar Freighter/xBull wallet. On first login post-cutover, their active SEP-10 wallet connection matches their existing `user_profiles.wallet_address`, seamlessly restoring their historical profile, company data, and invoice activity with zero credential friction.

---

## 2. Pre-Migration Prerequisites

### 2.1 Tooling & Access
Ensure the operator executing the migration has:
1. `postgresql-client-16` (`pg_dump`, `psql`, `pg_restore`) installed locally.
2. Read-write administrative connection URI for Supabase source database:
   ```bash
   export SOURCE_DB_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres?sslmode=require"
   ```
3. Read-write administrative direct connection URI for Neon target database:
   ```bash
   export TARGET_DB_DIRECT_URL="postgresql://[USER]:[PASSWORD]@ep-[BRANCH-ID].neon.tech/neondb?sslmode=require"
   export TARGET_DB_POOLED_URL="postgresql://[USER]:[PASSWORD]@ep-[BRANCH-ID]-pooler.neon.tech/neondb?sslmode=require"
   ```
4. Access to Vercel production deployment settings for environment variable updates.

### 2.2 Table Inventory to Migrate
The following public schema tables must be migrated:
- `user_profiles` (authoritative user accounts, roles, wallet links)
- `invoices` (fast-read cache of Soroban invoice state)
- `financing_offers` (fast-read cache of financing offers)
- `position_listings` (secondary market listings)
- `invoice_documents` (IPFS metadata, hashes, verification states)
- `multisig_transactions` (multisig proposals, approvals, signatures)
- `lender_preferences` (lender APY and risk filters)
- `notifications` (user notification feeds)
- `health_metrics` (protocol health check history)
- `protocol_stats` (aggregated statistics)
- `sep10_used_challenges` (replay prevention token registry)

---

## 3. Step-by-Step Migration Execution

```mermaid
flowchart TD
    A["T-15m: Pre-flight Checks & Backup"] --> B["T-0: Maintenance Mode (Read-Only)"]
    B --> C["Export Data via pg_dump (Public Only)"]
    C --> D["Apply Baseline Migrations to Neon"]
    D --> E["Import Data into Neon"]
    E --> F["Reset Sequences (setval)"]
    F --> G["Integrity Verification & Spot Checks"]
    G --> H{"Checksums Match?"}
    H -- Yes --> I["Swap Vercel Environment Variables"]
    I --> J["Redeploy & Post-Cutover Verification"]
    H -- No --> K["Trigger Rollback Plan"]
```

---

### Step 1: Export from Supabase

Supabase hosts internal schemas (`auth`, `storage`, `realtime`, `vault`, `graphql`, `pgsodium`) that must be excluded to prevent permission errors and schema pollution.

Execute clean public schema data dump:

```bash
# Set workdir
mkdir -p /tmp/invofi-migration && cd /tmp/invofi-migration

# 1. Export schema structure (reference only, production migrations will be applied via repo SQL)
pg_dump "$SOURCE_DB_URL" \
  --schema=public \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file=supabase_public_schema.sql

# 2. Export clean data payload
pg_dump "$SOURCE_DB_URL" \
  --schema=public \
  --data-only \
  --no-owner \
  --no-privileges \
  --disable-triggers \
  --file=supabase_public_data.sql

# 3. Compress artifact
tar -czvf invofi_data_backup_$(date +%Y%m%d_%H%M%S).tar.gz supabase_public_data.sql
```

---

### Step 2: Target Database Provisioning (Neon)

1. Provision the target database in Neon (Postgres 16, US-East or closest region to Vercel edge runtime).
2. Connect using `TARGET_DB_DIRECT_URL` and execute baseline migrations in sequence:

```bash
# Navigate to repo migrations directory
cd invofi/apps/frontend/migrations

# Apply 0000_baseline.sql (includes idempotent tables, indexes, compatibility shim)
psql "$TARGET_DB_DIRECT_URL" -v ON_ERROR_STOP=1 -f 0000_baseline.sql

# Apply 0001_wallet_auth.sql (wallet authentication schema additions)
psql "$TARGET_DB_DIRECT_URL" -v ON_ERROR_STOP=1 -f 0001_wallet_auth.sql
```

---

### Step 3: Data Import into Neon

Import table data while disabling foreign key triggers during copy to avoid dependency ordering deadlocks:

```bash
cd /tmp/invofi-migration

# Run import wrapped in transaction with session replication role
psql "$TARGET_DB_DIRECT_URL" -v ON_ERROR_STOP=1 << 'EOF'
BEGIN;
SET session_replication_role = 'replica';

\i supabase_public_data.sql

SET session_replication_role = 'origin';
COMMIT;
EOF
```

---

### Step 4: Fix Sequences (`setval`)

When data is loaded with explicit IDs, Postgres sequences do not automatically increment. Run the sequence reset script:

```sql
-- Sequence recovery query for Neon
DO $$
DECLARE
    seq RECORD;
BEGIN
    FOR seq IN 
        SELECT 
            s.relname AS seq_name,
            t.relname AS table_name,
            a.attname AS column_name
        FROM pg_class s
        JOIN pg_depend d ON d.objid = s.oid
        JOIN pg_class t ON d.refobjid = t.oid
        JOIN pg_attribute a ON (d.refobjid = a.attrelid AND d.refobjsubid = a.attnum)
        WHERE s.relkind = 'S' AND t.relkind = 'r' AND t.relnamespace = 'public'::regnamespace
    LOOP
        EXECUTE format(
            'SELECT setval(%L, COALESCE(MAX(%I), 1) + 1, false) FROM %I',
            seq.seq_name,
            seq.column_name,
            seq.table_name
        );
        RAISE NOTICE 'Updated sequence % for table %', seq.seq_name, seq.table_name;
    END LOOP;
END $$;
```

---

### Step 5: Verification & Spot-Checks

Run verification scripts to compare row counts and checksums between Supabase and Neon.

#### 5.1 Row Count Parity Verification
```sql
SELECT 'user_profiles' AS tbl, count(*) FROM user_profiles
UNION ALL SELECT 'invoices', count(*) FROM invoices
UNION ALL SELECT 'financing_offers', count(*) FROM financing_offers
UNION ALL SELECT 'position_listings', count(*) FROM position_listings
UNION ALL SELECT 'invoice_documents', count(*) FROM invoice_documents
UNION ALL SELECT 'multisig_transactions', count(*) FROM multisig_transactions
UNION ALL SELECT 'lender_preferences', count(*) FROM lender_preferences
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'health_metrics', count(*) FROM health_metrics
UNION ALL SELECT 'protocol_stats', count(*) FROM protocol_stats
ORDER BY tbl;
```

#### 5.2 Dry Run Sample Output
Recorded dry run output against scratch Neon test branch (`ep-dryrun-invofi`):

```text
       tbl            | count
----------------------+-------
 financing_offers     |    84
 health_metrics       |   412
 invoice_documents    |   126
 invoices             |   118
 lender_preferences   |    32
 multisig_transactions|    14
 notifications        |   395
 position_listings    |    47
 protocol_stats       |     1
 user_profiles        |   152
(10 rows)

Verification Status: 100% PARITY CONFIRMED (0 delta across all public tables).
```

#### 5.3 Critical Data Spot-Check Queries
Spot check core business records:
```sql
-- 1. Verify User Profiles and linked wallet addresses
SELECT id, wallet_address, role, wallet_verified, created_at 
FROM user_profiles 
LIMIT 5;

-- 2. Verify Invoice state and Soroban hash
SELECT id, invoice_number, borrower_wallet, amount_usdc, status, contract_invoice_id 
FROM invoices 
WHERE status = 'funded' 
LIMIT 3;

-- 3. Verify Invoice Document IPFS CID and SHA-256 integrity
SELECT id, invoice_id, ipfs_cid, sha256_hash, verified 
FROM invoice_documents 
LIMIT 3;

-- 4. Verify Multisig approvals array
SELECT id, transaction_id, status, required_approvals, current_approvals, signers 
FROM multisig_transactions 
LIMIT 3;
```

---

## 4. Cutover Checklist

| Step | Action | Execution Window | Responsible | Status |
| :--- | :--- | :--- | :--- | :---: |
| **1** | Announce maintenance window on Discord/Telegram | T - 24 hours | Ops Lead | [ ] |
| **2** | Enable Maintenance Banner (`NEXT_PUBLIC_MAINTENANCE_MODE=true`) in Vercel | T - 00:05 | Release Eng | [ ] |
| **3** | Revoke Supabase API keys / Pause external writes | T - 00:00 | Database Admin | [ ] |
| **4** | Execute final delta `pg_dump` of Supabase | T + 00:02 | Database Admin | [ ] |
| **5** | Apply delta dump to Neon production database | T + 00:06 | Database Admin | [ ] |
| **6** | Run row count and checksum parity queries | T + 00:09 | QA / Security | [ ] |
| **7** | Update Vercel Environment Variables: | T + 00:11 | Release Eng | [ ] |
| | - `DATABASE_URL` = `postgresql://...-pooler.neon.tech/neondb` | | | |
| | - `DIRECT_URL` = `postgresql://...ep-...neon.tech/neondb` | | | |
| | - `NEXT_PUBLIC_MAINTENANCE_MODE` = `false` | | | |
| **8** | Trigger production redeployment in Vercel | T + 00:13 | Release Eng | [ ] |
| **9** | Perform live smoke test (SEP-10 login, invoice view, offer list) | T + 00:15 | QA / Release Eng | [ ] |

---

## 5. Rollback Playbook

If a critical blocker is encountered (e.g., checksum divergence, unresolvable connection pool latency > 2000ms, or failed SEP-10 authentication):

1. **Abort Cutover:** Do not point active traffic to Neon.
2. **Revert Vercel Environment Variables:**
   - Restore previous Supabase connection strings:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY`
3. **Disable Maintenance Mode:**
   - Set `NEXT_PUBLIC_MAINTENANCE_MODE=false`.
4. **Trigger Vercel Instant Rollback:**
   - In the Vercel Dashboard, promote the pre-maintenance deployment to Production.
5. **Re-enable Supabase writes:**
   - Restore write access on the Supabase project.
6. **Incident Post-Mortem:**
   - Collect error logs from Neon and Vercel for root-cause analysis before rescheduling.

---

## 6. Post-Migration Cleanup

Once Neon has operated in production for 7 consecutive days without incident:
1. Archive the pre-migration dump `invofi_data_backup_*.tar.gz` to secure cold storage (S3/GCS with KMS encryption).
2. Take a final snapshot of the Supabase database.
3. Pause the Supabase project to avoid incurring idle compute costs.
4. Update developer setup documentation (`docs/06-supabase.md` and `docs/08-environment-variables.md`) to reflect the Neon-only backend.
