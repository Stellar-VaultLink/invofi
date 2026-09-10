import Link from 'next/link';
import { Calendar, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAmount } from '@/lib/formatters';
import { formatDate, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice } from '@/types';

interface InvoiceCardProps {
  invoice: Invoice;
  href: string;
}

export function InvoiceCard({ invoice, href }: InvoiceCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-mono text-muted-foreground truncate max-w-[180px]">{invoice.id}</p>
            <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-foreground min-w-0">
              <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="font-semibold truncate">
                {formatAmount(invoice.amount, invoice.currency)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">Due {formatDate(invoice.due_date)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
