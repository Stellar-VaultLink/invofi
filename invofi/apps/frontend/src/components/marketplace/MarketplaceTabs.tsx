'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/marketplace',           label: 'Invoices' },
  { href: '/marketplace/positions', label: 'Positions' },
  { href: '/marketplace/fractions', label: 'Fractions' },
] as const;

/**
 * Switches between the three marketplace surfaces:
 *  - Invoices:  open for financing
 *  - Positions: secondary-market position-token board (ADR-0004)
 *  - Fractions: fractionalized invoice tokens available for purchase
 */
export function MarketplaceTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Marketplace sections" className="flex gap-1 border-b border-border mb-6">
      {TABS.map(tab => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              active
                ? 'border-blue-600 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
