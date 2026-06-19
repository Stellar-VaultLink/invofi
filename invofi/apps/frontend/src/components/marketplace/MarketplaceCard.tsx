import Link from 'next/link';
import { Calendar, DollarSign, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatAmount, formatDate, formatAddress, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice } from '@/types';

interface MarketplaceCardProps {
  invoice: Invoice;
}

export function MarketplaceCard({ invoice }: MarketplaceCardProps) {
  return (
    <Card className="flex flex-col hover:shadow-md hover:border-blue-200 transition-all">
      <CardContent className="pt-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-3">
          <p className="text-xs font-mono text-gray-400 truncate max-w-[120px]">{invoice.id}</p>
          <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
        </div>

        <div className="space-y-2 flex-1 mb-4">
          <div className="flex items-center gap-1.5 text-gray-800">
            <DollarSign className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="font-semibold text-lg">
              {formatAmount(invoice.amount)} {invoice.currency}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            Due {formatDate(invoice.due_date)}
          </div>

          <p className="text-xs text-gray-400 font-mono">
            Originator: {formatAddress(invoice.originator)}
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
}
