#!/usr/bin/env bash
# Run this once after `gh auth login` to close all resolved/out-of-scope issues.
# Usage: bash scripts/close-issues.sh

REPO="Stellar-VaultLink/invofi"

echo "Closing resolved issues..."

# ── Fixed in this release ────────────────────────────────────────────────────

gh issue close 27 --repo "$REPO" --comment \
"Fixed: Pinned \`arbitrary = \"=1.3.2\"\` in \`apps/contracts/Cargo.toml\` and added \`resolver = \"2\"\` to the workspace. The \`try_size_hint\` compilation error is resolved."

gh issue close 26 --repo "$REPO" --comment \
"Fixed: Replaced \`Address::random(&env)\` with \`Address::generate(&env)\` (soroban-sdk v22 API) and \`env.register_contract(None, ...)\` with \`env.register(..., ())\` in \`apps/contracts/test.rs\`. All tests compile and pass."

gh issue close 25 --repo "$REPO" --comment \
"Fixed: Added \`PENDING = 'pending'\` to the \`InvoiceStatus\` enum. Note: the NestJS backend has been removed as part of the InvoFi rewrite — the project now uses a Next.js frontend + Soroban contracts + Supabase."

gh issue close 21 --repo "$REPO" --comment \
"Resolved: Frontend has been built as a Next.js 14 app in \`apps/frontend/\` with:
- Freighter wallet + email/password auth (via Supabase)
- Role-based dashboard for businesses and lenders
- Invoice creation form that registers directly on-chain
- Lender marketplace to browse and make financing offers
- Portfolio page to track active investments
- Full Soroban contract integration via stellar-sdk"

gh issue close 19 --repo "$REPO" --comment \
"Resolved: Repayment logic added directly to the Soroban contract (\`apps/contracts/lib.rs\`):
- \`repay_invoice(invoice_id, offer_id, repayer)\` — marks invoice Repaid and offer Repaid
- \`mark_overdue(invoice_id)\` — marks a past-due financed invoice as Overdue
- Both include \`require_auth()\` and full state validation
- Test coverage: \`test_repay_invoice\` and \`test_repay_unfinanced_invoice_panics\` pass."

# ── Not doing — backend deleted, frontend calls contract directly ─────────────

gh issue close 24 --repo "$REPO" --comment \
"Closing: The NestJS backend has been removed. The frontend (\`apps/frontend\`) now calls Soroban contracts directly via \`stellar-sdk\` and the Freighter wallet — no backend SDK wiring needed. See \`src/lib/contract.ts\` for the implementation."

gh issue close 18 --repo "$REPO" --comment \
"Closing: No event indexer needed. The frontend reads on-chain state directly from the Soroban RPC endpoint and uses the Stellar Horizon API for transaction history. Supabase mirrors invoice/offer data for fast UI queries."

gh issue close 17 --repo "$REPO" --comment \
"Closing: Not applicable. The NestJS backend (which processed PII) has been removed. The project now uses Supabase for auth (which handles PII securely by default) and Soroban contracts for all on-chain logic."

# ── Out of scope for MVP — future features ───────────────────────────────────

gh issue close 23 --repo "$REPO" --comment \
"Closing as out-of-scope for MVP. Multi-sig treasury and financing pool security are important features for v2 after the core protocol is proven on testnet. Adding to the project backlog."

gh issue close 22 --repo "$REPO" --comment \
"Closing as out-of-scope for MVP. KYC/AML with SEP-12 support is a compliance requirement for mainnet production use, not testnet MVP. Will revisit before mainnet launch."

gh issue close 20 --repo "$REPO" --comment \
"Closing as out-of-scope for MVP. Oracle-based invoice verification is an important fraud prevention feature for v2. The MVP trusts the originator's wallet signature as the identity anchor."

gh issue close 16 --repo "$REPO" --comment \
"Closing as out-of-scope for MVP. Contract upgradeability with timelock is a governance feature for v2. The MVP contract will be redeployed if updates are needed."

echo ""
echo "All issues closed."
