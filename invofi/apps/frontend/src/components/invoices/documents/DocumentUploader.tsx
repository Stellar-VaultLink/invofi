'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { uploadInvoiceDocument } from '@/lib/documents/upload';
import { validateDocumentFile } from '@/lib/documents/validation';

const ACCEPTED = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

interface DocumentUploaderProps {
  invoiceId: string;
  onUploaded: () => void;
}

/**
 * Originator-only upload control for invoice proof documents (issue #222).
 * The file is validated client-side, pinned to IPFS through the server-side
 * route, then mirrored to `invoice_documents` (RLS keeps that insert
 * originator-only).
 */
export function DocumentUploader({ invoiceId, onUploaded }: DocumentUploaderProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return;
    const check = validateDocumentFile(file);
    if (!check.ok) {
      toast({ title: 'Invalid file', description: check.error, variant: 'destructive' });
      return;
    }

    setUploading(true);
    try {
      const { cid, sha256 } = await uploadInvoiceDocument(file, invoiceId);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('You must be signed in to attach documents.');
      }
      const { error } = await supabase.from('invoice_documents').insert({
        invoice_id: invoiceId,
        uploader_id: user.id,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        ipfs_cid: cid,
        document_hash: sha256,
        status: 'pending',
      });
      if (error) {
        throw new Error(`Failed to save the document record: ${error.message}`);
      }
      toast({ title: 'Document uploaded', description: 'The proof file is now pending lender verification.' });
      onUploaded();
    } catch (err: unknown) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={e => handleFile(e.target.files?.[0])}
        data-testid="document-file-input"
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700'
        } disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {uploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            Uploading to IPFS…
          </>
        ) : (
          <>
            <FileUp className="h-5 w-5" />
            Drag &amp; drop a PDF, JPG or PNG (max 10 MB), or click to browse
          </>
        )}
      </button>
    </div>
  );
}