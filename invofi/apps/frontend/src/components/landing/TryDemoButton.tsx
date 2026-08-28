import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Try the demo" entry point (issue #107).
 *
 * Rendered on the landing page hero when demo mode is enabled. The demo
 * experience reuses the offline mock layers (seeded invoices, offers, and a
 * position token — see `@/lib/mock`), so a visiting reviewer can reach a
 * portfolio containing seeded data without creating an account or connecting
 * a wallet. It is always labeled as testnet-only and never affects production
 * flows.
 *
 * This is a small presentational component; the flag check (`isDemoMode()`)
 * happens in the parent page so the demo entry is fully tree-shaken out of
 * production builds.
 */
export function TryDemoButton({ label }: { label: string }) {
  return (
    <Button
      asChild
      size="lg"
      variant="outline"
      className="border-white/30 text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm"
    >
      <Link href="/portfolio">
        <Sparkles className="ms-2 h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
