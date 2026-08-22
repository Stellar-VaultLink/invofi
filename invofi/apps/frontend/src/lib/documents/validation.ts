import { z } from 'zod';

/**
 * Invoice document upload constraints (issue #222).
 *
 * The same rules are enforced client-side (fast feedback), server-side on the
 * upload route (authoritative), and in the database CHECK constraints.
 */

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;
export type DocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const DOCUMENT_FILE_EXTENSIONS = ['PDF', 'JPG', 'PNG'] as const;

/** Zod schema for an uploaded document file. */
export const documentFileSchema = z.object({
  name: z.string().min(1, 'File name is required'),
  type: z.enum(ALLOWED_DOCUMENT_MIME_TYPES, {
    errorMap: () => ({ message: 'Only PDF, JPG and PNG files are accepted' }),
  }),
  size: z
    .number()
    .int()
    .positive('The file is empty')
    .max(DOCUMENT_MAX_SIZE_BYTES, 'File exceeds the 10 MB limit'),
});

export type DocumentFileInput = z.infer<typeof documentFileSchema>;

export interface DocumentFileValidationResult {
  ok: boolean;
  error?: string;
}

/** Validates an arbitrary file entry against the upload constraints. */
export function validateDocumentFile(file: {
  name: string;
  type: string;
  size: number;
}): DocumentFileValidationResult {
  const result = documentFileSchema.safeParse(file);
  if (result.success) return { ok: true };
  return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid file' };
}