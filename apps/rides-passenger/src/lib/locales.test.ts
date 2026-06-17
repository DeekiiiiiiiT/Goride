import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from './locales';

describe('locales', () => {
  it('defaults to en-GB', () => {
    expect(DEFAULT_LOCALE).toBe('en-GB');
  });

  it('validates supported locales', () => {
    expect(isSupportedLocale('en-GB')).toBe(true);
    expect(isSupportedLocale('es')).toBe(true);
    expect(isSupportedLocale('en-US')).toBe(false);
    expect(isSupportedLocale(null)).toBe(false);
  });

  it('falls back invalid stored values to en-GB', () => {
    expect(resolveLocale('garbage')).toBe('en-GB');
    expect(resolveLocale('es')).toBe('es');
  });

  it('lists at least en-GB and es', () => {
    const ids = SUPPORTED_LOCALES.map((l) => l.id);
    expect(ids).toContain('en-GB');
    expect(ids).toContain('es');
  });
});
