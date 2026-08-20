// ── SDK offline cache (IndexedDB, stale-while-revalidate) — Task 218 ────────
//
// Caches invoice/offer/position reads in IndexedDB (via the `idb` wrapper) so
// consumers can render immediately from a warm cache while a background
// refresh silently brings the data up to date ("stale-while-revalidate").
//
// This module is browser-only in spirit but MUST NOT assume a browser is
// present: the SDK is also consumed by a Next.js app that renders on the
// server, and by a Node CLI keeper (apps/scripts). Every method therefore
// guards on `isIndexedDbAvailable()` and degrades to a safe no-op (resolves
// `null`/`undefined` for reads, resolves without effect for writes) rather
// than throwing when `indexedDB` is unavailable — this is a load-bearing
// guarantee for SSR/Node callers, not an incidental detail.
//
// Scoping (PR #236 review): the cache is namespaced by network + connected
// account (`CacheScope`), and database selection is instance-scoped, not a
// module-global — call `createCache(scope)` to get a handle bound to one
// immutable scope, with its own private IndexedDB connection. Concurrent
// callers with different scopes (e.g. two clients for different accounts
// live at once) never share mutable state or race on which database is
// "current", which a module-global `currentScope`/`dbPromise` pair would.
// `createInvofiClient` (client.ts) builds one from `cfg.networkPassphrase` /
// `cfg.accountAddress` and exposes it as `client.cache`. On an explicit
// wallet disconnect, callers should call `cache.clearCache()` to wipe the
// departing account's store rather than leaving it sitting in IndexedDB
// indefinitely (frontend wiring of that call site is a follow-up, same as
// the rest of the frontend integration — see the PR description).
//
// Usage:
//   import { createCache, CACHE_TTL_MS } from './cache';
//   const cache = createCache({ network: cfg.networkPassphrase, accountAddress });
//   const { data, isStale, refresh } = await cache.staleWhileRevalidate(
//     `invoices:${status}:${page}`,
//     CACHE_TTL_MS.invoices,
//     () => fetchInvoicesFromChain(status, page),
//   );

import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * Public cache-entry shape. `version` is a caller-controlled schema/format
 * tag (defaults to 1) so future format changes can be detected and ignored
 * rather than mis-parsed.
 */
export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  version: number;
}

/** Internal on-disk shape: a `CacheEntry` plus LRU bookkeeping. */
interface StoredEntry<T> extends CacheEntry<T> {
  /** Updated on every `getCached` read; drives LRU eviction order. */
  lastAccessed: number;
}

/** Single-row running total in `META_STORE_NAME`, kept in sync incrementally. */
interface MetaRecord {
  key: typeof META_KEY;
  totalBytes: number;
}

/**
 * Identifies which account/network a cache instance's database belongs to.
 * Both fields are free-form identifiers (e.g. `networkPassphrase` and a
 * Stellar `G...` address) — the cache only uses them to build a database
 * name, never to validate their format. Treat a `CacheScope` as immutable
 * once passed to `createCache` — the returned instance keeps using the
 * database it was built for even if the caller later mutates the object.
 */
export interface CacheScope {
  /** e.g. `Networks.PUBLIC` / `Networks.TESTNET`. Omit to share one scope across networks. */
  network?: string;
  /** The connected wallet's address. Omit while no wallet is connected. */
  accountAddress?: string;
}

const DB_NAME_PREFIX = 'invofi-cache';
const DB_VERSION = 1;
const STORE_NAME = 'invofi-cache';
const META_STORE_NAME = 'invofi-cache-meta';
const META_KEY = 'size';
const LAST_ACCESSED_INDEX = 'lastAccessed';

// ── TTL config (per cache-key prefix) ────────────────────────────────────────
// Keyed by the same prefix used in cache keys ("invoices:{status}:{page}",
// "offers:{invoiceId}", "positions:{lender}") so callers can look up the
// right TTL from the key prefix. Exported so consumers can inspect/override
// and so it is independently unit-testable.

export const CACHE_TTL_MS: Record<'invoices' | 'offers' | 'positions', number> = {
  invoices: 5 * 60_000,
  offers: 2 * 60_000,
  positions: 60_000,
};

/**
 * Total estimated cache size (tracked incrementally in `META_STORE_NAME`,
 * not recomputed from a full scan on every write — see `evictLru`) above
 * which the LRU sweep evicts least-recently-accessed entries. 50 MB per the
 * Task 218 storage-limit requirement.
 */
export const MAX_CACHE_SIZE_BYTES = 50 * 1024 * 1024;

// ── Environment guard ────────────────────────────────────────────────────────

/**
 * True when a usable `indexedDB` global is present. Checked lazily on every
 * call (not cached at module-load time) so SSR/Node callers — where
 * `indexedDB` is simply absent from `globalThis` — always resolve to a safe
 * no-op instead of throwing a ReferenceError.
 */
export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

/** JSON.stringify that tolerates bigint fields (Invoice/FinancingOffer use bigint amounts). */
function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
}

// ── Scope → database name ───────────────────────────────────────────────────

/**
 * `encodeURIComponent` gives each segment a reversible, collision-free
 * encoding: distinct inputs always produce distinct outputs (unlike a
 * lossy "replace disallowed chars with _" scheme, where e.g. "a/b" and
 * "a?b" would previously have collided onto the same sanitized segment —
 * and therefore the same database, defeating the point of scoping). It
 * also never emits a literal ':', so the fixed ':' separators below can't
 * be spoofed by a scope value that happens to contain one.
 */
function encodeScopeSegment(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? encodeURIComponent(trimmed) : fallback;
}

function dbNameFor(scope: CacheScope): string {
  const network = encodeScopeSegment(scope.network, 'unscoped');
  const account = encodeScopeSegment(scope.accountAddress, 'anon');
  return `${DB_NAME_PREFIX}:${network}:${account}`;
}

// ── Incremental size tracking ───────────────────────────────────────────────
// Avoids the `getAll()` + stringify-everything full scan on every write: a
// single-row running total is read/written in the same transaction as the
// entry mutation that changed it.

async function readMetaSize(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
): Promise<number> {
  const meta = (await tx.objectStore(META_STORE_NAME).get(META_KEY)) as MetaRecord | undefined;
  return meta?.totalBytes ?? 0;
}

async function writeMetaSize(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  totalBytes: number,
): Promise<void> {
  await tx.objectStore(META_STORE_NAME).put({ key: META_KEY, totalBytes: Math.max(0, totalBytes) });
}

// ── Stale-while-revalidate result ───────────────────────────────────────────

export interface StaleWhileRevalidateResult<T> {
  /** Cached value, or `null` when there was no cache entry (or no IndexedDB). */
  data: T | null;
  /** True when `data` is missing or older than `ttlMs`. */
  isStale: boolean;
  /**
   * The background refresh. Resolves with the freshly-fetched value on
   * success (after silently writing it to the cache), or `null` if the
   * fetch failed — a failed refresh never throws and never touches (let
   * alone evicts) the still-valid stale cache entry. Callers that only
   * need the immediate cached read may safely ignore this promise.
   */
  refresh: Promise<T | null>;
}

/** An instance-scoped cache handle bound to one immutable `CacheScope` — see `createCache`. */
export interface CacheHandle {
  /** The scope this instance was created with (defensive copy — mutating it has no effect). */
  readonly scope: CacheScope;
  getCached<T>(key: string): Promise<CacheEntry<T> | null>;
  setCached<T>(key: string, data: T, version?: number, maxSizeBytes?: number): Promise<void>;
  invalidate(keyOrPrefix: string): Promise<void>;
  clearCache(): Promise<void>;
  staleWhileRevalidate<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<StaleWhileRevalidateResult<T>>;
}

/**
 * Creates a cache handle bound to one immutable `CacheScope` (network +
 * connected account, both optional — defaults to a single shared "unscoped"
 * database). Each handle owns its own private IndexedDB connection; nothing
 * here is shared module-global state, so concurrent handles for different
 * scopes (or the same scope, from different callers) never race with each
 * other over which database is "current". Different scopes never share a
 * database, so switching wallets or networks can never serve one identity's
 * cached data to another.
 */
export function createCache(scope: CacheScope = {}): CacheHandle {
  const resolvedScope: CacheScope = { ...scope };
  const dbName = dbNameFor(resolvedScope);
  let dbPromise: Promise<IDBPDatabase> | null = null;

  /**
   * Lazily opens (and memoizes) this instance's database connection.
   * Returns `null` when IndexedDB is unavailable — callers must treat that
   * as "no-op".
   */
  function getDb(): Promise<IDBPDatabase> | null {
    if (!isIndexedDbAvailable()) return null;
    if (!dbPromise) {
      dbPromise = openDB(dbName, DB_VERSION, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
            store.createIndex(LAST_ACCESSED_INDEX, 'lastAccessed');
          }
          if (!db.objectStoreNames.contains(META_STORE_NAME)) {
            db.createObjectStore(META_STORE_NAME, { keyPath: 'key' });
          }
        },
      });
    }
    return dbPromise;
  }

  /**
   * Evicts least-recently-accessed entries (oldest `lastAccessed` first),
   * walking the `lastAccessed` index via a cursor, until the tracked total
   * size is back under `maxSizeBytes`. Unlike a `getAll()` scan, this only
   * touches as many entries as actually need evicting.
   */
  async function evictLru(conn: IDBPDatabase, maxSizeBytes: number): Promise<void> {
    try {
      const tx = conn.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let totalBytes = await readMetaSize(tx);
      if (totalBytes <= maxSizeBytes) {
        await tx.done;
        return;
      }

      let cursor = await store.index(LAST_ACCESSED_INDEX).openCursor();
      while (cursor && totalBytes > maxSizeBytes) {
        const entrySize = safeStringify(cursor.value).length;
        await cursor.delete();
        totalBytes -= entrySize;
        cursor = await cursor.continue();
      }

      await writeMetaSize(tx, totalBytes);
      await tx.done;
    } catch {
      // Eviction is best-effort cleanup — a failure here must not surface to
      // the setCached caller (the write already succeeded).
    }
  }

  /**
   * Reads a cache entry by exact key, regardless of staleness — TTL/staleness
   * is the caller's decision (see `staleWhileRevalidate`). Also bumps
   * `lastAccessed` for LRU purposes.
   *
   * Resolves `null` when the entry is missing OR when IndexedDB is
   * unavailable (SSR/Node) — never throws.
   */
  async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
    const db = getDb();
    if (!db) return null;
    try {
      const conn = await db;
      const tx = conn.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry = (await store.get(key)) as StoredEntry<T> | undefined;
      if (!entry) {
        await tx.done;
        return null;
      }
      entry.lastAccessed = Date.now();
      await store.put(entry);
      await tx.done;
      return { key: entry.key, data: entry.data, timestamp: entry.timestamp, version: entry.version };
    } catch {
      // Corrupt entry, blocked transaction, etc. — degrade to "no cache".
      return null;
    }
  }

  /**
   * Writes a cache entry (upsert by `key`) with the current timestamp, then
   * runs an LRU-eviction sweep (awaited, not fire-and-forget — so a caller
   * that awaits `setCached` is guaranteed the store is back under budget
   * before it resolves) if the estimated total store size exceeds
   * `maxSizeBytes` (defaults to `MAX_CACHE_SIZE_BYTES`; overridable for
   * testing).
   *
   * Resolves without effect when IndexedDB is unavailable — never throws.
   */
  async function setCached<T>(
    key: string,
    data: T,
    version = 1,
    maxSizeBytes: number = MAX_CACHE_SIZE_BYTES,
  ): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      const conn = await db;
      const now = Date.now();
      const entry: StoredEntry<T> = { key, data, timestamp: now, version, lastAccessed: now };
      const newSize = safeStringify(entry).length;

      const tx = conn.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const previous = (await store.get(key)) as StoredEntry<T> | undefined;
      const previousSize = previous ? safeStringify(previous).length : 0;

      await store.put(entry);
      const totalBytes = (await readMetaSize(tx)) - previousSize + newSize;
      await writeMetaSize(tx, totalBytes);
      await tx.done;

      if (totalBytes > maxSizeBytes) {
        await evictLru(conn, maxSizeBytes);
      }
    } catch {
      // Write failures (quota exceeded, blocked, etc.) must not throw or
      // interrupt the caller — the cache is best-effort.
    }
  }

  /**
   * Deletes a single exact key, or — when `keyOrPrefix` matches the start of
   * one or more stored keys — every key sharing that prefix (e.g.
   * `invalidate('invoices:')` clears every paginated `invoices:{status}:{page}`
   * entry after a mutation, since the mutation doesn't know every page that
   * might now be stale).
   *
   * Resolves without effect when IndexedDB is unavailable — never throws.
   */
  async function invalidate(keyOrPrefix: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      const conn = await db;
      const tx = conn.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let totalBytes = await readMetaSize(tx);
      let cursor = await store.openCursor();
      while (cursor) {
        const k = cursor.key;
        if (typeof k === 'string' && (k === keyOrPrefix || k.startsWith(keyOrPrefix))) {
          totalBytes -= safeStringify(cursor.value).length;
          await cursor.delete();
        }
        cursor = await cursor.continue();
      }
      await writeMetaSize(tx, totalBytes);
      await tx.done;
    } catch {
      // Best-effort — an invalidation failure should not throw into the
      // caller's mutation flow (the on-chain write already succeeded).
    }
  }

  /**
   * Wipes every entry in this instance's store and resets its tracked size
   * back to zero. Intended for an explicit wallet disconnect / account
   * change: unlike creating a new `CacheHandle` for a different scope
   * (which just points at a different, untouched database), this clears the
   * store the caller is leaving so a departing account's cached data
   * doesn't linger in IndexedDB after logout.
   *
   * Resolves without effect when IndexedDB is unavailable — never throws.
   */
  async function clearCache(): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      const conn = await db;
      const tx = conn.transaction([STORE_NAME, META_STORE_NAME], 'readwrite');
      await tx.objectStore(STORE_NAME).clear();
      await writeMetaSize(tx, 0);
      await tx.done;
    } catch {
      // Best-effort — clearing must not throw into a disconnect handler.
    }
  }

  /**
   * The core SWR entry point: reads the cache immediately (fast path), then
   * kicks off `fetcher()` in the background via `Promise.allSettled` so a
   * rejected fetch degrades gracefully instead of throwing or clearing the
   * still-good stale entry. On success the fresh value silently replaces the
   * cache entry.
   *
   * `data`/`isStale` are ready as soon as the returned promise resolves (a
   * single fast IndexedDB read); `refresh` is a separate promise the caller
   * can `await` or ignore.
   */
  async function staleWhileRevalidate<T>(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
  ): Promise<StaleWhileRevalidateResult<T>> {
    const cached = await getCached<T>(key);
    const isStale = !cached || Date.now() - cached.timestamp > ttlMs;

    const refresh: Promise<T | null> = (async () => {
      const [outcome] = await Promise.allSettled([fetcher()]);
      if (outcome.status === 'fulfilled') {
        await setCached(key, outcome.value, cached?.version ?? 1);
        return outcome.value;
      }
      // Swallow the failure — the stale cache entry (if any) is left intact.
      return null;
    })();

    return {
      data: cached ? cached.data : null,
      isStale,
      refresh,
    };
  }

  return {
    scope: resolvedScope,
    getCached,
    setCached,
    invalidate,
    clearCache,
    staleWhileRevalidate,
  };
}
