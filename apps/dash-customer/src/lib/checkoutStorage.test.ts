import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCheckoutPreferences,
  hydratePreferredPaymentMethod,
  normalizePaymentMethodId,
  saveCheckoutPreferences,
} from './checkoutStorage';

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

describe('normalizePaymentMethodId', () => {
  it('keeps live rails', () => {
    expect(normalizePaymentMethodId('paypal')).toBe('paypal');
    expect(normalizePaymentMethodId('cash')).toBe('cash');
    expect(normalizePaymentMethodId('wipay')).toBe('wipay');
  });

  it('maps leftover fake card ids to WiPay', () => {
    expect(normalizePaymentMethodId('visa_1212')).toBe('wipay');
  });
});

describe('hydratePreferredPaymentMethod', () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it('writes the account default into local checkout prefs', () => {
    saveCheckoutPreferences({ paymentMethodId: 'wipay' });
    expect(hydratePreferredPaymentMethod('cash')).toBe('cash');
    expect(getCheckoutPreferences().paymentMethodId).toBe('cash');
  });
});
