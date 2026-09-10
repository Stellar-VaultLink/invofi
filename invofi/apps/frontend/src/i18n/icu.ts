/**
 * A minimal ICU MessageFormat reader (issue #227).
 *
 * Only two questions need answering about a catalogue entry, and both are
 * asked by `src/i18n/messages.test.ts`:
 *
 *   1. which arguments does this message expect?
 *   2. is its structure well-formed?
 *
 * A regex cannot answer either. In
 * `{count, plural, =0 {no active positions} other {# positions}}` the inner
 * braces delimit *literal text*, not arguments — a naive scan reports a
 * phantom `no` placeholder, and a one-word branch like `one {day}` looks
 * exactly like `{amount}`. Distinguishing them requires knowing whether a
 * given `{` sits in argument position or inside a plural branch, which is
 * what this walker tracks.
 *
 * This is deliberately not a general ICU implementation — rendering is
 * next-intl's job. It is a structural reader for the catalogue tests.
 */

const SUBMESSAGE_TYPES = new Set(['plural', 'select', 'selectordinal']);
const IDENT = /[A-Za-z0-9_]/;

export class IcuSyntaxError extends Error {}

interface Cursor {
  text: string;
  i: number;
}

function skipSpace(c: Cursor): void {
  while (c.i < c.text.length && /\s/.test(c.text[c.i])) c.i += 1;
}

function readIdent(c: Cursor): string {
  const start = c.i;
  while (c.i < c.text.length && IDENT.test(c.text[c.i])) c.i += 1;
  return c.text.slice(start, c.i);
}

/** Reads a message body up to its closing `}` (or end of input at depth 0). */
function readMessage(c: Cursor, names: Set<string>, depth: number): void {
  while (c.i < c.text.length) {
    const ch = c.text[c.i];

    if (ch === '}') {
      if (depth === 0) throw new IcuSyntaxError(`unexpected '}' at ${c.i}`);
      return;
    }

    if (ch === "'") {
      // ICU apostrophe escaping: '{' and '}' are literal, '' is an apostrophe.
      c.i += 1;
      if (c.text[c.i] === "'") { c.i += 1; continue; }
      while (c.i < c.text.length && c.text[c.i] !== "'") c.i += 1;
      c.i += 1;
      continue;
    }

    if (ch !== '{') { c.i += 1; continue; }

    // ── Argument ──
    c.i += 1;
    skipSpace(c);
    const name = readIdent(c);
    if (!name) throw new IcuSyntaxError(`argument with no name at ${c.i}`);
    names.add(name);
    skipSpace(c);

    if (c.text[c.i] === '}') { c.i += 1; continue; }
    if (c.text[c.i] !== ',') throw new IcuSyntaxError(`expected ',' or '}' after {${name}`);

    c.i += 1;
    skipSpace(c);
    const type = readIdent(c);
    skipSpace(c);

    if (!SUBMESSAGE_TYPES.has(type)) {
      // number / date / time / a bare style — skip to the matching brace.
      let open = 1;
      while (c.i < c.text.length && open > 0) {
        if (c.text[c.i] === '{') open += 1;
        else if (c.text[c.i] === '}') open -= 1;
        c.i += 1;
      }
      if (open > 0) throw new IcuSyntaxError(`unclosed {${name}`);
      continue;
    }

    // ── plural / select: a sequence of `key {submessage}` ──
    if (c.text[c.i] !== ',') throw new IcuSyntaxError(`expected ',' after ${type}`);
    c.i += 1;

    const branches: string[] = [];
    for (;;) {
      skipSpace(c);
      if (c.text[c.i] === '}') { c.i += 1; break; }
      if (c.i >= c.text.length) throw new IcuSyntaxError(`unclosed ${type} for {${name}`);

      // `offset:1` is a plural modifier, not a branch.
      if (c.text.startsWith('offset:', c.i)) {
        c.i += 'offset:'.length;
        readIdent(c);
        continue;
      }

      const exact = c.text[c.i] === '=';
      if (exact) c.i += 1;
      const key = readIdent(c);
      if (!key) throw new IcuSyntaxError(`empty ${type} branch key for {${name}`);
      branches.push(exact ? `=${key}` : key);

      skipSpace(c);
      if (c.text[c.i] !== '{') throw new IcuSyntaxError(`branch '${key}' has no body`);
      c.i += 1;
      readMessage(c, names, depth + 1);   // branch bodies are messages
      if (c.text[c.i] !== '}') throw new IcuSyntaxError(`unclosed branch '${key}'`);
      c.i += 1;
    }

    // Every plural/select needs a catch-all, or a count the translator did not
    // enumerate renders nothing at all.
    if (!branches.includes('other')) {
      throw new IcuSyntaxError(`${type} for {${name}} has no 'other' branch`);
    }
  }
}

/** Argument names a message expects, e.g. `{amount}` and `{count, plural, …}`. */
export function icuArguments(message: string): Set<string> {
  const names = new Set<string>();
  readMessage({ text: message, i: 0 }, names, 0);
  return names;
}

/** Throws `IcuSyntaxError` if the message is not structurally well-formed. */
export function assertIcuValid(message: string): void {
  icuArguments(message);
}
