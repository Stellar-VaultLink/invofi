/**
 * Offline demo-mode data + auth layer (#177).
 *
 * When `NEXT_PUBLIC_USE_MOCK=1` the frontend must run with no Supabase project
 * and no Stellar testnet access. This module provides:
 *
 *   1. Deterministic fixtures mirroring the Supabase tables the UI reads
 *      (invoices, financing_offers, user_profiles, position_listings,
 *      lender_preferences, protocol_stats) plus a mock authenticated user and
 *      a mock wallet balance.
 *   2. `createMockSupabaseClient()` — a minimal, in-memory implementation of
 *      the small slice of the Supabase JS API this app uses (`.auth` +
 *      `.from().select/eq/in/ilike/order/single/maybeSingle/insert/update/
 *      upsert/delete`). It is returned by `createClient()` in mock mode so the
 *      existing hooks/pages keep working unchanged.
 *
 * This is for UI development only — there is deliberately no crypto, no
 * signing, and no persistence beyond the in-memory store.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Currency, FinancingOffer, Invoice, InvoiceStatus, OfferStatus } from '@/types';
import type { UserProfile } from '@/types';
import type { PositionListing } from '@/types';

// Deterministic identities are owned by the SDK's MockClient so the two mock
// layers agree on ids/addresses without duplication.
import {
  MOCK_WALLET_ADDRESS,
  MOCK_BUSINESS_A,
  MOCK_BUSINESS_B,
  MOCK_BUSINESS_C,
  MOCK_LENDER_B,
  MOCK_POSITION_TOKEN_ID,
} from '@invofi/sdk';

export { MOCK_WALLET_ADDRESS, MOCK_POSITION_TOKEN_ID };

/** Supabase user id the mock session reports. */
export const MOCK_USER_ID = 'mock-user-demo';

/** A small-but-plausible XLM balance the mock wallet reports (in XLM). */
export const MOCK_XLM_BALANCE = '12500.0';

const BASE = 10_000_000n;
const xlm = (n: number): bigint => BigInt(n) * BASE;
const days = (nowSecs: number, n: number): number => nowSecs + n * 86_400;
const iso = (nowSecs: number, daysAgo: number): string =>
  new Date((nowSecs - daysAgo * 86_400) * 1000).toISOString();

// ── Mock user (Supabase `User`-shaped) ───────────────────────────────────────

export const MOCK_USER = {
  id: MOCK_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@invofi.mock',
  phone: '',
  email_confirmed_at: new Date().toISOString(),
  confirmed_at: new Date().toISOString(),
  last_sign_in_at: new Date().toISOString(),
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {
    display_name: 'Demo Lender',
    role: 'lender',
    wallet_address: MOCK_WALLET_ADDRESS,
  },
  identities: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  is_anonymous: false,
};

// ── Fixture builders (relative to a per-session `now` anchor) ────────────────

interface MockInvoiceRow extends Invoice {
  originator_id: string | null;
  created_at: string;
}

interface MockOfferRow extends FinancingOffer {
  lender_id: string | null;
  created_at: string;
}

function seedInvoices(nowSecs: number): MockInvoiceRow[] {
  const invoice = (
    id: string,
    originator: string,
    amount: bigint,
    currency: Currency,
    dueDate: number,
    status: InvoiceStatus,
    createdDaysAgo: number,
  ): MockInvoiceRow => ({
    id,
    originator,
    originator_id: null, // external businesses — the demo user is a lender
    amount,
    currency,
    due_date: dueDate,
    status,
    created_at: iso(nowSecs, createdDaysAgo),
  });

  return [
    // Pending — marketplace inventory
    invoice('inv_mock_p001', MOCK_BUSINESS_A, xlm(10_000), 'XLM', days(nowSecs, 30), 'Pending', 6),
    invoice('inv_mock_p002', MOCK_BUSINESS_B, xlm(25_000), 'XLM', days(nowSecs, 45), 'Pending', 5),
    invoice('inv_mock_p003', MOCK_BUSINESS_A, xlm(5_000), 'USDC', days(nowSecs, 20), 'Pending', 4),
    invoice('inv_mock_p004', MOCK_BUSINESS_B, xlm(75_000), 'XLM', days(nowSecs, 60), 'Pending', 3),
    invoice('inv_mock_p005', MOCK_BUSINESS_C, xlm(120_000), 'USDC', days(nowSecs, 90), 'Pending', 2),
    // Financed
    invoice('inv_mock_f001', MOCK_BUSINESS_A, xlm(40_000), 'XLM', days(nowSecs, 15), 'Financed', 14),
    invoice('inv_mock_f002', MOCK_BUSINESS_B, xlm(18_000), 'USDC', days(nowSecs, 10), 'Financed', 12),
    // Repaid
    invoice('inv_mock_r001', MOCK_BUSINESS_A, xlm(8_000), 'XLM', days(nowSecs, -5), 'Repaid', 45),
    invoice('inv_mock_r002', MOCK_BUSINESS_B, xlm(12_000), 'USDC', days(nowSecs, -20), 'Repaid', 40),
    // Overdue
    invoice('inv_mock_o001', MOCK_BUSINESS_A, xlm(15_000), 'XLM', days(nowSecs, -3), 'Overdue', 30),
    // Cancelled
    invoice('inv_mock_c001', MOCK_BUSINESS_B, xlm(6_000), 'XLM', days(nowSecs, 14), 'Cancelled', 18),
    // Disputed
    invoice('inv_mock_d001', MOCK_BUSINESS_A, xlm(22_000), 'USDC', days(nowSecs, 7), 'Disputed', 9),
    // Defaulted
    invoice('inv_mock_def001', MOCK_BUSINESS_B, xlm(9_000), 'XLM', days(nowSecs, -30), 'Defaulted', 60),
  ];
}

function seedOffers(nowSecs: number): MockOfferRow[] {
  const offer = (
    id: string,
    invoiceId: string,
    lenderId: string | null,
    lender: string,
    amount: bigint,
    currency: Currency,
    interestRate: number,
    durationDays: number,
    status: OfferStatus,
    amountRepaid: bigint,
    fundedDaysAgo: number,
    createdDaysAgo: number,
  ): MockOfferRow => ({
    id,
    invoice_id: invoiceId,
    lender_id: lenderId,
    lender,
    amount,
    currency,
    interest_rate: interestRate,
    duration: durationDays * 86_400,
    amount_repaid: amountRepaid,
    status,
    funded_at: fundedDaysAgo <= 0 ? 0 : nowSecs - fundedDaysAgo * 86_400,
    created_at: iso(nowSecs, createdDaysAgo),
  });

  return [
    // The demo lender's portfolio.
    offer('off_mock_001', 'inv_mock_f001', MOCK_USER_ID, MOCK_WALLET_ADDRESS, xlm(40_000), 'XLM', 500, 30, 'Financed', xlm(10_000), 10, 14),
    offer('off_mock_002', 'inv_mock_r001', MOCK_USER_ID, MOCK_WALLET_ADDRESS, xlm(8_000), 'XLM', 450, 45, 'Repaid', xlm(8_360), 40, 45),
    offer('off_mock_003', 'inv_mock_p001', MOCK_USER_ID, MOCK_WALLET_ADDRESS, xlm(10_000), 'XLM', 500, 30, 'Pending', 0n, 0, 5),
    offer('off_mock_004', 'inv_mock_o001', MOCK_USER_ID, MOCK_WALLET_ADDRESS, xlm(15_000), 'XLM', 600, 30, 'Accepted', 0n, 35, 30),
    offer('off_mock_005', 'inv_mock_def001', MOCK_USER_ID, MOCK_WALLET_ADDRESS, xlm(9_000), 'XLM', 550, 30, 'Defaulted', 0n, 60, 60),
    // Other lenders (invoice detail + matching history).
    offer('off_mock_006', 'inv_mock_p002', 'mock-lender-b', MOCK_LENDER_B, xlm(25_000), 'XLM', 480, 30, 'Pending', 0n, 0, 4),
    offer('off_mock_007', 'inv_mock_f002', 'mock-lender-b', MOCK_LENDER_B, xlm(18_000), 'USDC', 520, 30, 'Financed', xlm(6_000), 8, 11),
    offer('off_mock_008', 'inv_mock_r002', 'mock-lender-b', MOCK_LENDER_B, xlm(12_000), 'USDC', 500, 30, 'Repaid', xlm(12_500), 35, 40),
  ];
}

function seedProfiles(nowSecs: number): UserProfile[] {
  return [
    {
      id: MOCK_USER_ID,
      email: MOCK_USER.email,
      role: 'lender',
      display_name: 'Demo Lender',
      wallet_address: MOCK_WALLET_ADDRESS,
      created_at: iso(nowSecs, 90),
    },
  ];
}

function seedListings(nowSecs: number): PositionListing[] {
  return [
    {
      id: 'listing_mock_001',
      seller: MOCK_WALLET_ADDRESS,
      seller_id: MOCK_USER_ID,
      invoice_id: 'inv_mock_f001',
      offer_id: 'off_mock_001',
      token_amount: '10000.00',
      asking_price: '10500.00',
      price_currency: 'XLM',
      status: 'Open',
      note: 'Fully financed invoice, 30-day term remaining.',
      created_at: iso(nowSecs, 2),
    },
    {
      id: 'listing_mock_002',
      seller: MOCK_LENDER_B,
      seller_id: 'mock-lender-b',
      invoice_id: 'inv_mock_f002',
      offer_id: 'off_mock_007',
      token_amount: '6000.00',
      asking_price: '6300.00',
      price_currency: 'USDC',
      status: 'Open',
      note: 'USDC position, partial repayment already received.',
      created_at: iso(nowSecs, 1),
    },
  ];
}

function seedStats(nowSecs: number): Record<string, unknown>[] {
  return [
    {
      id: 1,
      total_invoices: 13,
      total_offers: 8,
      invoices_financed: 2,
      total_volume: (250_000n * BASE).toString(),
      total_repaid: (20_000n * BASE).toString(),
      repayment_rate: 0.42,
      active_lenders: 3,
      defaulted_invoices: 1,
      insurance_pool: (50_000n * BASE).toString(),
      last_ledger: 2_147_483,
      updated_at: iso(nowSecs, 0),
    },
  ];
}

// ── In-memory store ───────────────────────────────────────────────────────────

type MockRow = Record<string, unknown>;

let tables: Record<string, MockRow[]> | null = null;

function getTables(): Record<string, MockRow[]> {
  if (tables) return tables;
  const nowSecs = Math.floor(Date.now() / 1000);
  tables = {
    invoices: seedInvoices(nowSecs) as unknown as MockRow[],
    financing_offers: seedOffers(nowSecs) as unknown as MockRow[],
    user_profiles: seedProfiles(nowSecs) as unknown as MockRow[],
    position_listings: seedListings(nowSecs) as unknown as MockRow[],
    lender_preferences: [],
    protocol_stats: seedStats(nowSecs),
  };
  return tables;
}

/** Resets the mock store to its seeded state (used by tests / dev tooling). */
export function resetMockDb(): void {
  tables = null;
}

// ── Minimal query builder ─────────────────────────────────────────────────────

const PGRST116 = {
  code: 'PGRST116',
  details: 'The result contains 0 rows',
  hint: null,
  message: 'JSON object requested, multiple (or no) rows returned',
};

type Comparator = (a: MockRow, b: MockRow) => number;

function compareValues(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'bigint' && typeof b === 'bigint') return a < b ? -1 : a > b ? 1 : 0;
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

/** Attach a joined `invoices` relation when a select requests one. */
function applyJoins(row: MockRow, selectStr: string): MockRow {
  if (!selectStr || selectStr === '*') return row;
  if (!row.invoice_id) return row;
  const out: MockRow = { ...row };
  const related = getTables().invoices.find(i => i.id === row.invoice_id);
  if (/invoices\(originator\)/.test(selectStr)) {
    out.invoices = related ? { originator: related.originator } : null;
  } else if (/invoices\(\*\)/.test(selectStr)) {
    out.invoices = related ? [related] : [];
  }
  if (/invoice:invoices\(\*\)/.test(selectStr)) {
    out.invoice = related ?? null;
  }
  return out;
}

type MockMutation =
  | { kind: 'insert'; payload: MockRow | MockRow[] }
  | { kind: 'update'; payload: MockRow }
  | { kind: 'upsert'; payload: MockRow | MockRow[]; options?: { onConflict?: string } }
  | { kind: 'delete' };

class MockQueryBuilder {
  private readonly table: string;
  private filters: ((row: MockRow) => boolean)[] = [];
  private sort: { col: string; ascending: boolean } | null = null;
  private selectStr = '*';
  private selectAfterMutation = false;
  private mutation: MockMutation | null = null;

  constructor(table: string) {
    this.table = table;
  }

  select(columns = '*'): this {
    this.selectStr = columns;
    this.selectAfterMutation = true;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push(row => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push(row => values.includes(row[column]));
    return this;
  }

  ilike(column: string, pattern: string): this {
    const re = new RegExp(`^${pattern.replace(/[%]/g, '.*')}$`, 'i');
    this.filters.push(row => typeof row[column] === 'string' && re.test(row[column] as string));
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.sort = { col: column, ascending: options?.ascending ?? true };
    return this;
  }

  insert(rows: MockRow | MockRow[]): this {
    this.mutation = { kind: 'insert', payload: rows };
    return this;
  }

  update(values: MockRow): this {
    this.mutation = { kind: 'update', payload: values };
    return this;
  }

  upsert(rows: MockRow | MockRow[], options?: { onConflict?: string }): this {
    this.mutation = { kind: 'upsert', payload: rows, options };
    return this;
  }

  delete(): this {
    this.mutation = { kind: 'delete' };
    return this;
  }

  // ── Terminal / thenable behaviour ─────────────────────────────────────────

  single(): Promise<{ data: MockRow | null; error: unknown }> {
    const rows = this.execute();
    if (rows.length === 0) return Promise.resolve({ data: null, error: PGRST116 });
    if (rows.length > 1) return Promise.resolve({ data: null, error: PGRST116 });
    return Promise.resolve({ data: this.applyJoins(rows[0]), error: null });
  }

  maybeSingle(): Promise<{ data: MockRow | null; error: null }> {
    const rows = this.execute();
    return Promise.resolve({ data: rows[0] ? this.applyJoins(rows[0]) : null, error: null });
  }

  then<TResult1 = { data: MockRow[] | null; error: null }, TResult2 = never>(
    onfulfilled?: (value: { data: MockRow[] | null; error: null }) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
  ): Promise<TResult1 | TResult2> {
    let result: { data: MockRow[] | null; error: null };
    if (this.mutation) {
      const affected = this.execute();
      // insert/update/upsert/delete without a following `.select()` → null data
      result = this.selectAfterMutation
        ? { data: affected.map(r => this.applyJoins(r)), error: null }
        : { data: null, error: null };
    } else {
      result = { data: this.execute().map(r => this.applyJoins(r)), error: null };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private applyJoins(row: MockRow): MockRow {
    return applyJoins(row, this.selectStr);
  }

  /** Applies a pending mutation once (idempotent) and returns affected rows. */
  private execute(): MockRow[] {
    if (this.mutation) {
      const affected = this.applyMutation(this.mutation);
      this.mutation = null;
      return affected;
    }
    return this.readRows();
  }

  private applyMutation(mutation: MockMutation): MockRow[] {
    const store = getTables();
    const rows = (store[this.table] ??= []);

    switch (mutation.kind) {
      case 'insert': {
        const input = (Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload]) as MockRow[];
        return input.map(row => {
          const withId = { id: row.id ?? `${this.table}_${Math.random().toString(36).slice(2, 10)}`, ...row };
          rows.push(withId);
          return withId;
        });
      }
      case 'update': {
        const matched = rows.filter(row => this.filters.every(f => f(row)));
        return matched.map(row => {
          Object.assign(row, mutation.payload);
          return row;
        });
      }
      case 'upsert': {
        const input = (Array.isArray(mutation.payload) ? mutation.payload : [mutation.payload]) as MockRow[];
        const key = mutation.options?.onConflict ?? 'id';
        return input.map(row => {
          const existing = rows.find(r => r[key] === row[key]);
          if (existing) {
            Object.assign(existing, row);
            return existing;
          }
          rows.push({ ...row });
          return row;
        });
      }
      case 'delete': {
        const matched = rows.filter(row => this.filters.every(f => f(row)));
        const matchSet = new Set(matched);
        store[this.table] = rows.filter(row => !matchSet.has(row));
        return matched;
      }
    }
  }

  private readRows(): MockRow[] {
    const store = getTables();
    let rows = (store[this.table] ?? []).filter(row => this.filters.every(f => f(row)));
    if (this.sort) {
      const { col, ascending } = this.sort;
      rows = [...rows].sort((a, b) => {
        const cmp = compareValues(a[col], b[col]);
        return ascending ? cmp : -cmp;
      });
    }
    return rows;
  }
}

// ── Mock Supabase client ──────────────────────────────────────────────────────

function mockAuth() {
  let user = { ...MOCK_USER, user_metadata: { ...MOCK_USER.user_metadata } };
  const session = { user, access_token: 'mock-access-token', expires_at: Math.floor(Date.now() / 1000) + 3600 };

  return {
    async getUser(): Promise<{ data: { user: typeof user }; error: null }> {
      return { data: { user }, error: null };
    },
    async getSession(): Promise<{ data: { session: typeof session }; error: null }> {
      return { data: { session }, error: null };
    },
    async signOut(): Promise<{ error: null }> {
      return { error: null };
    },
    async signInWithPassword(): Promise<{ data: { user: typeof user; session: typeof session }; error: null }> {
      return { data: { user, session }, error: null };
    },
    async signInAnonymously(): Promise<{ data: { user: typeof user }; error: null }> {
      return { data: { user }, error: null };
    },
    async signUp(): Promise<{ data: { user: typeof user; session: typeof session }; error: null }> {
      return { data: { user, session }, error: null };
    },
    async updateUser(attrs: { data?: Record<string, unknown> }): Promise<{ data: { user: typeof user }; error: null }> {
      if (attrs.data) user = { ...user, user_metadata: { ...user.user_metadata, ...attrs.data } };
      return { data: { user }, error: null };
    },
    onAuthStateChange(): { data: { subscription: { unsubscribe: () => void } }; error: null } {
      return { data: { subscription: { unsubscribe: () => undefined } }, error: null };
    },
  };
}

export function createMockSupabaseClient(): SupabaseClient {
  const client = {
    auth: mockAuth(),
    from: (table: string) => new MockQueryBuilder(table),
  };
  return client as unknown as SupabaseClient;
}

/** Convenience for the mock XLM balance read in `@/lib/horizon`. */
export function mockXlmBalance(): string {
  return MOCK_XLM_BALANCE;
}
