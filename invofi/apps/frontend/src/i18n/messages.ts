import { defaultLocale, type Locale } from './config';

type MessageTree = { [key: string]: string | MessageTree };

/**
 * Deep-merges a translation file over the English baseline.
 *
 * Translations arrive incrementally — a contributor may land 40 of 300 keys
 * for a new language. Without a merge, next-intl reports every absent key and
 * the UI shows raw key names. Merging means a partial file renders translated
 * where it can and English where it cannot, which is what makes the
 * contribution workflow in `docs/i18n.md` safe to open up.
 */
function mergeMessages(base: MessageTree, override: MessageTree): MessageTree {
  const merged: MessageTree = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      typeof value === 'object' && value !== null && typeof existing === 'object' && existing !== null
        ? mergeMessages(existing, value)
        : value;
  }
  return merged;
}

/** Loads `messages/<locale>.json`, backfilled with English. */
export async function loadMessages(locale: Locale): Promise<MessageTree> {
  const base = (await import('../../messages/en.json')).default as MessageTree;
  if (locale === defaultLocale) return base;

  try {
    const translated = (await import(`../../messages/${locale}.json`)).default as MessageTree;
    return mergeMessages(base, translated);
  } catch {
    // A locale listed in config.ts without a messages file still renders,
    // in English, rather than throwing on every request.
    return base;
  }
}
