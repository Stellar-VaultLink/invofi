import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimSep10ChallengeHash } from './sep10-replay-guard';

/** Minimal stand-in for the `admin.from(table).insert(row)` chain this module uses. */
function mockAdmin(insertResult: { error: { code?: string; message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { admin: { from } as unknown as SupabaseClient, insert, from };
}

describe('claimSep10ChallengeHash', () => {
  it('returns true and inserts into sep10_used_challenges on first use', async () => {
    const { admin, insert, from } = mockAdmin({ error: null });

    const result = await claimSep10ChallengeHash(admin, 'abc123');

    expect(result).toBe(true);
    expect(from).toHaveBeenCalledWith('sep10_used_challenges');
    expect(insert).toHaveBeenCalledWith({ tx_hash: 'abc123' });
  });

  it('returns false on a unique-constraint violation (replay)', async () => {
    const { admin } = mockAdmin({ error: { code: '23505', message: 'duplicate key value' } });

    const result = await claimSep10ChallengeHash(admin, 'abc123');

    expect(result).toBe(false);
  });

  it('throws on any other database error (fail closed)', async () => {
    const { admin } = mockAdmin({ error: { code: '08006', message: 'connection failure' } });

    await expect(claimSep10ChallengeHash(admin, 'abc123')).rejects.toThrow(
      /Failed to record SEP-10 challenge usage/,
    );
  });

  it('throws on an error with no code', async () => {
    const { admin } = mockAdmin({ error: { message: 'unexpected' } });

    await expect(claimSep10ChallengeHash(admin, 'abc123')).rejects.toThrow(
      /Failed to record SEP-10 challenge usage/,
    );
  });
});
