import Link from 'next/link';
import { Calendar, DollarSign } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatAmount, formatDate, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice } from '@/types';

interface InvoiceCardProps {
  invoice: Invoice;
  href: string;
}

export function InvoiceCard({ invoice, href }: InvoiceCardProps) {
  return (
    <Link href={href}>
      <Card className="hover:shadow-md hover:border-blue-200 transition-all cursor-pointer">
        <CardContent className="pt-5">
          <div className="flex items-start justify-between mb-3">
            <p className="text-xs font-mono text-gray-400">{invoice.id}</p>
            <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>{invoice.status}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-1.5 text-gray-700">
              <DollarSign className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-semibold">
                {formatAmount(invoice.amount)} {invoice.currency}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-gray-500">
              <Calendar className="h-3.5 w-3.5 text-gray-400" />
              <span>Due {formatDate(invoice.due_date)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
