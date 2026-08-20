import { describe, expect, it, beforeEach, vi } from 'vitest';
import { shouldShowGoLiveScreen } from './go-live';

describe('shouldShowGoLiveScreen', () => {
  const merchant = {
    id: 'm1',
    verification_status: 'approved' as const,
    verified_at: '2026-08-01T00:00:00.000Z',
    is_accepting_orders: false,
  };

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    });
  });

  it('shows the gate for an approved restaurant that is not live yet', () => {
    expect(shouldShowGoLiveScreen(merchant)).toBe(true);
  });

  it('skips the gate when the restaurant is already accepting orders', () => {
    expect(shouldShowGoLiveScreen({ ...merchant, is_accepting_orders: true })).toBe(false);
  });
});
