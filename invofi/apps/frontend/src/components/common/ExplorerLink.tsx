import { explorerContractUrl, explorerAccountUrl, explorerTxUrl } from '@/lib/constants';

interface ExplorerLinkProps {
  type: 'contract' | 'account' | 'tx';
  value: string;
  children?: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * Reusable Stellar Expert explorer link.
 * Uses the network-aware helpers from `@/lib/constants` so testnet vs mainnet
 * is handled in one place — no inline `STELLAR_EXPERT` constants in call sites.
 */
export function ExplorerLink({
  type,
  value,
  children,
  className = '',
  title,
}: ExplorerLinkProps) {
  const url =
    type === 'contract'
      ? explorerContractUrl(value)
      : type === 'account'
        ? explorerAccountUrl(value)
        : explorerTxUrl(value);

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      className={className}
      title={title ?? 'View on Stellar Expert'}
    >
      {children ?? value}
    </a>
  );
}