import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { computeSha256Hex } from '@/lib/documents/hash';
import { fetchDocumentFromIpfs } from '@/lib/documents/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/documents/[id]/content
 *
 * Streams a stored invoice document's bytes from IPFS to an invoice party.
 *
 * Access control: the document row is only visible to the uploader/originator
 * and to lenders with an offer on the invoice (RLS on `invoice_documents`), so
 * a non-party lookup returns nothing here. The bytes are additionally
 * re-hashed on read and compared against the stored SHA-256 so a tampered or
 * corrupted IPFS object can never be served silently.
 */
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: document, error } = await supabase
    .from('invoice_documents')
    .select('id, invoice_id, file_name, mime_type, ipfs_cid, document_hash')
    .eq('id', params.id)
    .maybeSingle();

  // RLS hides rows from non-parties — return 404 for both "missing" and
  // "not authorized" so we don't leak which documents exist.
  if (error || !document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  let fetched;
  try {
    fetched = await fetchDocumentFromIpfs(document.ipfs_cid);
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load the document' },
      { status: 502 },
    );
  }

  const sha256 = await computeSha256Hex(fetched.buffer);
  if (sha256 !== document.document_hash) {
    return NextResponse.json(
      { error: 'Document hash mismatch — the file no longer matches its stored hash.' },
      { status: 409 },
    );
  }

  return new Response(new Uint8Array(fetched.buffer), {
    headers: {
      'Content-Type': document.mime_type,
      'Content-Disposition': `inline; filename="${document.file_name.replace(/["\\]/g, '')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}