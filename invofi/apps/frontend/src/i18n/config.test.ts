import { describe, it, expect } from 'vitest';
import {
  defaultLocale,
  dirFor,
  isLocale,
  isRtl,
  localeNames,
  locales,
  negotiateLocale,
  rtlLocales,
} from './config';

describe('locale registry', () => {
  it('ships more than ten languages, including the three RTL scripts', () => {
    expect(locales.length).toBeGreaterThanOrEqual(10);
    expect(rtlLocales).toEqual(expect.arrayContaining(['ar', 'he', 'fa']));
  });

  it('has a native and English display name for every locale', () => {
    for (const locale of locales) {
      expect(localeNames[locale]?.native, locale).toBeTruthy();
      expect(localeNames[locale]?.english, locale).toBeTruthy();
    }
  });

  it('resolves text direction from the script, not the tag order', () => {
    expect(dirFor('ar')).toBe('rtl');
    expect(dirFor('he')).toBe('rtl');
    expect(dirFor('fa')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
    expect(dirFor('ja')).toBe('ltr');
    // An unknown tag must not throw, and must not claim to be RTL.
    expect(isRtl('klingon')).toBe(false);
    expect(dirFor('klingon')).toBe('ltr');
  });

  it('narrows unknown values', () => {
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('ar-EG')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('negotiateLocale', () => {
  it('falls back to English when the header is missing or unusable', () => {
    expect(negotiateLocale(null)).toBe(defaultLocale);
    expect(negotiateLocale('')).toBe(defaultLocale);
    expect(negotiateLocale('*')).toBe(defaultLocale);
    expect(negotiateLocale('kl,tlh')).toBe(defaultLocale);
  });

  it('picks an exact match', () => {
    expect(negotiateLocale('ar')).toBe('ar');
    expect(negotiateLocale('ja,en;q=0.8')).toBe('ja');
  });

  it('falls back from a regional tag to its base language', () => {
    expect(negotiateLocale('pt-BR,pt;q=0.9')).toBe('pt');
    expect(negotiateLocale('zh-Hans-CN')).toBe('zh');
    expect(negotiateLocale('ar-EG,en-US;q=0.5')).toBe('ar');
  });

  it('honours q-values rather than header order', () => {
    // Chrome sends the reader's real preference via q, not position.
    expect(negotiateLocale('en;q=0.2,he;q=0.9')).toBe('he');
    expect(negotiateLocale('de;q=0.1,fr;q=0.4,ko;q=0.9')).toBe('ko');
  });

  it('ignores q=0, which explicitly rejects a language', () => {
    expect(negotiateLocale('fa;q=0,en;q=0.5')).toBe('en');
  });

  it('skips unsupported languages instead of stopping at them', () => {
    expect(negotiateLocale('sv,no,ko')).toBe('ko');
  });
});
