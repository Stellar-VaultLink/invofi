import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatEventDescription, ledgerToRelativeTime, ActivityFeed } from '@/components/dashboard/ActivityFeed';
import type { ProtocolEvent } from '@invofi/sdk';

// ── Pure function: formatEventDescription ───────────────────────────────────

function makeEvent(overrides: Partial<ProtocolEvent> & { type: ProtocolEvent['type'] }): ProtocolEvent {
  return {
    subjectId: 'inv-123',
    contractId: 'CC...REGISTRY',
    ledger: 5_000_000,
    txHash: 'a1b2c3d4e5f6...',
    data: {},
    ...overrides,
  } as unknown as ProtocolEvent;
}

describe('formatEventDescription', () => {
  it('formats inv_reg — Invoice Registered', () => {
    const event = makeEvent({
      type: 'inv_reg',
      data: { originator: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ123456', amount: 10_000_000n, dueDate: 1_800_000_000n },
    });
    const result = formatEventDescription(event);
    expect(result).toContain('📄');
    expect(result).toContain('Invoice Registered');
    expect(result).toContain('GABCDE…123456');
    expect(result).toContain('1.00 XLM');
  });

  it('formats inv_amt — Amount Updated', () => {
    const event = makeEvent({ type: 'inv_amt', data: { newAmount: 50_000_000n } });
    const result = formatEventDescription(event);
    expect(result).toContain('💰');
    expect(result).toContain('Amount Updated');
    expect(result).toContain('5.00 XLM');
  });

  it('formats inv_sts — Status Updated', () => {
    const event = makeEvent({ type: 'inv_sts', data: { newStatus: 'Overdue' } });
    const result = formatEventDescription(event);
    expect(result).toContain('🔄');
    expect(result).toContain('Status Updated');
    expect(result).toContain('Overdue');
  });

  it('formats inv_cxl — Invoice Cancelled', () => {
    const event = makeEvent({ type: 'inv_cxl', data: { originator: 'GAAAA...' } });
    const result = formatEventDescription(event);
    expect(result).toContain('❌');
    expect(result).toContain('Invoice Cancelled');
  });

  it('formats off_new — Offer Created', () => {
    const event = makeEvent({
      type: 'off_new',
      data: { invoiceId: 'inv-456', lender: 'GBCDEF...', amount: 25_000_000n, interestRate: 800 },
    });
    const result = formatEventDescription(event);
    expect(result).toContain('💵');
    expect(result).toContain('Offer Created');
    expect(result).toContain('2.50 XLM');
  });

  it('formats off_acc — Offer Accepted', () => {
    const event = makeEvent({
      type: 'off_acc',
      data: { invoiceId: 'inv-789', lender: 'GBCDEF...', amount: 100_000_000n },
    });
    const result = formatEventDescription(event);
    expect(result).toContain('🤝');
    expect(result).toContain('Offer Accepted');
    expect(result).toContain('10.00 XLM');
  });

  it('formats inv_rep — Invoice Repaid (fully)', () => {
    const event = makeEvent({
      type: 'inv_rep',
      data: { offerId: 'offer-1', amount: 100_000_000n, fullyRepaid: true },
    });
    const result = formatEventDescription(event);
    expect(result).toContain('💸');
    expect(result).toContain('Invoice Repaid');
    expect(result).toContain('10.00 XLM');
    expect(result).toContain('(fully)');
  });

  it('formats inv_rep — Invoice Repaid (partial)', () => {
    const event = makeEvent({
      type: 'inv_rep',
      data: { offerId: 'offer-1', amount: 50_000_000n, fullyRepaid: false },
    });
    const result = formatEventDescription(event);
    expect(result).toContain('(partial)');
  });

  it('formats inv_def — Invoice Defaulted', () => {
    const event = makeEvent({ type: 'inv_def', data: { invoiceId: 'inv-defaulted' } });
    const result = formatEventDescription(event);
    expect(result).toContain('🚫');
    expect(result).toContain('Invoice Defaulted');
  });

  it('formats pos_mint — Position Token Minted', () => {
    const event = makeEvent({ type: 'pos_mint', data: { lender: 'G...', amount: 10_000_000n } });
    const result = formatEventDescription(event);
    expect(result).toContain('🪙');
    expect(result).toContain('Position Token Minted');
  });

  it('formats pool_stk — Pool Staked', () => {
    const event = makeEvent({ type: 'pool_stk', data: { staker: 'G...', amount: 1_000_000_000n } });
    const result = formatEventDescription(event);
    expect(result).toContain('🏦');
    expect(result).toContain('Pool Staked');
    expect(result).toContain('100.00 XLM');
  });

  it('formats reputn — Reputation Recorded', () => {
    const event = makeEvent({ type: 'reputn', data: { address: 'G...', score: 850 } });
    const result = formatEventDescription(event);
    expect(result).toContain('⭐');
    expect(result).toContain('Reputation Recorded');
    expect(result).toContain('850');
  });

  it('handles unknown event type gracefully', () => {
    const event = { type: 'unknown_type', subjectId: 'x', contractId: 'x', ledger: 0, txHash: 'x', data: {} } as unknown as ProtocolEvent;
    const result = formatEventDescription(event);
    expect(result).toContain('Unknown event type');
  });
});

// ── Pure function: ledgerToRelativeTime ────────────────────────────────────

describe('ledgerToRelativeTime', () => {
  // These tests are approximate since the function uses Date.now().
  it('returns a time string (not empty)', () => {
    const result = ledgerToRelativeTime(5_000_000);
    expect(result).toBeTruthy();
    expect(typeof result).toBe('string');
  });
});

// ── Component rendering ────────────────────────────────────────────────────

// Mock the SDK modules before rendering the component.
vi.mock('@invofi/sdk', async () => {
  const actual = await vi.importActual<typeof import('@invofi/sdk')>('@invofi/sdk');
  return {
    ...actual,
    // replayEvents returns a resolved promise with the given events.
    replayEvents: vi.fn<() => Promise<ProtocolEvent[]>>().mockResolvedValue([]),
    // listenToEvents returns a no-op stop function.
    listenToEvents: vi.fn<() => () => void>().mockReturnValue(() => {}),
  };
});

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: vi.fn().mockImplementation(() => ({
        getLatestLedger: vi.fn().mockResolvedValue({ sequence: 5_000_000 }),
      })),
    },
  };
});

vi.mock('@/components/auth/WalletProvider', () => ({
  useWallet: vi.fn().mockReturnValue({
    publicKey: null,
    isConnected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

// Mock next/navigation Link (used by the Card component).
vi.mock('next/link', () => ({
  default: vi.fn().mockImplementation(({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
    <a {...props}>{children}</a>
  ),
}));

describe('ActivityFeed component', () => {
  beforeAll(() => {
    // Silence the "failed to load" error output from the mocked SDK.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('renders a loading state initially', () => {
    render(<ActivityFeed />);
    // The component shows a loading spinner while fetching data.
    expect(screen.getByText(/Loading events/i)).toBeInTheDocument();
  });

  it('renders empty state when no events are returned', async () => {
    render(<ActivityFeed />);
    // Wait for the async loading to complete.
    const emptyState = await screen.findByText(/No protocol activity yet/i);
    expect(emptyState).toBeInTheDocument();
  });
});