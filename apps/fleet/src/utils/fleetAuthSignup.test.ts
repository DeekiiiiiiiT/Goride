/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { FLEET_NATIVE_AUTH_CALLBACK, fleetSignupRedirectUrl } from './fleetAuthSignup';

describe('fleetSignupRedirectUrl', () => {
  afterEach(() => {
    delete (window as Window & { Capacitor?: unknown }).Capacitor;
  });

  it('returns the website signup page in a browser', () => {
    expect(fleetSignupRedirectUrl()).toBe(`${window.location.origin}/signup`);
  });

  it('returns the Play app login link inside the Android app', () => {
    (window as Window & { Capacitor?: { isNativePlatform: () => boolean } }).Capacitor = {
      isNativePlatform: () => true,
    };
    expect(fleetSignupRedirectUrl()).toBe(FLEET_NATIVE_AUTH_CALLBACK);
  });
});
