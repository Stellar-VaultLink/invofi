'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { OfferList } from '@/components/invoices/OfferList';
import { getInvoice } from '@/lib/contract';
import { explorerUrl } from '@/lib/horizon';
import { formatAmount, formatDate, formatAddress, INVOICE_STATUS_COLORS } from '@/lib/utils';
import type { Invoice } from '@/types';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getInvoice(id)
      .then(setInvoice)
      .catch(e => setError(e instanceof Error ? e.message : 'Invoice not found'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <AuthGuard>
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        )}

        {error && (
          <div className="text-center py-20 text-gray-500">
            <p className="text-red-500 font-medium">{error}</p>
          </div>
        )}

        {invoice && (
          <div className="space-y-6">
            {/* Invoice details */}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <p className="text-xs font-mono text-gray-400 mb-1">{invoice.id}</p>
                  <CardTitle className="text-xl">Invoice</CardTitle>
                </div>
                <Badge className={INVOICE_STATUS_COLORS[invoice.status]}>
                  {invoice.status}
                </Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                <Field label="Amount" value={`${formatAmount(invoice.amount)} ${invoice.currency}`} mono />
                <Field label="Currency" value={invoice.currency} />
                <Field label="Due Date" value={formatDate(invoice.due_date)} />
                <Field
                  label="Originator"
                  value={formatAddress(invoice.originator)}
                  mono
                  link={`https://stellar.expert/explorer/testnet/account/${invoice.originator}`}
                />
              </CardContent>
            </Card>

            {/* Financing offers */}
            <OfferList invoiceId={id} invoice={invoice} onUpdate={setInvoice} />
          </div>
        )}
      </div>
    </AuthGuard>
  );
}

function Field({
  label,
  value,
  mono = false,
  link,
}: {
  label: string;
  value: string;
  mono?: boolean;
  link?: string;
}) {
  return (
    <div>
      <p className="text-gray-400 text-xs mb-0.5">{label}</p>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-blue-600 hover:underline font-mono"
        >
          {value} <ExternalLink className="h-3 w-3" />
        </a>
      ) : (
        <p className={mono ? 'font-mono text-gray-800' : 'text-gray-800'}>{value}</p>
      )}
    </div>
  );
}
