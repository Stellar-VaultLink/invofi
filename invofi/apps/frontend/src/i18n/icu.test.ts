import { describe, it, expect } from 'vitest';
import { icuArguments, assertIcuValid, IcuSyntaxError } from './icu';

describe('icuArguments', () => {
  it('finds simple arguments', () => {
    expect([...icuArguments('Invoice {id} was cancelled.')]).toEqual(['id']);
    expect([...icuArguments('{repaid} repaid · {remaining} remaining')]).toEqual([
      'repaid',
      'remaining',
    ]);
    expect([...icuArguments('No placeholders here.')]).toEqual([]);
  });

  it('does not mistake plural branch text for arguments', () => {
    // The braces around "no active positions" delimit literal text. A regex
    // scan reports a phantom `no` here.
    const message =
      'Accruing across {count, plural, =0 {no active positions} one {# active position} other {# active positions}}';
    expect([...icuArguments(message)]).toEqual(['count']);
  });

  it('does not mistake a one-word branch for an argument', () => {
    // `one {day}` looks character-for-character like `{amount}` to a regex.
    expect([...icuArguments('{count, plural, one {day} other {days}}')]).toEqual(['count']);
  });

  it('finds arguments nested inside plural branches', () => {
    const message = '{count, plural, one {{name} has one invoice} other {{name} has # invoices}}';
    expect([...icuArguments(message)].sort()).toEqual(['count', 'name']);
  });

  it('handles typed arguments and select', () => {
    expect([...icuArguments('Due {date, date, medium}')]).toEqual(['date']);
    expect([...icuArguments('{role, select, lender {Lender} other {Business}}')]).toEqual(['role']);
  });

  it('respects ICU apostrophe escaping', () => {
    expect([...icuArguments("Use '{'literal'}' braces with {real}")]).toEqual(['real']);
  });
});

describe('assertIcuValid', () => {
  it('accepts well-formed messages', () => {
    expect(() => assertIcuValid('{count, plural, one {# day} other {# days}}')).not.toThrow();
    expect(() =>
      assertIcuValid(
        '{count, plural, zero {لا مراكز} one {مركز} two {مركزان} few {# مراكز} many {# مركزًا} other {# مركز}}',
      ),
    ).not.toThrow();
  });

  it('rejects an unbalanced brace', () => {
    expect(() => assertIcuValid('Invoice {id was cancelled')).toThrow(IcuSyntaxError);
    expect(() => assertIcuValid('Invoice {id} }')).toThrow(IcuSyntaxError);
  });

  it('rejects a plural with no catch-all branch', () => {
    // A translator who enumerates only `one` and `two` renders nothing for
    // every other count.
    expect(() => assertIcuValid('{count, plural, one {# day} two {# days}}')).toThrow(
      /no 'other' branch/,
    );
  });

  it('rejects a branch with no body', () => {
    expect(() => assertIcuValid('{count, plural, other}')).toThrow(IcuSyntaxError);
  });
});
