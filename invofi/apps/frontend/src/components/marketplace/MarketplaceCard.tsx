import { memo } from 'react';
import Link from 'next/link';
import { Calendar, DollarSign, ArrowRight, ExternalLink, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAmount } from '@/lib/formatters';
import { formatDate, formatAddress, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice } from '@/types';

const NETWORK = process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
const STELLAR_EXPERT = `https://stellar.expert/explorer/${NETWORK}`;

function DueLabel({ dueDateUnix }: { dueDateUnix: number }) {
  const now = Date.now() / 1000;
  const diffDays = Math.round((dueDateUnix - now) / 86400);

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 font-medium">
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {Math.abs(diffDays)}d overdue
      </span>
    );
  }
  if (diffDays <= 7) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
        <Clock className="h-3 w-3 shrink-0" />
        Due in {diffDays}d
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Due {formatDate(dueDateUnix)}
    </span>
  );
}

interface MarketplaceCardProps {
  invoice: Invoice;
}

export const MarketplaceCard = memo(function MarketplaceCard({ invoice }: MarketplaceCardProps) {
  return (
    <Card className="flex flex-col hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all">
      <CardContent className="pt-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-xs font-mono text-muted-foreground truncate max-w-[110px]">{invoice.id}</p>
            <a
              href={`${STELLAR_EXPERT}/contract/${invoice.originator}`}
              target="_blank"
              rel="noreferrer noopener"
              title="View on Stellar Expert"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-blue-500 transition-colors shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
        </div>

        <div className="space-y-2 flex-1 mb-4">
          <div className="flex items-center gap-1.5 text-foreground min-w-0">
            <DollarSign className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-lg truncate">
              {formatAmount(invoice.amount, invoice.currency)}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <DueLabel dueDateUnix={invoice.due_date} />
          </div>

          <p className="text-xs text-muted-foreground font-mono truncate">
            Originator:{' '}
            <a
              href={`${STELLAR_EXPERT}/account/${invoice.originator}`}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-blue-500 hover:underline transition-colors"
            >
              {formatAddress(invoice.originator)}
            </a>
          </p>
        </div>

        <Button asChild size="sm" className="w-full">
          <Link href={`/invoices/${invoice.id}`}>
            Make Offer <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
});
