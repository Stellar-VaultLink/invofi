/**
 * Client-side helper for the invoice document upload route (issue #222).
 */

export interface UploadDocumentResult {
  cid: string;
  sha256: string;
}

/**
 * Uploads a document to IPFS (via the server-side Pinata route) and returns
 * the content address plus the SHA-256 hash of the file bytes.
 */
export async function uploadInvoiceDocument(file: File, invoiceId: string): Promise<UploadDocumentResult> {
  const body = new FormData();
  body.append('invoice_id', invoiceId);
  body.append('file', file);

  let response: Response;
  try {
    response = await fetch('/api/documents/upload', { method: 'POST', body });
  } catch {
    throw new Error('Network error while uploading the document. Please try again.');
  }

  const payload = (await response.json().catch(() => null)) as
    | (UploadDocumentResult & { error?: string })
    | null;

  if (!response.ok || !payload || payload.error || !payload.cid) {
    throw new Error(payload?.error ?? `Upload failed (HTTP ${response.status}).`);
  }
  return { cid: payload.cid, sha256: payload.sha256 };
}