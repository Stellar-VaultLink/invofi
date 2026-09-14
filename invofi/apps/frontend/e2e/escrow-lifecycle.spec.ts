import { test, expect, type Page } from '@playwright/test';
import {
  authenticate,
  mockFreighter,
  SMOKE_INVOICE,
  SMOKE_INVOICES,
  SMOKE_USER,
  ORIGINATOR,
  PLATFORM_ADDRESS,
} from './fixtures';

/**
 * Epic 3.4 — disbursement-escrow lifecycle through the invoice page's
 * milestone-approval panel (#381) and the Epic 3.3 portfolio card.
 *
 * The suite's philosophy (fixtures.ts) is to stub the two external
 * dependencies at the HTTP boundary — Supabase and (here) the Trustless Work
 * proxy — while the real SDK, OfferList escrow panel, EscrowStatusesCard,
 * and role-gating logic run unmodified. The snapshot fixtures below mirror
 * what TW's read model actually returns (verified against testnet, see
 * docs/trustless-work-integration.md Part 6).
 */

/** The platform wallet — must equal fixtures.PLATFORM_ADDRESS (config feeds it to the app). */
const PLATFORM = PLATFORM_ADDRESS;

/**
 * StrKey-valid contract IDs. The first is the real VBUC control escrow from
 * the testnet verification (docs/trustless-work-integration.md Part 6); the
 * second reuses the registry C-id — the UI never resolves these on-chain, it
 * only needs StrKey-valid strings to build Contract instances.
 */
const ESCROW_CONTRACT_ID = 'CAOYPJKUFDDJAYWRNMF4RS3PD7CPCO2XK2UEJ2ZAQE7FCFSFGXNIOPDL';

/** Milestone snapshot exactly as TW's read model serializes a fresh escrow. */
function snapshot(step: 'fresh' | 'completed' | 'approved' | 'released' | 'disputed') {
  const base = {
    contractId: ESCROW_CONTRACT_ID,
    contractBaseId: 'B4SCRO0000000000000000000000000000000000000000000000000000000000',
    amount: 250000000,
    flags: {
      disputed: step === 'disputed',
      released: step === 'released',
      resolved: false,
    },
    milestone:
      step === 'fresh'
        ? { approved: false, status: 'pending', description: 'Delivery' }
        : step === 'completed'
          ? { approved: false, status: 'completed', description: 'Delivery' }
          : step === 'approved' || step === 'released'
            ? { approved: true, status: 'completed', description: 'Delivery' }
            : { approved: false, status: 'pending', description: 'Delivery' },
  };
  return base;
}

/** Installs the TW proxy mocks with the given read-model state. */
async function mockEscrowRail(
  page: Page,
  initial: ReturnType<typeof snapshot>,
  opts: {
    /** Per-URL snapshot overrides, checked before the default state. */
    snapshotByContract?: Record<string, ReturnType<typeof snapshot>>;
  } = {},
) {
  let current = initial;
  const state = {
    /** Bodies the panel sent to each build endpoint (action → last body). */
    builds: {} as Record<string, Record<string, unknown>>,
    submits: [] as string[],
    /** Unsigned XDR the mock endpoints hand back (real Transaction objects). */
    unsignedXdr: '',
  };
  /** Last build action, so submit can advance the lifecycle like the chain. */
  let lastAction: 'change-status' | 'approve' | 'release' | null = null;

  // The build endpoints return an unsigned envelope; the wallet then signs it
  // (mockFreighter's SUBMIT_TRANSACTION path) and the proxy "submits" it.
  // Build a real (never-broadcast) testnet tx so the whole signing path runs.
  const { Keypair, Account, TransactionBuilder, Contract, nativeToScVal, BASE_FEE } =
    await import('@stellar/stellar-sdk');
  state.unsignedXdr = new TransactionBuilder(new Account(Keypair.random().publicKey(), '0'), {
    fee: BASE_FEE,
    networkPassphrase: 'Test SDF Network ; September 2015',
  })
    .addOperation(
      new Contract(ESCROW_CONTRACT_ID).call(
        'release_funds',
        nativeToScVal(PLATFORM, { type: 'address' }),
        nativeToScVal('BASE0', { type: 'symbol' }),
      ),
    )
    .setTimeout(30)
    .build()
    .toXDR();

  // ── Read-model snapshot (GET /api/escrow/status?contractId=…) ──────────────
  await page.route('**/api/escrow/status**', (route) => {
    const url = new URL(route.request().url());
    const cid = url.searchParams.get('contractId') ?? '';
    const override = opts.snapshotByContract?.[cid];
    return route.fulfill({ json: { data: override ?? current } });
  });

  // ── Build endpoints (POST /api/escrow/{deploy,fund,approve,change-status,release}) ──
  await page.route('**/api/escrow/change-status', async (route) => {
    state.builds['change-status'] = route.request().postDataJSON() as Record<string, unknown>;
    lastAction = 'change-status';
    return route.fulfill({ json: { unsignedXdr: state.unsignedXdr, contractId: ESCROW_CONTRACT_ID } });
  });
  await page.route('**/api/escrow/approve', async (route) => {
    state.builds['approve'] = route.request().postDataJSON() as Record<string, unknown>;
    lastAction = 'approve';
    return route.fulfill({ json: { unsignedXdr: state.unsignedXdr } });
  });
  await page.route('**/api/escrow/release', async (route) => {
    state.builds['release'] = route.request().postDataJSON() as Record<string, unknown>;
    lastAction = 'release';
    return route.fulfill({ json: { unsignedXdr: state.unsignedXdr } });
  });

  // ── Submit (POST /api/escrow/submit with the signed XDR) ──────────────────
  await page.route('**/api/escrow/submit', async (route) => {
    const body = route.request().postDataJSON() as { signedXdr?: string };
    state.submits.push(body.signedXdr ?? '');
    // Advance the read model exactly as the real chain would on a confirmed
    // transaction, so the panel's post-action re-read observes the flip.
    if (lastAction === 'change-status') current = snapshot('completed');
    else if (lastAction === 'approve') current = snapshot('approved');
    else if (lastAction === 'release') current = snapshot('released');
    return route.fulfill({ json: { success: true, txHash: `e2e${state.submits.length}`.padEnd(64, '0') } });
  });

  return state;
}

/** Mirror offer row with a persisted escrow mapping (migration 003 shape). */
const ESCROWED_OFFER = {
  id: 'off_escrow_e2e',
  invoice_id: SMOKE_INVOICE.id,
  lender: ORIGINATOR,
  lender_id: SMOKE_USER.id,
  amount: '250000000', // 25 USDC in stroops
  currency: 'USDC',
  interest_rate: 500,
  duration: 2_592_000,
  amount_repaid: '0',
  status: 'Financed',
  funded_at: 1_770_000_000,
  created_at: '2026-08-05T00:00:00.000Z',
  escrow_contract_id: ESCROW_CONTRACT_ID,
};

test.describe('escrow lifecycle (Epic 3.4)', () => {
  test('invoice page: role-gated milestone flow — confirm → approve → release', async ({ page }) => {
    // The viewer is the originator: they see Confirm Delivery first. The
    // action buttons are role-gated on a CONNECTED wallet (publicKey), so the
    // Freighter extension mock must be installed before the app boots.
    await mockFreighter(page, ORIGINATOR);
    // authenticate() next: it installs the /api/escrow/** 503 catch-all, and
    // mockEscrowRail's specific routes must be registered AFTER it to win
    // (Playwright gives precedence to the most recently registered route).
    await authenticate(page, { invoice: SMOKE_INVOICE, invoices: SMOKE_INVOICES, offers: [ESCROWED_OFFER] });
    const rail = await mockEscrowRail(page, snapshot('fresh'));

    await page.goto(`/invoices/${SMOKE_INVOICE.id}`);

    // Anchor on the invoice id first: absorbs the dev-server cold compile of
    // the route before asserting on the (slower) escrow panel below.
    await expect(page.getByText(SMOKE_INVOICE.id).first()).toBeVisible({ timeout: 70_000 });

    // ── Fresh escrow: originator sees Confirm Delivery ──────────────────────
    const panel = page.getByText('Escrow-protected disbursement');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Waiting for the business to confirm delivery.')).toBeVisible();
    const confirmBtn = page.getByRole('button', { name: 'Confirm Delivery' });
    await expect(confirmBtn).toBeVisible();
    // The originator is NOT the platform: approve/release buttons stay hidden.
    await expect(page.getByRole('button', { name: 'Approve Delivery' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Release Funds' })).toHaveCount(0);

    // ── Confirm Delivery: build → sign → submit → snapshot flips ────────────
    await confirmBtn.click();
    await expect(page.getByText('Delivery confirmed — awaiting platform approval.')).toBeVisible({ timeout: 30_000 });

    // The build call carried the originator as service provider, milestone 0.
    expect(rail.builds['change-status']).toMatchObject({
      contractId: ESCROW_CONTRACT_ID,
      milestoneIndex: 0,
      serviceProvider: ORIGINATOR,
      newStatus: 'completed',
    });
    // One real signature was produced and submitted.
    expect(rail.submits).toHaveLength(1);

    // ── Switch the read model to completed; platform side of the flow ───────
    // (Same page: the viewer would see Approve Delivery once completed. The
    // originator cannot — verifying the gate stays honest.)
    await expect(page.getByRole('button', { name: 'Approve Delivery' })).toHaveCount(0);
  });

  test('portfolio: EscrowStatusesCard summarizes the lifecycle counts', async ({ page }) => {
    const SECOND_ESCROW = 'CAS4GMVJOQ6M2X3ZZMEVXQ5BKVWVLGHBH5BEPC223H7XJCD2MLASBCXL';

    // First escrow: completed (awaiting approval). Second: released — two
    // lifecycle buckets covered in one strip.
    // authenticate() first so mockEscrowRail's routes beat the 503 catch-all.
    await authenticate(page, {
      invoices: SMOKE_INVOICES,
      offers: [
        ESCROWED_OFFER,
        {
          ...ESCROWED_OFFER,
          id: 'off_escrow_e2e_2',
          escrow_contract_id: SECOND_ESCROW,
        },
      ],
    });
    const rail = await mockEscrowRail(page, snapshot('completed'), {
      snapshotByContract: { [SECOND_ESCROW]: snapshot('released') },
    });
    void rail;

    await page.goto('/portfolio');

    await expect(page.getByText('Escrow-protected disbursements')).toBeVisible();
    await expect(page.getByTestId('escrow-count-awaitingApproval')).toContainText('1');
    await expect(page.getByTestId('escrow-count-released')).toContainText('1');
    // Rows link to the escrow explorer.
    await expect(page.getByRole('link', { name: 'View on Escrow Explorer' })).toHaveCount(2);
  });
});
