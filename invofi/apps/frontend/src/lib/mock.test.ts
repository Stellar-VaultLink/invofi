/**
 * Unit tests — offline mock data + auth layer (#177)
 *
 * Verifies the in-memory Supabase stand-in returns the deterministic seed data
 * through the same query-builder surface the app's hooks/pages already use.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createMockSupabaseClient, resetMockDb, MOCK_USER, MOCK_USER_ID } from './mock';

beforeEach(() => resetMockDb());

describe('mock auth', () => {
  it('returns the seeded demo user from getUser()', async () => {
    const { data } = await createMockSupabaseClient().auth.getUser();
    expect(data.user!.id).toBe(MOCK_USER_ID);
    expect(data.user!.email).toBe(MOCK_USER.email);
  });

  it('signs out without error (no-op in demo mode)', async () => {
    const { error } = await createMockSupabaseClient().auth.signOut();
    expect(error).toBeNull();
  });
});

describe('mock query builder', () => {
  it('lists pending invoices for the marketplace', async () => {
    const client = createMockSupabaseClient();
    const { data, error } = await client
      .from('invoices')
      .select('*')
      .eq('status', 'Pending')
      .order('created_at', { ascending: false });
    expect(error).toBeNull();
    expect(data).toHaveLength(5);
    expect(data!.every(row => row.status === 'Pending')).toBe(true);
  });

  it('returns the demo lender seeded portfolio offers', async () => {
    const client = createMockSupabaseClient();
    const { data } = await client
      .from('financing_offers')
      .select('*')
      .eq('lender_id', MOCK_USER_ID);
    expect(data).toHaveLength(5);
    expect(data!.every(row => row.lender_id === MOCK_USER_ID)).toBe(true);
  });

  it('fetches a single row with .single()', async () => {
    const client = createMockSupabaseClient();
    const { data, error } = await client.from('invoices').select('*').eq('id', 'inv_mock_p001').single();
    expect(error).toBeNull();
    expect(data.id).toBe('inv_mock_p001');
    expect(data.amount).toBe(10_000n * 10_000_000n);
  });

  it('returns PGRST116 from .single() when no row matches', async () => {
    const client = createMockSupabaseClient();
    const { data, error } = await client.from('invoices').select('*').eq('id', 'missing').single();
    expect(data).toBeNull();
    expect((error as { code?: string }).code).toBe('PGRST116');
  });

  it('returns null from .maybeSingle() when no row matches', async () => {
    const client = createMockSupabaseClient();
    const { data, error } = await client.from('protocol_stats').select('*').eq('id', 999).maybeSingle();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('resolves the invoices(originator) join for matching history', async () => {
    const client = createMockSupabaseClient();
    const { data } = await client
      .from('financing_offers')
      .select('status, invoices(originator)')
      .in('status', ['Repaid', 'Defaulted', 'Financed']);
    expect(data!.length).toBeGreaterThan(0);
    const first = data![0] as { invoices: { originator: string } | { originator: string }[] };
    const joined = Array.isArray(first.invoices) ? first.invoices[0] : first.invoices;
    expect(joined.originator).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('inserts and reads back a new row', async () => {
    const client = createMockSupabaseClient();
    const { data: inserted } = await client
      .from('invoices')
      .insert({ id: 'inv_new_001', originator: MOCK_USER.user_metadata.wallet_address, status: 'Pending' })
      .select()
      .single();
    expect(inserted.id).toBe('inv_new_001');
    const { data: fetched } = await client.from('invoices').select('*').eq('id', 'inv_new_001').single();
    expect(fetched.status).toBe('Pending');
  });

  it('updates a row in place', async () => {
    const client = createMockSupabaseClient();
    await client.from('invoices').update({ status: 'Cancelled' }).eq('id', 'inv_mock_p001');
    const { data } = await client.from('invoices').select('*').eq('id', 'inv_mock_p001').single();
    expect(data.status).toBe('Cancelled');
  });
});
