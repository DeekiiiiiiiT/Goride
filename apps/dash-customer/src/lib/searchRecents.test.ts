import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecentSearches,
  getRecentSearches,
  pushRecentSearch,
  removeRecentSearch,
} from './searchRecents';

function stubLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      },
    },
  });
}

describe('search recents', () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it('starts empty with no fake seed terms', () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it('pushes most-recent first and dedupes case-insensitively', () => {
    pushRecentSearch('Pizza');
    pushRecentSearch('Jerk');
    expect(pushRecentSearch('pizza')).toEqual(['pizza', 'Jerk']);
  });

  it('caps at 8 terms', () => {
    for (let i = 1; i <= 10; i += 1) pushRecentSearch(`term ${i}`);
    expect(getRecentSearches()).toHaveLength(8);
    expect(getRecentSearches()[0]).toBe('term 10');
  });

  it('removes one term and clears all', () => {
    pushRecentSearch('Pizza');
    pushRecentSearch('Sushi');
    expect(removeRecentSearch('pizza')).toEqual(['Sushi']);
    expect(clearRecentSearches()).toEqual([]);
  });
});
