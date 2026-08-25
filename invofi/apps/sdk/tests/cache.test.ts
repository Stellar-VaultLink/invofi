/**
 * Unit tests — offline cache (IndexedDB, stale-while-revalidate) (Task 218)
 *
 * Strategy
 * --------
 * - Node's default Vitest environment has no `indexedDB` global, so we
 *   polyfill it via `fake-indexeddb/auto`, which installs `indexedDB` plus
 *   the full IDBRequest/IDBCursor/IDBKeyRange/etc. constructor set that
 *   `idb` (the wrapper `src/cache.ts` uses) needs for its instanceof checks.
 * - The cache is instance-scoped (PR #236 review): `createCache(scope)`
 *   returns a handle with its own private, memoized IndexedDB connection,
 *   keyed by `scope`. Rather than sharing one connection across tests and
 *   manually clearing its contents in `beforeEach` (the old module-global
 *   design needed this to avoid cross-test pollution), each test just uses
 *   `uniqueScope()` to get its own never-before-seen scope — a fresh,
 *   isolated database per test, no shared state, no cleanup dance.
 * - The "no indexedDB" tests delete/restore `globalThis.indexedDB`. This
 *   works without any module reset because every method re-checks
 *   `isIndexedDbAvailable()` fresh on every call, before ever touching the
 *   memoized connection promise.
 *
 * Coverage
 * --------
 * 1. Basic get/set round-trip — schema fields (key/data/timestamp/version)
 * 2. TTL / staleness semantics per data-type prefix (CACHE_TTL_MS)
 * 3. staleWhileRevalidate — immediate cached read + silent background update
 * 4. Promise.allSettled graceful degradation — fetcher rejects, stale data kept
 * 5. Prefix-based invalidate() — exact key and prefix-family deletion
 * 6. LRU eviction — least-recently-accessed entries evicted first over budget
 * 7. Environment guard — safe no-op when indexedDB is unavailable
 * 8. Scoping — createCache(scope) isolates databases per network+account
 * 9. clearCache — wipes one instance's store without affecting others
 * 10. Concurrent clients — two instances for different scopes never cross-talk
 * 11. Distinct scope strings — collision-free encoding (no shared "_" sanitizing)
 */

import { describe, it, expect, vi } from 'vitest';
// Installs indexedDB + IDBRequest/IDBCursor/IDBKeyRange/etc. as globals —
// `idb` (the wrapper `src/cache.ts` uses) needs the full constructor set,
// not just `indexedDB` itself, to build its promise-based instanceof checks.
import 'fake-indexeddb/auto';

import { createCache, CACHE_TTL_MS, isIndexedDbAvailable, type CacheScope } from '../src/cache';

let scopeCounter = 0;
/** A never-before-used id, for building a scope that no other test can collide with. */
function uniqueId(label = 'test'): string {
  scopeCounter += 1;
  return `${label}-${scopeCounter}`;
}

/** A never-before-used scope, so each test gets its own isolated database. */
function uniqueScope(label = 'test'): CacheScope {
  return { network: 'unit-test-net', accountAddress: uniqueId(label) };
}

// ── 1. Basic get/set round-trip ───────────────────────────────────────────────

describe('cache — get/set round-trip', () => {
  it('returns null for a missing key', async () => {
    const cache = createCache(uniqueScope());
    expect(await cache.getCached('invoices:Pending:1')).toBeNull();
  });

  it('round-trips data with the correct schema fields', async () => {
    const cache = createCache(uniqueScope());
    const before = Date.now();
    await cache.setCached('offers:inv_001', { foo: 'bar' }, 3);
    const entry = await cache.getCached<{ foo: string }>('offers:inv_001');

    expect(entry).not.toBeNull();
    expect(entry!.key).toBe('offers:inv_001');
    expect(entry!.data).toEqual({ foo: 'bar' });
    expect(entry!.version).toBe(3);
    expect(entry!.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry!.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('defaults version to 1 when not supplied', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('positions:GLENDER123', { balance: 100n });
    const entry = await cache.getCached('positions:GLENDER123');
    expect(entry!.version).toBe(1);
  });

  it('overwrites an existing entry on a second setCached for the same key', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('offers:inv_001', { v: 1 });
    await cache.setCached('offers:inv_001', { v: 2 });
    const entry = await cache.getCached<{ v: number }>('offers:inv_001');
    expect(entry!.data).toEqual({ v: 2 });
  });

  it('handles bigint fields in cached data (Invoice/FinancingOffer shapes)', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('invoices:Pending:1', { amount: 5_000_000n });
    const entry = await cache.getCached<{ amount: bigint }>('invoices:Pending:1');
    expect(entry!.data.amount).toBe(5_000_000n);
  });
});

// ── 2. TTL / staleness config ─────────────────────────────────────────────────

describe('cache — CACHE_TTL_MS config', () => {
  it('defines the required per-type TTLs', () => {
    expect(CACHE_TTL_MS.invoices).toBe(5 * 60_000);
    expect(CACHE_TTL_MS.offers).toBe(2 * 60_000);
    expect(CACHE_TTL_MS.positions).toBe(60_000);
  });
});

// ── 3. staleWhileRevalidate ────────────────────────────────────────────────────

describe('cache — staleWhileRevalidate', () => {
  it('returns null data and isStale=true on a cold cache, then updates the cache in the background', async () => {
    const cache = createCache(uniqueScope());
    const fetcher = vi.fn().mockResolvedValue({ id: 'inv_1' });

    const result = await cache.staleWhileRevalidate('invoices:Pending:1', 5_000, fetcher);
    expect(result.data).toBeNull();
    expect(result.isStale).toBe(true);

    const fresh = await result.refresh;
    expect(fresh).toEqual({ id: 'inv_1' });
    expect(fetcher).toHaveBeenCalledOnce();

    const entry = await cache.getCached('invoices:Pending:1');
    expect(entry!.data).toEqual({ id: 'inv_1' });
  });

  it('returns cached data immediately (isStale=false) while still refreshing in the background', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('offers:inv_002', { id: 'off_1', v: 1 });

    const fetcher = vi.fn().mockResolvedValue({ id: 'off_1', v: 2 });
    const result = await cache.staleWhileRevalidate('offers:inv_002', 60_000, fetcher);

    // Fresh cache read comes back immediately, synchronously available.
    expect(result.data).toEqual({ id: 'off_1', v: 1 });
    expect(result.isStale).toBe(false);

    await result.refresh;
    const updated = await cache.getCached('offers:inv_002');
    expect(updated!.data).toEqual({ id: 'off_1', v: 2 });
  });

  it('marks an entry older than the TTL as stale', async () => {
    const cache = createCache(uniqueScope());
    // Real (short) delay rather than fake timers — fake-indexeddb schedules
    // its request callbacks via real timers/microtasks internally, so
    // vi.useFakeTimers() here would starve `idb`'s promises and hang the test.
    const tinyTtlMs = 5;
    await cache.setCached('positions:GLENDER', { balance: 1 });
    await new Promise(resolve => setTimeout(resolve, tinyTtlMs + 15));

    const fetcher = vi.fn().mockResolvedValue({ balance: 2 });
    const result = await cache.staleWhileRevalidate('positions:GLENDER', tinyTtlMs, fetcher);
    expect(result.data).toEqual({ balance: 1 }); // stale value still returned
    expect(result.isStale).toBe(true);
  });

  // ── 4. Promise.allSettled graceful degradation ──────────────────────────────

  it('keeps the stale cache entry intact and does not throw when the background fetch rejects', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('invoices:Financed:1', { id: 'inv_9' });

    const fetcher = vi.fn().mockRejectedValue(new Error('network down'));
    const result = await cache.staleWhileRevalidate('invoices:Financed:1', 60_000, fetcher);

    expect(result.data).toEqual({ id: 'inv_9' });
    await expect(result.refresh).resolves.toBeNull(); // does not throw or reject

    const stillCached = await cache.getCached('invoices:Financed:1');
    expect(stillCached!.data).toEqual({ id: 'inv_9' }); // untouched
  });

  it('never throws even with no prior cache entry and a rejecting fetcher', async () => {
    const cache = createCache(uniqueScope());
    const fetcher = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await cache.staleWhileRevalidate('offers:inv_none', 60_000, fetcher);
    expect(result.data).toBeNull();
    await expect(result.refresh).resolves.toBeNull();
  });
});

// ── 5. invalidate() ────────────────────────────────────────────────────────────

describe('cache — invalidate', () => {
  it('deletes an exact key', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('offers:inv_001', { a: 1 });
    await cache.invalidate('offers:inv_001');
    expect(await cache.getCached('offers:inv_001')).toBeNull();
  });

  it('deletes every key sharing a prefix, leaving unrelated keys untouched', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('invoices:Pending:1', { p: 1 });
    await cache.setCached('invoices:Pending:2', { p: 2 });
    await cache.setCached('invoices:Financed:1', { p: 3 });
    await cache.setCached('offers:inv_001', { p: 4 });

    await cache.invalidate('invoices:');

    expect(await cache.getCached('invoices:Pending:1')).toBeNull();
    expect(await cache.getCached('invoices:Pending:2')).toBeNull();
    expect(await cache.getCached('invoices:Financed:1')).toBeNull();
    expect(await cache.getCached('offers:inv_001')).not.toBeNull();
  });

  it('is a no-op (does not throw) for a key/prefix that matches nothing', async () => {
    const cache = createCache(uniqueScope());
    await expect(cache.invalidate('nonexistent:')).resolves.toBeUndefined();
  });
});

// ── 6. LRU eviction ─────────────────────────────────────────────────────────────

const MAX_CACHE_SIZE_BYTES_FOR_TEST = 50 * 1024 * 1024;

describe('cache — LRU eviction', () => {
  it('evicts least-recently-accessed entries once the size threshold is exceeded', async () => {
    const cache = createCache(uniqueScope());
    // Small threshold so the test doesn't need to write anywhere near 50MB.
    // Sized to fit exactly two of these ~equal-size entries (plus slack) so
    // adding the third forces exactly one eviction — the least-recently-used
    // one — rather than evicting two entries down to a single survivor.
    const sampleEntrySize = JSON.stringify({
      key: 'positions:A',
      data: { blob: 'x'.repeat(50) },
      timestamp: Date.now(),
      version: 1,
      lastAccessed: Date.now(),
    }).length;
    const tinyThreshold = sampleEntrySize * 2 + 20;
    // A tiny real delay between each step guarantees strictly increasing
    // `lastAccessed` millisecond timestamps — without it, operations can
    // complete fast enough to tie, making the LRU sort order (and therefore
    // which entry gets evicted) nondeterministic.
    const tick = () => new Promise(resolve => setTimeout(resolve, 2));

    await cache.setCached('positions:A', { blob: 'x'.repeat(50) }, 1, tinyThreshold);
    await tick();
    await cache.setCached('positions:B', { blob: 'x'.repeat(50) }, 1, tinyThreshold);
    await tick();
    // Access A again so B becomes the least-recently-accessed entry.
    await cache.getCached('positions:A');
    await tick();
    // This write pushes the store over budget and triggers eviction.
    await cache.setCached('positions:C', { blob: 'x'.repeat(50) }, 1, tinyThreshold);

    const a = await cache.getCached('positions:A');
    const b = await cache.getCached('positions:B');
    const c = await cache.getCached('positions:C');

    // B was least-recently-accessed and should have been evicted first.
    expect(b).toBeNull();
    expect(c).not.toBeNull();
    expect(a).not.toBeNull();
  });

  it('does not evict anything when under the size threshold', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('positions:A', { small: 1 }, 1, MAX_CACHE_SIZE_BYTES_FOR_TEST);
    await cache.setCached('positions:B', { small: 2 }, 1, MAX_CACHE_SIZE_BYTES_FOR_TEST);
    expect(await cache.getCached('positions:A')).not.toBeNull();
    expect(await cache.getCached('positions:B')).not.toBeNull();
  });
});

// ── 7. Environment guard ─────────────────────────────────────────────────────

describe('cache — environment guard (no IndexedDB)', () => {
  // fake-indexeddb/auto installs `globalThis.indexedDB` once for the whole
  // file; these tests temporarily remove it to exercise the SSR/Node path,
  // then restore it so later tests are unaffected. No module reset is
  // needed: every method re-checks `isIndexedDbAvailable()` on each call
  // before touching the memoized connection promise.
  async function withoutIndexedDb<T>(fn: () => Promise<T> | T): Promise<T> {
    const saved = globalThis.indexedDB;
    // @ts-expect-error — simulating an environment with no indexedDB global
    delete globalThis.indexedDB;
    try {
      return await fn();
    } finally {
      globalThis.indexedDB = saved;
    }
  }

  it('isIndexedDbAvailable() reflects the current globalThis.indexedDB', async () => {
    await withoutIndexedDb(() => {
      expect(isIndexedDbAvailable()).toBe(false);
    });
    expect(isIndexedDbAvailable()).toBe(true);
  });

  it('getCached resolves null (never throws) when indexedDB is unavailable', async () => {
    await withoutIndexedDb(async () => {
      const cache = createCache(uniqueScope('no-idb'));
      await expect(cache.getCached('invoices:Pending:1')).resolves.toBeNull();
    });
  });

  it('setCached resolves without effect (never throws) when indexedDB is unavailable', async () => {
    await withoutIndexedDb(async () => {
      const cache = createCache(uniqueScope('no-idb'));
      await expect(cache.setCached('invoices:Pending:1', { a: 1 })).resolves.toBeUndefined();
    });
  });

  it('invalidate resolves without effect (never throws) when indexedDB is unavailable', async () => {
    await withoutIndexedDb(async () => {
      const cache = createCache(uniqueScope('no-idb'));
      await expect(cache.invalidate('invoices:')).resolves.toBeUndefined();
    });
  });

  it('staleWhileRevalidate still calls the fetcher and resolves gracefully with no cache backing', async () => {
    await withoutIndexedDb(async () => {
      const cache = createCache(uniqueScope('no-idb'));
      const fetcher = vi.fn().mockResolvedValue({ id: 'inv_x' });

      const result = await cache.staleWhileRevalidate('invoices:Pending:1', 5_000, fetcher);
      expect(result.data).toBeNull();
      expect(result.isStale).toBe(true);
      await expect(result.refresh).resolves.toEqual({ id: 'inv_x' });
    });
  });
});

// ── 8. Scoping ───────────────────────────────────────────────────────────────

describe('cache — scoping', () => {
  it('createCache() with no scope defaults to an unscoped/anonymous database', () => {
    const cache = createCache();
    expect(cache.scope).toEqual({});
  });

  it('exposes the scope it was created with', () => {
    const scope = { network: 'testnet', accountAddress: 'GALICE' };
    const cache = createCache(scope);
    expect(cache.scope).toEqual(scope);
  });

  it('mutating the scope object passed in has no effect on an existing instance', () => {
    const scope = { network: 'testnet', accountAddress: 'GALICE' };
    const cache = createCache(scope);
    scope.accountAddress = 'GBOB';
    expect(cache.scope.accountAddress).toBe('GALICE');
  });

  it('isolates data between two different accounts on the same network', async () => {
    const alice = createCache({ network: 'testnet', accountAddress: uniqueId('alice') });
    const bob = createCache({ network: 'testnet', accountAddress: uniqueId('bob') });

    await alice.setCached('positions:me', { balance: 100 });
    await bob.setCached('positions:me', { balance: 5 });

    const aliceEntry = await alice.getCached<{ balance: number }>('positions:me');
    const bobEntry = await bob.getCached<{ balance: number }>('positions:me');
    expect(aliceEntry?.data).toEqual({ balance: 100 });
    expect(bobEntry?.data).toEqual({ balance: 5 });
  });

  it('isolates data between two different networks for the same account', async () => {
    const account = uniqueId('shared-account');
    const testnet = createCache({ network: 'testnet', accountAddress: account });
    const mainnet = createCache({ network: 'mainnet', accountAddress: account });

    await testnet.setCached('invoices:Pending:1', { network: 'testnet' });

    expect(await mainnet.getCached('invoices:Pending:1')).toBeNull();
  });

  it('two instances created with the same scope share the same database', async () => {
    const scope = uniqueScope('shared');
    const first = createCache(scope);
    await first.setCached('offers:inv_1', { id: 'off_1' });

    const second = createCache({ ...scope });
    const entry = await second.getCached('offers:inv_1');
    expect(entry).not.toBeNull();
  });
});

// ── 9. clearCache ────────────────────────────────────────────────────────────

describe('cache — clearCache', () => {
  it('wipes every entry in this instance and does not affect other scopes', async () => {
    const carl = createCache(uniqueScope('carl'));
    const dave = createCache(uniqueScope('dave'));

    await carl.setCached('invoices:Pending:1', { a: 1 });
    await dave.setCached('invoices:Pending:1', { a: 2 });

    await carl.clearCache();

    expect(await carl.getCached('invoices:Pending:1')).toBeNull();
    const daveEntry = await dave.getCached<{ a: number }>('invoices:Pending:1');
    expect(daveEntry?.data).toEqual({ a: 2 });
  });

  it('resets the tracked size so subsequent writes are not evicted prematurely', async () => {
    const cache = createCache(uniqueScope());
    await cache.setCached('positions:me', { blob: 'x'.repeat(50) });
    await cache.clearCache();

    // A tiny maxSizeBytes would immediately trigger eviction if the size
    // counter still reflected the pre-clear total instead of resetting to 0.
    await cache.setCached('positions:me', { blob: 'y'.repeat(10) }, 1, 1_000);
    expect(await cache.getCached('positions:me')).not.toBeNull();
  });

  it('resolves without effect (never throws) when indexedDB is unavailable', async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error — simulating an environment with no indexedDB global
    delete globalThis.indexedDB;
    try {
      const cache = createCache(uniqueScope('no-idb'));
      await expect(cache.clearCache()).resolves.toBeUndefined();
    } finally {
      globalThis.indexedDB = saved;
    }
  });
});

// ── 10. Concurrent clients ───────────────────────────────────────────────────
// The module-global `currentScope`/`dbPromise` design this replaced would
// have let one client's `setCacheScope` call redirect another's in-flight
// operations to the wrong database. These tests interleave two
// differently-scoped instances' operations to prove that can't happen now
// that each instance owns its own connection.

describe('cache — concurrent clients', () => {
  it('interleaved writes from two differently-scoped instances never cross-contaminate', async () => {
    const alice = createCache(uniqueScope('concurrent-alice'));
    const bob = createCache(uniqueScope('concurrent-bob'));

    // Interleave: both instances' operations are in flight at the same time,
    // constructed in an order that would trip up any shared "current scope"
    // pointer (bob's writes start before alice's finish).
    await Promise.all([
      alice.setCached('invoices:Pending:1', { owner: 'alice', n: 1 }),
      bob.setCached('invoices:Pending:1', { owner: 'bob', n: 1 }),
      alice.setCached('offers:o1', { owner: 'alice', n: 2 }),
      bob.setCached('offers:o1', { owner: 'bob', n: 2 }),
    ]);

    const [aliceInvoice, bobInvoice, aliceOffer, bobOffer] = await Promise.all([
      alice.getCached<{ owner: string }>('invoices:Pending:1'),
      bob.getCached<{ owner: string }>('invoices:Pending:1'),
      alice.getCached<{ owner: string }>('offers:o1'),
      bob.getCached<{ owner: string }>('offers:o1'),
    ]);

    expect(aliceInvoice?.data.owner).toBe('alice');
    expect(bobInvoice?.data.owner).toBe('bob');
    expect(aliceOffer?.data.owner).toBe('alice');
    expect(bobOffer?.data.owner).toBe('bob');
  });

  it('creating a new scoped instance mid-flight does not affect an existing instance\'s in-flight operations', async () => {
    const first = createCache(uniqueScope('mid-flight-first'));

    const writePromise = first.setCached('positions:me', { balance: 1 });
    // Simulate another part of the app switching accounts concurrently —
    // this used to mutate module-global state (`setCacheScope`) that
    // `first`'s in-flight write would have read from.
    const second = createCache(uniqueScope('mid-flight-second'));
    await second.setCached('positions:me', { balance: 2 });
    await writePromise;

    const firstEntry = await first.getCached<{ balance: number }>('positions:me');
    const secondEntry = await second.getCached<{ balance: number }>('positions:me');
    expect(firstEntry?.data).toEqual({ balance: 1 });
    expect(secondEntry?.data).toEqual({ balance: 2 });
  });
});

// ── 11. Distinct scope strings (collision-free encoding) ────────────────────
// The previous implementation sanitized each scope segment by replacing any
// character outside [a-zA-Z0-9_.:-] with "_" — so e.g. accountAddress
// "acct/1" and "acct?1" both sanitized to "acct_1" and collided onto the
// *same* database. encodeURIComponent is injective (distinct inputs never
// produce the same output) and reversible (decodeURIComponent undoes it),
// which is what these tests exercise via observable isolation.

describe('cache — distinct scope strings', () => {
  it('scope strings that would have collided under naive "_" substitution stay isolated', async () => {
    const a = createCache({ network: 'testnet', accountAddress: 'acct/1' });
    const b = createCache({ network: 'testnet', accountAddress: 'acct?1' });

    await a.setCached('offers:x', { from: 'slash' });
    await b.setCached('offers:x', { from: 'question' });

    const aEntry = await a.getCached<{ from: string }>('offers:x');
    const bEntry = await b.getCached<{ from: string }>('offers:x');
    expect(aEntry?.data).toEqual({ from: 'slash' });
    expect(bEntry?.data).toEqual({ from: 'question' });
  });

  it('a scope value containing a literal ":" cannot be confused with the segment separator', async () => {
    // Old behavior allowed ':' through unsanitized, so a crafted address
    // could inject an extra segment boundary. A colon is now always
    // percent-encoded, so this can't collide with a differently-shaped scope.
    const withColon = createCache({ network: 'testnet', accountAddress: 'evil:anon' });
    const plain = createCache({ network: 'testnet', accountAddress: 'evil' });

    await withColon.setCached('offers:x', { tag: 'colon' });

    // 'plain' must not see 'withColon''s data even though a naive ':' split
    // of the resulting database name could otherwise line them up.
    expect(await plain.getCached('offers:x')).toBeNull();
  });

  it('many distinct raw scope strings each get their own isolated database', async () => {
    const rawValues = ['a b', 'a+b', 'a=b', 'a&b', 'a%b', 'a#b', 'ab', 'a_b'];
    const caches = rawValues.map(v => createCache({ network: 'testnet', accountAddress: v }));

    await Promise.all(caches.map((c, i) => c.setCached('offers:x', { i })));

    const entries = await Promise.all(caches.map(c => c.getCached<{ i: number }>('offers:x')));
    entries.forEach((entry, i) => {
      expect(entry?.data).toEqual({ i });
    });
  });
});
