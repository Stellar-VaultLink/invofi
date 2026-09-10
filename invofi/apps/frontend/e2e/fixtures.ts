import { type Page } from '@playwright/test';
import { nativeToScVal, SorobanDataBuilder } from '@stellar/stellar-sdk';

/**
 * Shared fixtures for the InvoFi e2e smoke suite.
 *
 * The app has two external dependencies — Supabase (auth + the invoice/offer
 * mirror) and the Soroban RPC (on-chain reads). The smoke tests stub both at
 * the HTTP boundary so the suite is deterministic and needs no real Supabase
 * credentials, while still running against the live testnet contracts for the
 * account lookup the SDK performs before a simulated read.
 */

export const SUPABASE_URL = 'https://e2e.supabase.co';
export const RPC_URL = 'https://soroban-testnet.stellar.org';

/**
 * The auth storage key @supabase/ssr derives for `SUPABASE_URL`:
 * `sb-<first-hostname-label>-auth-token` → `sb-e2e-auth-token`.
 */
const AUTH_STORAGE_KEY = 'sb-e2e-auth-token';

/** A real, funded Stellar testnet account used as the fixture originator. */
export const ORIGINATOR = 'GCHVSUK5XKL44CSZ3WGI2W2OZCC7SXZMM5B34TCOQ2YNEGPNP3BLOVMT';

/**
 * Invoice status as the live Soroban contract actually serializes it — the
 * u32 discriminant, NOT the string the Supabase mirror stores. Verified
 * against testnet: `status` decodes to 0..4.
 */
export const InvoiceStatus = {
  Pending: 0,
  Financed: 1,
  Repaid: 2,
  Overdue: 3,
  Cancelled: 4,
} as const;

/** Shape of an invoice as returned by the on-chain `get_invoice` read. */
export interface OnChainInvoice {
  id: string;
  originator: string;
  /** i128 stroops */
  amount: bigint;
  currency: 'XLM' | 'USDC';
  /** u64 unix seconds */
  due_date: bigint;
  status: number;
}

/** Shape of an invoice as stored in the Supabase mirror. */
export interface MirrorInvoice {
  id: string;
  originator: string;
  /** Human-unit decimal string, e.g. "10000.00" (mirror convention). */
  amount: string;
  currency: 'XLM' | 'USDC';
  /** ISO timestamp string (mirror convention). */
  due_date: string;
  status: 'Pending' | 'Financed' | 'Overdue' | 'Repaid' | 'Cancelled' | 'Defaulted';
  created_at: string;
}

export const SMOKE_INVOICE: OnChainInvoice = {
  id: 'inv_smoke_demo',
  originator: ORIGINATOR,
  amount: 20_000_000n, // 2 XLM
  currency: 'XLM',
  due_date: 2_000_000_000n,
  status: InvoiceStatus.Pending,
};

export const SMOKE_INVOICES: MirrorInvoice[] = [
  {
    id: 'inv_smoke_market_1',
    originator: ORIGINATOR,
    amount: '10000.00',
    currency: 'XLM',
    due_date: '2027-01-01T00:00:00.000Z',
    status: 'Pending',
    created_at: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'inv_smoke_market_2',
    originator: ORIGINATOR,
    amount: '2500000.00',
    currency: 'USDC',
    due_date: '2027-02-01T00:00:00.000Z',
    status: 'Financed',
    created_at: '2026-08-02T00:00:00.000Z',
  },
];

/** Shape of a position listing as stored in the Supabase mirror (ADR-0004). */
export interface MirrorListing {
  id: string;
  seller: string;
  seller_id: string | null;
  invoice_id: string;
  offer_id: string | null;
  /** Human-unit decimal strings (mirror convention). */
  token_amount: string;
  asking_price: string;
  price_currency: 'XLM' | 'USDC';
  status: 'Open' | 'Settled' | 'Withdrawn';
  note: string | null;
  created_at: string;
}

/** Shape of a financing offer as stored in the Supabase mirror. */
export interface MirrorOffer {
  id: string;
  invoice_id: string;
  lender: string;
  lender_id: string;
  amount: string;
  currency: 'XLM' | 'USDC';
  interest_rate: number;
  duration: number;
  amount_repaid: string;
  status: 'Pending' | 'Accepted' | 'Financed' | 'Rejected' | 'Repaid' | 'Defaulted';
  funded_at: number;
  created_at: string;
}

/** A second lender's account — the counterparty on the listings board. */
export const OTHER_SELLER = 'GDNSSYSCSSJ76FER5WEEXME5G4MTCUBKDRQSKOYP36KUKVDB2VCMERS6';

/** A Supabase user the app sees for the authenticated smoke flows. */
export const SMOKE_USER = {
  id: '00000000-0000-4000-8000-0000000000e2',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'lender@e2e.test',
  email_confirmed_at: '2026-08-01T00:00:00.000Z',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { role: 'lender', display_name: 'E2E Lender' },
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

/** Two open listings published by another lender — the discovery fixtures. */
export const SMOKE_LISTINGS: MirrorListing[] = [
  {
    id: 'lst_smoke_1',
    seller: OTHER_SELLER,
    seller_id: '00000000-0000-4000-8000-00000000aaaa',
    invoice_id: 'inv_smoke_market_1',
    offer_id: 'off_smoke_1',
    token_amount: '10000.00',
    asking_price: '9500.00',
    price_currency: 'XLM',
    status: 'Open',
    note: 'Exiting early, open to offers',
    created_at: '2026-08-10T00:00:00.000Z',
  },
  {
    id: 'lst_smoke_2',
    seller: OTHER_SELLER,
    seller_id: '00000000-0000-4000-8000-00000000aaaa',
    invoice_id: 'inv_smoke_market_2',
    offer_id: 'off_smoke_2',
    token_amount: '2500000.00',
    asking_price: '2400000.00',
    price_currency: 'USDC',
    status: 'Open',
    note: null,
    created_at: '2026-08-11T00:00:00.000Z',
  },
];

/** A live position held by SMOKE_USER — the one they are allowed to list. */
export const SMOKE_POSITION_OFFER: MirrorOffer = {
  id: 'off_smoke_mine',
  invoice_id: 'inv_smoke_market_1',
  lender: ORIGINATOR,
  lender_id: SMOKE_USER.id,
  amount: '1000.00',
  currency: 'USDC',
  interest_rate: 500,
  duration: 2_592_000,
  amount_repaid: '0',
  status: 'Financed',
  funded_at: 1_770_000_000,
  created_at: '2026-08-05T00:00:00.000Z',
};

// ── Session seeding ─────────────────────────────────────────────────────────

/**
 * Encodes a Supabase session the way @supabase/ssr persists it: a cookie named
 * `<storage-key>` whose value is `base64-` + base64url(JSON.stringify(session)).
 */
function encodeSessionCookie(session: object): string {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`;
}

/**
 * Seeds a signed-in Supabase session and stubs the `/auth/v1/user` endpoint
 * `getUser()` calls, so `AuthGuard` sees a valid session without any real
 * Supabase project.
 */
export async function mockSupabaseAuth(page: Page): Promise<void> {
  const session = {
    access_token: 'e2e-dummy-access-token',
    refresh_token: 'e2e-dummy-refresh-token',
    token_type: 'bearer',
    // Far enough in the future that auth-js never attempts a refresh mid-test.
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    expires_in: 3600,
    user: SMOKE_USER,
  };

  await page.context().addCookies([
    {
      name: AUTH_STORAGE_KEY,
      value: encodeSessionCookie(session),
      url: 'http://localhost:3000',
    },
  ]);

  await page.route('**/auth/v1/user', (route) =>
    route.fulfill({ json: SMOKE_USER }),
  );
}

// ── Supabase REST mirror mocks ───────────────────────────────────────────────

/** Stubs the invoice / offer mirror reads the marketplace and detail pages use. */
export async function mockSupabaseMirror(
  page: Page,
  data: { invoices?: MirrorInvoice[]; offers?: object[]; documents?: object[] } = {},
): Promise<void> {
  await page.route('**/rest/v1/invoices**', (route) =>
    route.fulfill({ json: data.invoices ?? SMOKE_INVOICES }),
  );
  await page.route('**/rest/v1/financing_offers**', (route) =>
    route.fulfill({ json: data.offers ?? [] }),
  );
  // Invoice proof documents (issue #222) — default to none attached.
  await page.route('**/rest/v1/invoice_documents**', (route) =>
    route.fulfill({ json: data.documents ?? [] }),
  );
}

/**
 * Stubs the `position_listings` table (ADR-0004) as a tiny in-memory store:
 * GET returns the current rows, POST appends the inserted row and returns it
 * (matching `.insert().select().single()`), PATCH updates the row named by the
 * `id=eq.<id>` filter. The returned handle exposes what the app actually sent,
 * so tests can assert on the real request bodies.
 */
export interface ListingStore {
  rows: MirrorListing[];
  inserted: Record<string, unknown>[];
  updated: { id: string; body: Record<string, unknown> }[];
}

export async function mockPositionListings(
  page: Page,
  initial: MirrorListing[] = [],
): Promise<ListingStore> {
  const store: ListingStore = { rows: [...initial], inserted: [], updated: [] };

  await page.route('**/rest/v1/position_listings**', async (route) => {
    const request = route.request();
    const method = request.method();

    if (method === 'POST') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      store.inserted.push(body);
      const row = {
        id: `lst_e2e_${store.inserted.length}`,
        created_at: new Date().toISOString(),
        ...body,
      } as unknown as MirrorListing;
      store.rows = [row, ...store.rows];
      return route.fulfill({ status: 201, json: row });
    }

    if (method === 'PATCH') {
      const id = new URL(request.url()).searchParams.get('id')?.replace('eq.', '') ?? '';
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      store.updated.push({ id, body });
      store.rows = store.rows.map((r) => (r.id === id ? ({ ...r, ...body } as MirrorListing) : r));
      const row = store.rows.find((r) => r.id === id) ?? null;
      return route.fulfill({ json: row });
    }

    return route.fulfill({ json: store.rows });
  });

  return store;
}

/** Stubs the profile read the listing form uses to find the seller's wallet. */
export async function mockUserProfile(page: Page, walletAddress: string | null): Promise<void> {
  await page.route('**/rest/v1/user_profiles**', (route) =>
    route.fulfill({ json: { wallet_address: walletAddress } }),
  );
}

// ── Soroban RPC mock (on-chain invoice read) ────────────────────────────────

/** Fixture lifecycle events for SMOKE_INVOICE (event timeline, issue: on-chain activity). */
export const SMOKE_EVENTS = [
  { name: 'inv_reg', ledger: 4_999_000 },
  { name: 'off_new', ledger: 4_999_100 },
  { name: 'inv_rep', ledger: 4_999_200 },
] as const;

function smokeTxHash(index: number): string {
  return `${'f0'.repeat(30)}${String(index).padStart(4, '0')}`;
}

/**
 * Builds the ScVal for an invoice exactly as the live contract returns it
 * (verified against testnet): a map of symbol-keyed fields with amount=i128,
 * due_date=u64, status=u32.
 */
export function invoiceScVal(invoice: OnChainInvoice) {
  return nativeToScVal(
    {
      id: invoice.id,
      originator: invoice.originator,
      amount: invoice.amount,
      currency: invoice.currency,
      due_date: invoice.due_date,
      status: invoice.status,
    },
    {
      type: {
        id: ['symbol', 'symbol'],
        originator: ['symbol', 'address'],
        amount: ['symbol', 'i128'],
        currency: ['symbol', 'symbol'],
        due_date: ['symbol', 'u64'],
        status: ['symbol', 'u32'],
      },
    },
  );
}

/**
 * Stubs `simulateTransaction` responses for the Soroban RPC so `get_invoice`
 * returns `invoice` deterministically. Other RPC calls (the account lookup the
 * SDK does before a simulated read) fall through to real testnet.
 */
export async function mockInvoiceRead(page: Page, invoice: OnChainInvoice): Promise<void> {
  await page.route(`**${RPC_URL}/**`, async (route) => {
    let method: unknown;
    try {
      method = (route.request().postDataJSON() as { method?: unknown } | null)?.method;
    } catch {
      // Non-JSON RPC request — let it through to testnet.
      return route.fallback();
    }
    if (method !== 'simulateTransaction') {
      return route.fallback();
    }

    const result = {
      transactionData: new SorobanDataBuilder().build().toXDR('base64'),
      minResourceFee: '100',
      results: [{ auth: [], xdr: invoiceScVal(invoice).toXDR('base64') }],
      events: [],
      latestLedger: 5_000_000,
    };

    return route.fulfill({
      json: { jsonrpc: '2.0', id: 1, result },
    });
  });
}

/**
 * Stubs the RPC `getEvents` call the invoice-detail event timeline makes, so
 * the timeline renders deterministic fixture entries instead of scanning live
 * testnet. Non-getEvents requests fall through (to `mockInvoiceRead` or real
 * testnet).
 */
export async function mockInvoiceEvents(page: Page): Promise<void> {
  await page.route(`**${RPC_URL}/**`, async (route) => {
    let method: unknown;
    try {
      method = (route.request().postDataJSON() as { method?: unknown } | null)?.method;
    } catch {
      return route.fallback();
    }
    if (method !== 'getEvents') return route.fallback();

    const events = SMOKE_EVENTS.map((evt, i) => ({
      id: `evt-smoke-${i}`,
      type: 'contract',
      ledger: evt.ledger,
      ledgerClosedAt: `2026-08-1${i + 1}T12:00:00Z`,
      contractId: 'CAXNTWSKDVSB3GPJMU3RTSDTAIFF4A6FFRAAI35B4AE7LZLLI4VXMCF7',
      topic: [
        nativeToScVal(evt.name, { type: 'symbol' }).toXDR('base64'),
        nativeToScVal(SMOKE_INVOICE.id, { type: 'symbol' }).toXDR('base64'),
      ],
      value: nativeToScVal('').toXDR('base64'),
      inSuccessfulContractCall: true,
      txHash: smokeTxHash(i),
    }));

    return route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: 1,
        result: { events, latestLedger: 5_000_000, cursor: '' },
      },
    });
  });
}

/**
 * One-call setup for the authenticated smoke flows: a signed-in Supabase
 * session plus the mirror and (optionally) on-chain mocks.
 */
export async function authenticate(
  page: Page,
  options: { invoice?: OnChainInvoice; invoices?: MirrorInvoice[]; offers?: object[] } = {},
): Promise<void> {
  await mockSupabaseAuth(page);
  await mockSupabaseMirror(page, options);
  if (options.invoice) {
    await mockInvoiceRead(page, options.invoice);
    await mockInvoiceEvents(page);
  }
}

/**
 * Stubs the Freighter browser extension so wallet-gated UI (anything behind
 * `useWallet().publicKey`) is reachable in tests.
 *
 * `@stellar/freighter-api` v6 talks to the extension's content script over
 * `window.postMessage`: it posts `{ source: 'FREIGHTER_EXTERNAL_MSG_REQUEST',
 * messageId, type }` and resolves on a reply whose `source` is
 * `FREIGHTER_EXTERNAL_MSG_RESPONSE` and whose `messagedId` (sic — the
 * upstream field name is misspelled) echoes the request id. This init script
 * implements exactly that handshake, so the real WalletProvider →
 * StellarWalletsKit → freighter-api path runs unmodified.
 */
export async function mockFreighter(
  page: Page,
  address: string = ORIGINATOR,
): Promise<void> {
  await page.addInitScript((addr: string) => {
    const PASSPHRASE = 'Test SDF Network ; September 2015';
    window.addEventListener('message', (event: MessageEvent) => {
      const data = event.data as { source?: string; messageId?: number; type?: string } | null;
      if (event.source !== window) return;
      if (!data || data.source !== 'FREIGHTER_EXTERNAL_MSG_REQUEST') return;

      const reply = (payload: Record<string, unknown>) =>
        window.postMessage(
          {
            source: 'FREIGHTER_EXTERNAL_MSG_RESPONSE',
            messagedId: data.messageId,
            ...payload,
          },
          window.location.origin,
        );

      switch (data.type) {
        case 'REQUEST_CONNECTION_STATUS':
          return reply({ isConnected: true });
        case 'REQUEST_ALLOWED_STATUS':
        case 'SET_ALLOWED_STATUS':
          return reply({ isAllowed: true });
        case 'REQUEST_ACCESS':
        case 'REQUEST_PUBLIC_KEY':
          return reply({ publicKey: addr, address: addr });
        case 'REQUEST_USER_INFO':
          return reply({ userInfo: { publicKey: addr } });
        case 'REQUEST_NETWORK':
          return reply({ network: 'TESTNET', networkPassphrase: PASSPHRASE });
        case 'REQUEST_NETWORK_DETAILS':
          return reply({
            networkDetails: {
              network: 'TESTNET',
              networkName: 'TESTNET',
              networkUrl: 'https://horizon-testnet.stellar.org',
              networkPassphrase: PASSPHRASE,
              sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
            },
          });
        default:
          return;
      }
    });
  }, address);
}
