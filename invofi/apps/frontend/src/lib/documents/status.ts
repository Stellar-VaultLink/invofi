/**
 * Invoice document verification status (issue #222).
 */

export const DOCUMENT_STATUSES = ['pending', 'verified', 'rejected'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'Pending',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** Tailwind badge classes, matching the app's other status color maps. */
export const DOCUMENT_STATUS_COLORS: Record<DocumentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  verified: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

/** Short human-readable size label, e.g. "1.2 MB" or "840 KB". */
export function formatDocumentSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}