import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  rememberGoLiveComplete,
  shouldShowGoLiveScreen,
} from './go-live';

describe('shouldShowGoLiveScreen', () => {
  const store = new Map<string, string>();

  const merchant = {
    id: 'm1',
    verification_status: 'approved' as const,
    verified_at: '2026-08-01T00:00:00.000Z',
    is_accepting_orders: false,
  };

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => store.clear(),
    });
  });

  it('shows the gate for an approved restaurant that is not live yet', () => {
    expect(shouldShowGoLiveScreen(merchant)).toBe(true);
  });

  it('skips the gate when the restaurant is already accepting orders', () => {
    expect(shouldShowGoLiveScreen({ ...merchant, is_accepting_orders: true })).toBe(false);
  });

  it('does not reopen the gate after pause once go-live was remembered', () => {
    rememberGoLiveComplete(merchant.id);
    expect(shouldShowGoLiveScreen({ ...merchant, is_accepting_orders: false })).toBe(false);
  });
});
