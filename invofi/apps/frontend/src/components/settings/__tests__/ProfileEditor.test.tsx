import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/test/intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/client', () => ({
  getAuthBackend: vi.fn(() => 'authjs'),
  getWalletSessionUser: vi.fn(async () => ({
    id: 'u1',
    walletAddress: 'GWA',
    hasProfile: true,
  })),
}));

import { getAuthBackend } from '@/lib/auth/client';
import { ProfileEditor } from '../ProfileEditor';

const backendMock = vi.mocked(getAuthBackend);

// The editor's two fetches: profile read (GET /me) and save (PATCH /update).
function mockFetchSequence(meProfile: unknown, patchResponse?: { ok: boolean; body?: object }) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/api/profile/me')) {
      return new Response(JSON.stringify({ profile: meProfile }), { status: 200 });
    }
    if (url.endsWith('/api/profile/update')) {
      expect(init?.method).toBe('PATCH');
      return new Response(
        JSON.stringify(patchResponse?.body ?? { displayName: 'New Name', role: 'business' }),
        { status: patchResponse?.ok ? 200 : 400 },
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

// jsdom lacks window.location.reload; stub it so a successful save doesn't
// blow up the test (the component calls it to refresh RSC caches).
beforeEach(() => {
  vi.stubGlobal('location', { ...window.location, reload: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('ProfileEditor (issue #380 settings slice)', () => {
  it('renders the identity row, name input and role radios once loaded', async () => {
    mockFetchSequence({ username: 'ada', role: 'lender', displayName: 'Ada L' });
    render(<ProfileEditor />);

    // Username pill appears (immutable handle)
    await waitFor(() => expect(screen.getByText('ada')).toBeInTheDocument());
    // Display name input is prefetched with the current name
    const input = screen.getByLabelText('Display name') as HTMLInputElement;
    expect(input.value).toBe('Ada L');
    // Role radios reflect the loaded role
    expect(screen.getByRole('radio', { name: 'Business', checked: false })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Lender', checked: true })).toBeInTheDocument();
    // Save is disabled until something changes
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('sends a PATCH with the new role only when the role changes', async () => {
    const fetchMock = mockFetchSequence({ username: 'ada', role: 'lender', displayName: 'Ada' });
    render(<ProfileEditor />);
    // Loaded = identity pill visible. Save starts disabled (nothing dirty).
    await waitFor(() => expect(screen.getByText('ada')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: 'Business' }));
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(body).toEqual({ displayName: 'Ada', role: 'business' });
  });

  it('shows a server error and keeps the form editable on failure', async () => {
    mockFetchSequence(
      { username: 'ada', role: 'lender', displayName: 'Ada' },
      { ok: false, body: { error: 'Could not save your changes. Please try again.' } },
    );
    render(<ProfileEditor />);
    await waitFor(() => expect(screen.getByText('ada')).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'New Name' } });
    const save = screen.getByRole('button', { name: /save changes/i });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    // Still editable: the input keeps the attempted value.
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('New Name');
  });

  it('renders nothing under the legacy Supabase backend', () => {
    backendMock.mockReturnValue('supabase');
    mockFetchSequence(null);
    const { container } = render(<ProfileEditor />);
    expect(container).toBeEmptyDOMElement();
  });
});
