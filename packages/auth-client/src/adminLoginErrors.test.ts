import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ADMIN_INCORRECT_CREDENTIALS,
  DOMINION_ACCESS_DENIED_MESSAGE,
  adminPasswordFailureMessage,
  clearDominionAccessDenied,
  dominionAccessDeniedMessage,
  recordDominionAccessDenied,
} from './adminLoginErrors';

describe('dominion login copy', () => {
  const store = new Map<string, string>();

  afterEach(() => {
    store.clear();
    vi.unstubAllGlobals();
  });

  it('keeps the first failure generic', () => {
    expect(dominionAccessDeniedMessage(1)).toBe(ADMIN_INCORRECT_CREDENTIALS);
  });

  it('shows the owner hint after the second failure, without saying the password worked', () => {
    expect(dominionAccessDeniedMessage(2)).toBe(
      'Recently changed the owner account? Sign in with the new owner email.',
    );
    expect(dominionAccessDeniedMessage(2)).toBe(DOMINION_ACCESS_DENIED_MESSAGE);
    expect(DOMINION_ACCESS_DENIED_MESSAGE.toLowerCase()).not.toContain("doesn't have access");
  });

  it('counts every failure in this browser', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    clearDominionAccessDenied();
    expect(recordDominionAccessDenied()).toBe(1);
    expect(dominionAccessDeniedMessage(recordDominionAccessDenied())).toBe(
      DOMINION_ACCESS_DENIED_MESSAGE,
    );
  });

  it('shows attempts left once three or fewer remain', () => {
    expect(adminPasswordFailureMessage(4)).toBe(ADMIN_INCORRECT_CREDENTIALS);
    expect(adminPasswordFailureMessage(3)).toBe(
      'Incorrect credentials (3 attempts remaining before lockout)',
    );
    expect(adminPasswordFailureMessage(1)).toBe(
      'Incorrect credentials (1 attempt remaining before lockout)',
    );
    expect(adminPasswordFailureMessage(undefined)).toBe(ADMIN_INCORRECT_CREDENTIALS);
  });
});