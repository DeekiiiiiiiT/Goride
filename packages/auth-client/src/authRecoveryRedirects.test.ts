import { afterEach, describe, expect, it } from 'vitest';
import {
  AUTH_RECOVERY_REDIRECTS,
  recoveryRedirectForCurrentOrigin,
  recoveryRedirectForProduct,
  recoveryRedirectForSurface,
} from './authRecoveryRedirects';
import { isPasswordRecoveryUrl } from './supabaseRecovery';

describe('AUTH_RECOVERY_REDIRECTS', () => {
  it('maps each surface to the correct production URL', () => {
    expect(AUTH_RECOVERY_REDIRECTS.dominion).toBe('https://roamdominion.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.driver).toBe('https://roamdriver.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.rides).toBe('https://roam-s.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.courier).toBe('https://courier.roamdash.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.dash).toBe('https://roamdash.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.partner).toBe('https://partner.roamdash.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.haul).toBe('https://roamhaul.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.fleet).toBe('https://roamfleet.co/reset-password');
    expect(AUTH_RECOVERY_REDIRECTS.enterprise).toBe('https://roamenterprise.co/reset-password');
  });
});

describe('recoveryRedirectForSurface', () => {
  it('returns canonical URL regardless of environment', () => {
    expect(recoveryRedirectForSurface('driver')).toBe('https://roamdriver.co/reset-password');
    expect(recoveryRedirectForSurface('dash')).toBe('https://roamdash.co/reset-password');
  });
});

describe('recoveryRedirectForProduct', () => {
  it('maps product keys to recovery URLs', () => {
    expect(recoveryRedirectForProduct('courier')).toBe(AUTH_RECOVERY_REDIRECTS.courier);
    expect(recoveryRedirectForProduct('enterprise')).toBe(AUTH_RECOVERY_REDIRECTS.enterprise);
  });
});

describe('recoveryRedirectForCurrentOrigin', () => {
  it('falls back to dominion when window is undefined', () => {
    expect(recoveryRedirectForCurrentOrigin()).toBe(AUTH_RECOVERY_REDIRECTS.dominion);
  });
});

describe('isPasswordRecoveryUrl', () => {
  const original = globalThis.window;

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it('returns true on /reset-password path', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { pathname: '/reset-password', hash: '' },
      },
      configurable: true,
    });
    expect(isPasswordRecoveryUrl()).toBe(true);
  });

  it('returns true when hash has type=recovery', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { pathname: '/', hash: '#access_token=abc&type=recovery' },
      },
      configurable: true,
    });
    expect(isPasswordRecoveryUrl()).toBe(true);
  });

  it('returns false on normal pages', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: { pathname: '/login', hash: '' },
      },
      configurable: true,
    });
    expect(isPasswordRecoveryUrl()).toBe(false);
  });
});
