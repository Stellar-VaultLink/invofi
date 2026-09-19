// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the pg layer — profile.ts must stay server-only and DB-driven.
vi.mock('./pg', () => ({
  query: vi.fn(),
}));

import { query } from './pg';
import {
  claimUsername,
  getProfileByWallet,
  updateProfileDisplay,
} from './profile';

const queryMock = vi.mocked(query);

beforeEach(() => {
  queryMock.mockReset();
});

describe('getProfileByWallet', () => {
  it('returns the profile row when one exists', async () => {
    queryMock.mockResolvedValueOnce([
      { id: 'u1', username: 'ada', role: 'lender', display_name: 'Ada' },
    ]);
    expect(await getProfileByWallet('GWALLET')).toEqual({
      id: 'u1',
      username: 'ada',
      role: 'lender',
      display_name: 'Ada',
    });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('wallet_address = $1'), ['GWALLET']);
  });

  it('returns null for an unknown wallet', async () => {
    queryMock.mockResolvedValueOnce([]);
    expect(await getProfileByWallet('GUNKNOWN')).toBeNull();
  });
});

describe('claimUsername', () => {
  it('succeeds when the UPDATE matches a profile with no username yet', async () => {
    queryMock.mockResolvedValueOnce([{ username: 'ada' }]);
    const result = await claimUsername('u1', 'ada', 'lender', null);
    expect(result).toEqual({ ok: true });
    // The guard clause is the immutability mechanism — assert it is present.
    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toContain('username is null');
    expect(params).toEqual(['u1', 'ada', 'lender', null]);
  });

  it('returns already_set when the profile already has a username', async () => {
    queryMock.mockResolvedValueOnce([]);
    const result = await claimUsername('u1', 'ada', 'lender', null);
    expect(result).toEqual({ ok: false, reason: 'already_set' });
  });

  it('maps the 23505 unique violation to reason "taken"', async () => {
    queryMock.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }));
    const result = await claimUsername('u1', 'ada', 'lender', null);
    expect(result).toEqual({ ok: false, reason: 'taken' });
  });

  it('rethrows non-uniqueness errors', async () => {
    queryMock.mockRejectedValueOnce(new Error('connection refused'));
    await expect(claimUsername('u1', 'ada', 'lender', null)).rejects.toThrow('connection refused');
  });
});

describe('updateProfileDisplay', () => {
  it('never touches the username column', async () => {
    queryMock.mockResolvedValueOnce([]);
    await updateProfileDisplay('u1', { displayName: 'New Name', role: 'business' });
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/set\s+username/i);
    expect(sql).toContain('display_name = coalesce($2, display_name)');
    expect(sql).toContain('role = coalesce($3, role)');
  });
});
