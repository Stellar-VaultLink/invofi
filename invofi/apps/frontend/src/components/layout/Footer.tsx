import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { REGISTRY_CONTRACT_ID, STELLAR_NETWORK, explorerContractUrl } from '@/lib/constants';
import { Heart } from 'lucide-react';

const SITE_MAP = {
  product: [
    { label: 'Marketplace', href: '/marketplace' },
    { label: 'Dashboard', href: '/dashboard' },
    { label: 'Portfolio', href: '/portfolio' },
    { label: 'Stats', href: '/stats' },
  ],
  developers: [
    { label: 'Documentation', href: 'https://stellar-vault-link.gitbook.io/stellar-vault-link-docs' },
    { label: 'GitHub', href: 'https://github.com/Stellar-VaultLink/invofi' },
    { label: 'Smart Contracts', href: 'https://github.com/Stellar-VaultLink/invofi-contracts' },
    { label: 'Report a Bug', href: 'https://github.com/Stellar-VaultLink/invofi/issues' },
  ],
  community: [
    { label: 'Contributing', href: 'https://github.com/Stellar-VaultLink/invofi/blob/main/CONTRIBUTING.md' },
    { label: 'Open Issues', href: 'https://github.com/Stellar-VaultLink/invofi/issues' },
    { label: 'Discussions', href: 'https://github.com/Stellar-VaultLink/invofi/discussions' },
    { label: 'Stellar Dev Portal', href: 'https://developers.stellar.org' },
  ],
};

export function Footer() {
  const t = useTranslations('Footer');

  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 py-12">
        {/* ── Site Directory ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              <span className="text-lg font-bold text-foreground">InvoFi</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t('tagline')}
            </p>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Product</h4>
            <ul className="space-y-2">
              {SITE_MAP.product.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Developers links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Developers</h4>
            <ul className="space-y-2">
              {SITE_MAP.developers.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Community links */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Community</h4>
            <ul className="space-y-2">
              {SITE_MAP.community.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} InvoFi. Open source under MIT License.
          </p>

          {REGISTRY_CONTRACT_ID && (
            <p className="text-xs text-muted-foreground">
              {t('contractOnStellar', { network: STELLAR_NETWORK })}{' '}
              <a
                href={explorerContractUrl(REGISTRY_CONTRACT_ID)}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
                title={t('viewOnStellarExpert')}
              >
                {REGISTRY_CONTRACT_ID.slice(0, 8)}…{REGISTRY_CONTRACT_ID.slice(-8)}
              </a>
            </p>
          )}

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            Made with <Heart className="h-3 w-3 fill-red-500 text-red-500" /> for{' '}
            <a
              href="https://stellar.org"
              target="_blank"
              rel="noreferrer"
              className="font-semibold hover:text-foreground transition-colors"
            >
              Stellar
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}