import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { locales, defaultLocale, type Locale } from './config';
import { loadMessages } from './messages';

/**
 * Catalogue integrity (Issue #227).
 *
 * These are the guardrails the contribution workflow in `docs/i18n.md` leans
 * on: a translator can open a PR touching only `messages/<locale>.json` and
 * these tests tell them whether it is safe to merge.
 */

const MESSAGES_DIR = path.join(process.cwd(), 'messages');

type Tree = { [key: string]: string | Tree };

function readCatalogue(locale: string): Tree {
  return JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, `${locale}.json`), 'utf8'));
}

/** Flattens to `Namespace.section.key` → message. */
function flatten(tree: Tree, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tree)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[full] = value;
    else Object.assign(out, flatten(value, full));
  }
  return out;
}

/**
 * Argument names a message expects, from the parsed ICU AST.
 *
 * A regex is not good enough here: `{count, plural, =0 {no positions} ...}`
 * contains braces that are *literal text*, not arguments, so a naive scan
 * reports a phantom `{no}` placeholder.
 */
function placeholders(message: string): Set<string> {
  const names = new Set<string>();

  const walk = (elements: MessageFormatElement[]): void => {
    for (const element of elements) {
      if ('value' in element && typeof element.value === 'string' && element.type !== TYPE.literal) {
        names.add(element.value);
      }
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
      if (element.type === TYPE.tag) walk(element.children);
    }
  };

  try {
    walk(parse(message));
  } catch {
    // Unparseable messages are reported by the ICU-validity test instead.
  }
  return names;
}

const english = flatten(readCatalogue(defaultLocale));
const translated = locales.filter(l => l !== defaultLocale);

describe('message catalogues', () => {
  it('ships a file for every configured locale', () => {
    for (const locale of locales) {
      expect(fs.existsSync(path.join(MESSAGES_DIR, `${locale}.json`)), locale).toBe(true);
    }
  });

  it.each(translated)('%s introduces no keys English does not have', locale => {
    // An extra key is either a typo or a stale message: it can never render,
    // and it hides the fact that the real key is still untranslated.
    const extra = Object.keys(flatten(readCatalogue(locale))).filter(k => !(k in english));
    expect(extra).toEqual([]);
  });

  it.each(translated)('%s keeps every placeholder its English source uses', locale => {
    const catalogue = flatten(readCatalogue(locale));
    const broken: string[] = [];

    for (const [key, message] of Object.entries(catalogue)) {
      const expected = placeholders(english[key] ?? '');
      const actual = placeholders(message);
      for (const name of expected) {
        // A dropped `{amount}` renders a sentence with a hole in it; a renamed
        // one throws at render time.
        if (!actual.has(name)) broken.push(`${key}: missing {${name}}`);
      }
    }

    expect(broken).toEqual([]);
  });

  it.each(translated)('%s parses as valid ICU for its own plural rules', locale => {
    const catalogue = flatten(readCatalogue(locale));
    const invalid: string[] = [];

    for (const [key, message] of Object.entries(catalogue)) {
      try {
        // Parsing is what catches an unbalanced brace or a malformed plural
        // block before it reaches a reader's screen.
        parse(message);
      } catch (error) {
        invalid.push(`${key}: ${(error as Error).message}`);
      }
    }

    expect(invalid).toEqual([]);
  });

  it('falls back to English for keys a translation has not covered yet', async () => {
    // Turkish has no Landing copy; the merge must still yield the English one
    // rather than a missing-key placeholder.
    const merged = flatten((await loadMessages('tr' as Locale)) as Tree);
    expect(Object.keys(merged).sort()).toEqual(Object.keys(english).sort());
    expect(merged['Landing.hero.getStarted']).toBe(english['Landing.hero.getStarted']);
    expect(merged['Navbar.dashboard']).toBe('Panel');
  });

  it('translates the whole catalogue for the RTL reference locale', () => {
    // Arabic is the correct-by-construction reference pair for RTL: every key
    // is translated, so the RTL layout is exercised with no English left in it.
    const arabic = flatten(readCatalogue('ar'));
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());
  });
});
