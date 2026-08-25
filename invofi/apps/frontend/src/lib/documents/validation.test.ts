import { describe, expect, it } from 'vitest';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_MAX_SIZE_BYTES,
  validateDocumentFile,
} from './validation';

const makeFile = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: 'invoice.pdf',
  type: 'application/pdf',
  size: 1024,
  ...overrides,
});

describe('validateDocumentFile', () => {
  it('accepts PDF, JPG and PNG files under the size limit', () => {
    for (const type of ALLOWED_DOCUMENT_MIME_TYPES) {
      expect(validateDocumentFile(makeFile({ type, size: DOCUMENT_MAX_SIZE_BYTES }))).toEqual({ ok: true });
    }
  });

  it('rejects unsupported file types', () => {
    expect(validateDocumentFile(makeFile({ type: 'text/plain' }))).toEqual({
      ok: false,
      error: 'Only PDF, JPG and PNG files are accepted',
    });
    expect(validateDocumentFile(makeFile({ type: 'image/gif' }))).toEqual({
      ok: false,
      error: 'Only PDF, JPG and PNG files are accepted',
    });
  });

  it('rejects files over 10 MB', () => {
    expect(validateDocumentFile(makeFile({ size: DOCUMENT_MAX_SIZE_BYTES + 1 }))).toEqual({
      ok: false,
      error: 'File exceeds the 10 MB limit',
    });
  });

  it('rejects empty files', () => {
    expect(validateDocumentFile(makeFile({ size: 0 }))).toEqual({ ok: false, error: 'The file is empty' });
  });

  it('rejects files with an empty name', () => {
    expect(validateDocumentFile(makeFile({ name: '' }))).toEqual({ ok: false, error: 'File name is required' });
  });
});