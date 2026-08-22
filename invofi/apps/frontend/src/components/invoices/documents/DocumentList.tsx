'use client';

import { useState } from 'react';
import { Check, Eye, FileText, Image as ImageIcon, Loader2, ShieldX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import {
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  formatDocumentSize,
} from '@/lib/documents/status';
import { hashFingerprint } from '@/lib/documents/hash';
import { formatDate } from '@/lib/utils';
import { DocumentPreviewDialog } from './DocumentPreviewDialog';
import type { InvoiceDocument } from '@/types';

interface DocumentListProps {
  documents: InvoiceDocument[];
  /** True when the current user is a lender who can verify documents. */
  canVerify: boolean;
  onChanged: () => void;
}

const isImage = (doc: InvoiceDocument) => doc.mime_type === 'image/jpeg' || doc.mime_type === 'image/png';

export function DocumentList({ documents, canVerify, onChanged }: DocumentListProps) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<InvoiceDocument | null>(null);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (documents.length === 0) {
    return <p className="text-sm text-gray-400 text-center py-6">No documents attached yet.</p>;
  }

  const setStatus = async (doc: InvoiceDocument, status: InvoiceDocument['status']) => {
    setBusyId(doc.id);
    try {
      const comment = (comments[doc.id] ?? '').trim() || null;
      const { error } = await supabase
        .from('invoice_documents')
        .update({ status, verification_comment: comment })
        .eq('id', doc.id);
      if (error) {
        throw new Error(error.message);
      }
      setComments(prev => ({ ...prev, [doc.id]: '' }));
      toast({
        title: status === 'verified' ? 'Document verified' : 'Document rejected',
        description:
          status === 'verified'
            ? 'The lender has accepted this proof document.'
            : 'The lender has rejected this proof document.',
      });
      onChanged();
    } catch (err: unknown) {
      toast({
        title: 'Failed to update verification status',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <ul className="space-y-3">
        {documents.map(doc => (
          <li key={doc.id} className="border rounded-lg p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <span className="mt-0.5 text-gray-400">
                  {isImage(doc) ? <ImageIcon className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setPreview(doc)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    {doc.file_name} <Eye className="h-3.5 w-3.5" />
                  </button>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDocumentSize(doc.file_size)} · {formatDate(doc.created_at)}
                  </p>
                  <p className="text-xs text-gray-400 font-mono mt-0.5">
                    SHA-256 {hashFingerprint(doc.document_hash)}
                  </p>
                  {doc.verification_comment && (
                    <p className="text-xs text-gray-500 mt-1 italic">“{doc.verification_comment}”</p>
                  )}
                </div>
              </div>
              <Badge className={DOCUMENT_STATUS_COLORS[doc.status]}>
                {DOCUMENT_STATUS_LABELS[doc.status]}
              </Badge>
            </div>

            {canVerify && doc.status === 'pending' && (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <Input
                  className="h-9 text-sm"
                  placeholder="Verification comment (optional)"
                  value={comments[doc.id] ?? ''}
                  onChange={e => setComments(prev => ({ ...prev, [doc.id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-green-700 border-green-300 hover:bg-green-50"
                    disabled={busyId === doc.id}
                    onClick={() => setStatus(doc, 'verified')}
                  >
                    {busyId === doc.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-red-700 border-red-300 hover:bg-red-50"
                    disabled={busyId === doc.id}
                    onClick={() => setStatus(doc, 'rejected')}
                  >
                    <ShieldX className="h-3 w-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {canVerify && doc.status !== 'pending' && (
              <p className="text-xs text-gray-400 mt-2">
                {doc.verified_at
                  ? `${DOCUMENT_STATUS_LABELS[doc.status]} on ${formatDate(doc.verified_at)}`
                  : DOCUMENT_STATUS_LABELS[doc.status]}
                {doc.verification_comment ? ` — “${doc.verification_comment}”` : ''}
              </p>
            )}
          </li>
        ))}
      </ul>

      <DocumentPreviewDialog document={preview} onClose={() => setPreview(null)} />
    </>
  );
}