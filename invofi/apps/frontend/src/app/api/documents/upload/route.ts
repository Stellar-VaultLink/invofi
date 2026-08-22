import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeSha256Hex } from '@/lib/documents/hash';
import {
  documentFileSchema,
  DOCUMENT_MAX_SIZE_BYTES,
} from '@/lib/documents/validation';
import { uploadBufferToPinata } from '@/lib/documents/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/documents/upload
 *
 * Pins an invoice proof file to IPFS via Pinata and returns the content
 * address plus the SHA-256 hash of the bytes. The caller (originator) then
 * mirrors the row into Supabase; RLS restricts that insert to the invoice's
 * originator.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const formData = await request.formData();
  const invoiceId = formData.get('invoice_id');
  const file = formData.get('file');

  if (typeof invoiceId !== 'string' || invoiceId.length === 0) {
    return NextResponse.json({ error: 'Missing invoice_id' }, { status: 400 });
  }
  if (!file || typeof file !== 'object' || !('arrayBuffer' in file) || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  const fileCheck = documentFileSchema.safeParse({
    name: file.name,
    type: file.type,
    size: file.size,
  });
  if (!fileCheck.success) {
    return NextResponse.json(
      { error: fileCheck.error.issues[0]?.message ?? 'Invalid file' },
      { status: 400 },
    );
  }

  // Only the invoice originator may attach proof documents.
  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .select('id')
    .eq('id', invoiceId)
    .eq('originator_id', user.id)
    .maybeSingle();
  if (invoiceError) {
    return NextResponse.json({ error: 'Failed to look up the invoice' }, { status: 500 });
  }
  if (!invoice) {
    return NextResponse.json(
      { error: 'Only the invoice originator can upload documents' },
      { status: 403 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
  }
  if (buffer.byteLength > DOCUMENT_MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'File exceeds the 10 MB limit' }, { status: 413 });
  }

  try {
    const sha256 = await computeSha256Hex(buffer);
    const { cid } = await uploadBufferToPinata(buffer, file.name);
    return NextResponse.json({ cid, sha256 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}