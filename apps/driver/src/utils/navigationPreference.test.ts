import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_NAVIGATION_PROVIDER,
  NAVIGATION_PROVIDER_STORAGE_KEY,
  getNavigationProviderLabel,
  readNavigationProvider,
  writeNavigationProvider,
} from './navigationPreference';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('navigationPreference', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorageMock());
  });

  afterEach(() => {
    localStorage.removeItem(NAVIGATION_PROVIDER_STORAGE_KEY);
    vi.unstubAllGlobals();
  });

  it('returns default when storage is empty', () => {
    expect(readNavigationProvider()).toBe(DEFAULT_NAVIGATION_PROVIDER);
  });

  it('reads valid stored values', () => {
    localStorage.setItem(NAVIGATION_PROVIDER_STORAGE_KEY, 'waze');
    expect(readNavigationProvider()).toBe('waze');
  });

  it('falls back to default for invalid stored values', () => {
    localStorage.setItem(NAVIGATION_PROVIDER_STORAGE_KEY, 'apple_maps');
    expect(readNavigationProvider()).toBe(DEFAULT_NAVIGATION_PROVIDER);
  });

  it('writes valid provider values', () => {
    writeNavigationProvider('waze');
    expect(localStorage.getItem(NAVIGATION_PROVIDER_STORAGE_KEY)).toBe('waze');
  });

  it('returns human-readable labels', () => {
    expect(getNavigationProviderLabel('google_maps')).toBe('Google Maps');
    expect(getNavigationProviderLabel('waze')).toBe('Waze');
  });
});
