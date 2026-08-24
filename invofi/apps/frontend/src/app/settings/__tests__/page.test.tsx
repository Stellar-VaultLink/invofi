import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentType } from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockRouterPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

const mockSignOut = vi.fn();
vi.mock('@/utils/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}));

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// constants.ts reads process.env at module scope, so the page and its
// constants must be re-imported after each env change (vi.resetModules).
async function renderSettingsPage() {
  vi.resetModules();
  const { default: SettingsPage } = await import('../page');
  const Page = SettingsPage as ComponentType;
  return render(<Page />);
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('SettingsPage — Network & Contracts panel (issue #163)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NEXT_PUBLIC_RPC_URL;
    delete process.env.NEXT_PUBLIC_HORIZON_URL;
    delete process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_FINANCING_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID;
    delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    delete process.env.NEXT_PUBLIC_CONTRACT_ID;
  });

  it('renders the settings page with Profile, Network & Contracts and Account cards', async () => {
    await renderSettingsPage();
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByText('Network & Contracts')).toBeInTheDocument();
    expect(screen.getByText('Profile')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('shows the network, RPC and Horizon endpoints', async () => {
    await renderSettingsPage();

    // Defaults from constants.ts: testnet network, default RPC/Horizon URLs
    expect(screen.getByText('Stellar Network')).toBeInTheDocument();
    expect(screen.getByText('testnet')).toBeInTheDocument();
    expect(screen.getByText('RPC URL')).toBeInTheDocument();
    expect(screen.getByText('https://soroban-testnet.stellar.org')).toBeInTheDocument();
    expect(screen.getByText('Horizon URL')).toBeInTheDocument();
    expect(screen.getByText('https://horizon-testnet.stellar.org')).toBeInTheDocument();
  });

  it('renders one contract row per contract and exposes explorer + copy actions', async () => {
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'CA-REGISTRY-FOO';
    process.env.NEXT_PUBLIC_FINANCING_CONTRACT_ID = 'CA-FINANCING-BAR';
    process.env.NEXT_PUBLIC_REPAYMENT_CONTRACT_ID = 'CA-REPAYMENT-BAZ';

    await renderSettingsPage();

    expect(screen.getByText('Registry')).toBeInTheDocument();
    expect(screen.getByText('Financing')).toBeInTheDocument();
    expect(screen.getByText('Repayment')).toBeInTheDocument();

    expect(screen.getByText('CA-REGISTRY-FOO')).toBeInTheDocument();
    expect(screen.getByText('CA-FINANCING-BAR')).toBeInTheDocument();
    expect(screen.getByText('CA-REPAYMENT-BAZ')).toBeInTheDocument();

    // One Explorer link per contract, network-aware
    const links = screen.getAllByRole('link', { name: /open .* contract/i });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute('href', 'https://stellar.expert/explorer/testnet/contract/CA-REGISTRY-FOO');
    expect(links[1]).toHaveAttribute('href', 'https://stellar.expert/explorer/testnet/contract/CA-FINANCING-BAR');
    expect(links[2]).toHaveAttribute('href', 'https://stellar.expert/explorer/testnet/contract/CA-REPAYMENT-BAZ');

    // One copy button per contract
    expect(screen.getAllByRole('button', { name: /copy .* contract id/i })).toHaveLength(3);
  });

  it('copies the contract ID to the clipboard and shows a Copied state', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'CA-COPY-ME';

    await renderSettingsPage();

    const copyButton = screen.getByRole('button', { name: 'Copy Registry contract ID' });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('CA-COPY-ME');
    });
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('shows a "not configured" warning for missing contract IDs', async () => {
    // No contract env vars set → all three rows fall back to the empty legacy contract id
    await renderSettingsPage();

    expect(screen.getAllByText('— not configured')).toHaveLength(3);
  });

  it('falls back to the legacy contract id when 3-contract vars are unset', async () => {
    process.env.NEXT_PUBLIC_CONTRACT_ID = 'CA-LEGACY-ONLY';

    await renderSettingsPage();

    // Legacy deployment routes all three contracts to one id
    expect(screen.getAllByText('CA-LEGACY-ONLY')).toHaveLength(3);
    expect(screen.queryByText('— not configured')).not.toBeInTheDocument();
  });

  it('uses the mainnet explorer base when the network is mainnet', async () => {
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = 'mainnet';
    process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ID = 'CA-MAINNET';

    await renderSettingsPage();

    const link = screen.getByRole('link', { name: /open registry contract/i });
    expect(link).toHaveAttribute('href', 'https://stellar.expert/explorer/public/contract/CA-MAINNET');
  });

  it('calls supabase signOut and navigates home on sign out', async () => {
    mockSignOut.mockResolvedValue(undefined);
    await renderSettingsPage();

    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith('/');
    });
  });
});