import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_STATUS_COLORS,
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUSES,
  formatDocumentSize,
} from './status';

describe('document status metadata', () => {
  it('exposes exactly the three statuses from the issue', () => {
    expect(DOCUMENT_STATUSES).toEqual(['pending', 'verified', 'rejected']);
  });

  it('labels every status with a human-readable title', () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(DOCUMENT_STATUS_LABELS[status]).toBeTruthy();
      expect(DOCUMENT_STATUS_COLORS[status]).toMatch(/bg-.*-100 text-.*-800/);
    }
  });
});

describe('formatDocumentSize', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatDocumentSize(512)).toBe('512 B');
    expect(formatDocumentSize(2048)).toBe('2 KB');
    expect(formatDocumentSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatDocumentSize(5.5 * 1024 * 1024)).toBe('5.5 MB');
  });
});