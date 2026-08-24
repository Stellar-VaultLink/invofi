'use client';

import { ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { InvoiceDocument } from '@/types';

interface DocumentPreviewDialogProps {
  document: InvoiceDocument | null;
  onClose: () => void;
}

const contentUrl = (id: string) => `/api/documents/${id}/content`;

/**
 * Inline preview of an invoice document. Images render directly; PDFs render
 * in a same-origin iframe (the content route enforces party-only access and a
 * SHA-256 tamper check before streaming the bytes).
 */
export function DocumentPreviewDialog({ document, onClose }: DocumentPreviewDialogProps) {
  const isImage = document?.mime_type === 'image/jpeg' || document?.mime_type === 'image/png';

  return (
    <Dialog open={document !== null} onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pe-8">
            {document?.mime_type === 'application/pdf' ? (
              <FileText className="h-4 w-4" />
            ) : (
              <ImageIcon className="h-4 w-4" />
            )}
            {document?.file_name ?? 'Document'}
          </DialogTitle>
          <DialogDescription>
            {document?.file_name} · SHA-256 {document ? document.document_hash.slice(0, 12) : ''}…
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-auto rounded-lg border bg-gray-50">
          {document && isImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contentUrl(document.id)}
              alt={document.file_name}
              className="mx-auto max-h-[65vh] w-auto object-contain"
            />
          )}
          {document && !isImage && (
            <iframe
              src={contentUrl(document.id)}
              title={document.file_name}
              className="h-[65vh] w-full"
            />
          )}
        </div>

        {document && (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => window.open(contentUrl(document.id), '_blank', 'noopener')}
            >
              <ExternalLink className="h-4 w-4" /> Open in new tab
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}