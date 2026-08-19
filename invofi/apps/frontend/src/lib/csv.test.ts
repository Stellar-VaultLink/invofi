import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadCsv, toCsv } from './csv';

describe('toCsv', () => {
  const columns = [
    { key: 'name' as const, header: 'Name' },
    { key: 'note' as const, header: 'Note' },
  ];

  it('writes headers and rows in the supplied column order', () => {
    expect(toCsv([{ name: 'Ada', note: 'Paid' }, { name: 'Lin', note: 'Pending' }], columns))
      .toBe('Name,Note\r\nAda,Paid\r\nLin,Pending');
  });

  it('emits a header row for an empty result set', () => {
    expect(toCsv([], columns)).toBe('Name,Note');
  });

  it('escapes commas, quotes, newlines, and missing values', () => {
    expect(toCsv([{ name: 'Ada, Inc.', note: 'Said "paid"\ntoday' }, { name: null, note: undefined }], columns))
      .toBe('Name,Note\r\n"Ada, Inc.","Said ""paid""\ntoday"\r\n,');
  });
});

describe('downloadCsv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('downloads then releases the generated object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:csv');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });

    downloadCsv('invoices.csv', 'Name\r\nAda');

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv');
    expect(document.querySelector('a')).toBeNull();
  });
});
