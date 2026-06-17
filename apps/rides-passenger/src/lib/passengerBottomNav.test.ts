import { describe, expect, it } from 'vitest';
import { shouldHidePassengerBottomNav } from './passengerBottomNav';

describe('shouldHidePassengerBottomNav', () => {
  it('hides nav on focused booking flows', () => {
    expect(shouldHidePassengerBottomNav('/services/haulage')).toBe(true);
    expect(shouldHidePassengerBottomNav('/services/haulage/confirmed')).toBe(true);
    expect(shouldHidePassengerBottomNav('/services/schedule')).toBe(true);
    expect(shouldHidePassengerBottomNav('/services/schedule/confirmed')).toBe(true);
    expect(shouldHidePassengerBottomNav('/services/book-for-someone')).toBe(true);
  });

  it('keeps nav on hub and tab screens', () => {
    expect(shouldHidePassengerBottomNav('/')).toBe(false);
    expect(shouldHidePassengerBottomNav('/services')).toBe(false);
    expect(shouldHidePassengerBottomNav('/services/book-for-others')).toBe(false);
    expect(shouldHidePassengerBottomNav('/account')).toBe(false);
    expect(shouldHidePassengerBottomNav('/activity')).toBe(false);
  });
});
