'use client';

import { FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useWallet } from '@/components/auth/WalletProvider';
import { useInvoiceDocuments } from '@/hooks/useInvoiceDocuments';
import { DocumentUploader } from './DocumentUploader';
import { DocumentList } from './DocumentList';
import type { Invoice } from '@/types';

interface InvoiceDocumentsProps {
  invoice: Invoice;
}

/**
 * Invoice proof documents section (issue #222). The originator uploads
 * PDF/image proof files; lenders with an offer on the invoice can preview and
 * verify/reject them. Access is RLS-gated: non-parties see an empty list.
 */
export function InvoiceDocuments({ invoice }: InvoiceDocumentsProps) {
  const { publicKey } = useWallet();
  const { documents, loading, error, refresh } = useInvoiceDocuments(invoice.id);

  const isOriginator = publicKey === invoice.originator;
  // Anyone who can see a document but isn't the originator is a lender with an
  // offer on the invoice (RLS hides the list from everyone else).
  const canVerify = !isOriginator && publicKey !== null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : (
          <>
            {isOriginator && (
              <>
                <DocumentUploader invoiceId={invoice.id} onUploaded={refresh} />
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <FileText className="h-3.5 w-3.5" />
                  Proof documents are stored on IPFS; their SHA-256 hashes are
                  recorded for tamper detection.
                </div>
              </>
            )}
            <DocumentList
              documents={documents}
              canVerify={canVerify}
              onChanged={refresh}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}