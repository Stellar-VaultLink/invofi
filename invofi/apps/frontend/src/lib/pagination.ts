/**
 * Client-side pagination helpers for large portfolio position lists.
 *
 * The portfolio page renders every position token/offer a wallet holds; as the
 * protocol grows a single wallet can end up with hundreds of rows. Rather than
 * rendering them all at once we slice the list client-side (the contract layer
 * is explicitly out of scope for this concern) and virtualize each page.
 */

/** Convenience type so callers do not need to repeat the generic. */
export type Paginated<T> = readonly T[];

/**
 * Clamp a 1-based page number into the valid range for `total` items.
 * Returns 1 when there is nothing to page over.
 */
export function clampPage(page: number, total: number, pageSize: number): number {
  const pageCount = pageCountOf(total, pageSize);
  if (pageCount === 0) return 1;
  return Math.min(Math.max(1, page), pageCount);
}

/** Number of pages needed to show `total` items at `pageSize` per page. */
export function pageCountOf(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 0;
  return Math.ceil(total / pageSize);
}

/**
 * Return the slice of `items` that belongs to `page` (1-based) when arranged
 * at `pageSize` per page. `page` is clamped so callers can pass anything.
 */
export function paginate<T>(items: readonly T[], page: number, pageSize: number): Paginated<T> {
  if (!items.length || pageSize <= 0) return [];
  const start = (clampPage(page, items.length, pageSize) - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

/** Human label like "1–20 of 512". */
export function rangeLabel(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 of 0';
  const clamped = clampPage(page, total, pageSize);
  const start = (clamped - 1) * pageSize + 1;
  const end = Math.min(clamped * pageSize, total);
  return `${start}–${end} of ${total}`;
}