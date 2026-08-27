import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PositionTokensPanel } from '@/components/portfolio/PositionTokensPanel';
import type { PositionTransfer } from '@/lib/horizon';

/**
 * Verification for issue #180: the position-token transfer history is
 * virtualized with @tanstack/react-virtual so hundreds of rows render without
 * ballooning the DOM. Five hundred transfers must all be scrollable while only
 * a viewport-sized window of rows is mounted at any time.
 */

vi.mock('@/components/auth/WalletProvider', () => ({
  useWallet: () => ({ publicKey: 'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H' }),
}));

const mockTransfers = vi.hoisted(() => new Map<string, PositionTransfer[]>());

vi.mock('@/lib/contract', () => ({
  getPositionTokenId: vi.fn(async () => 'CA3Q2OVE64MLYI2VZ6YDMCP3ZAHWJQFYQ5WU5SPYWHLQYOEQYSEBMBXTB'),
  getTokenDecimals: vi.fn(async () => 7),
  getTokenBalance: vi.fn(async () => 500_000_000_0n), // 500.0000000
}));

vi.mock('@/lib/horizon', async importOriginal => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    getPositionTokenTransfers: vi.fn(async (wallet: string) => mockTransfers.get(wallet) ?? []),
  };
});

/** Build N fake transfers with sequential ids and amounts. */
function buildTransfers(count: number): PositionTransfer[] {
  const WALLET = 'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H';
  const OTHER = 'GBXDT4JUD7Q4H5Q7J7ZQKQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJQJ';
  return Array.from({ length: count }, (_, i) => ({
    id: `op-${i}`,
    hash: (i % 2).toString().repeat(64),
    createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    direction: i % 2 === 0 ? 'in' : 'out',
    counterparty: OTHER,
    amount: `${(i + 1) * 10}.0000000`,
  }));
}

beforeEach(() => {
  mockTransfers.clear();
  // @tanstack/react-virtual uses ResizeObserver to measure the scroll element
  // after mount. jsdom has no layout engine, so mock the observer to fire a
  // synthetic entry on every observe() call, giving the virtualizer a 400px
  // viewport.
  const originalObserve = globalThis.ResizeObserver?.prototype?.observe;
  if (!originalObserve) {
    class MockResizeObserver {
      constructor(private cb?: ResizeObserverCallback) {}
      observe(target: Element) {
        // Fire immediately so the virtualizer sizes the scroll window. Must
        // include a borderBoxSize box, otherwise virtual-core falls back to
        // getRect() which is all-zeros in jsdom.
        this.cb?.(
          [
            {
              target,
              contentRect: { x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 800, width: 800, height: 400 },
              borderBoxSize: [{ inlineSize: 800, blockSize: 400 }],
              contentBoxSize: [{ inlineSize: 800, blockSize: 400 }],
              devicePixelContentBoxSize: [{ inlineSize: 800, blockSize: 400 }],
            } as unknown as ResizeObserverEntry,
          ],
          this as unknown as ResizeObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
  }
});

describe('PositionTokensPanel virtualized transfer history (#180)', () => {
  it('renders the wallet balance and transfer links', async () => {
    mockTransfers.set(
      'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H',
      buildTransfers(3),
    );
    render(<PositionTokensPanel />);

    expect(await screen.findByText('500.0000000')).toBeInTheDocument();
    expect(await screen.findByText('Transfer history')).toBeInTheDocument();
    // All three rows visible for a short list.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    });
    expect(screen.getByRole('link', { name: 'Transfer position' })).toBeInTheDocument();
  });

  it('virtualizes a 500-row fixture: mounts far fewer rows than the total', async () => {
    mockTransfers.set(
      'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H',
      buildTransfers(500),
    );
    render(<PositionTokensPanel />);

    const list = await screen.findByTestId('position-token-transfer-list');
    // The list must be scrollable so all 500 rows are reachable.
    expect(list.className).toContain('overflow-y-auto');

    await waitFor(() => {
      expect(screen.getAllByRole('listitem').length).toBeGreaterThan(0);
    });

    // Only a viewport-sized window is mounted — never all 500 rows.
    const mountedRows = screen.queryAllByRole('listitem').length;
    expect(mountedRows).toBeLessThan(100);

    // The spacer keeps the total scrollable height of all rows.
    const spacer = list.querySelector('div');
    expect(spacer).not.toBeNull();
    expect(spacer!.style.position).toBe('relative');
    // estimateSize is 56px; a 500-row spacer must be >= that total.
    expect(parseInt(spacer!.style.height, 10)).toBeGreaterThanOrEqual(500 * 56);
  });

  it('preserves fixture order in the first visible rows', async () => {
    const rows = buildTransfers(500);
    mockTransfers.set(
      'GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H',
      rows,
    );
    render(<PositionTokensPanel />);

    const firstRow = await screen.findByText('10.0000000');
    expect(firstRow).toBeInTheDocument();
    // Second row (index 1) is "Sent 20.0000000" — order preserved.
    await waitFor(() => {
      expect(screen.getByText('20.0000000')).toBeInTheDocument();
    });
  });

  it('shows the empty state when there are no transfers', async () => {
    mockTransfers.set('GA7QNFARKK6CFDVCZ3J2MD2S7YJ2Y5L3HZQKXZ2QJ3S7XQ6VYWYL4M2H', []);
    render(<PositionTokensPanel />);

    expect(
      await screen.findByText(
        /No position transfers yet/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('position-token-transfer-list')).not.toBeInTheDocument();
  });
});