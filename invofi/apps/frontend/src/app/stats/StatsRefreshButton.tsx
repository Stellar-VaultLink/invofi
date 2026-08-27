'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/**
 * ISR-aware refresh button for the public stats page.
 *
 * The page is now an Incremental Static Regeneration (ISR) server component
 * (see `page.tsx` — `export const revalidate`). Triggering a client-side
 * refetch would bypass the server cache, so refresh instead re-runs the server
 * component through `router.refresh()`, which revalidates the rendered output
 * and picks up the freshest `protocol_stats` row within the revalidate window.
 */
export default function StatsRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={isPending}
      className="p-2 rounded-md text-muted-foreground hover:bg-accent transition-colors"
      title="Refresh stats"
      aria-label="Refresh stats"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
    </button>
  );
}