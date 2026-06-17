import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNative: false,
  checkGeolocationGranted: vi.fn(),
  requestGeolocationPermission: vi.fn(),
  geolocationCheck: vi.fn(),
  geolocationRequest: vi.fn(),
  geolocationGetCurrentPosition: vi.fn(),
}));

vi.mock('@roam/types', () => ({
  isNativeCapacitorPlatform: () => mocks.isNative,
  checkGeolocationGranted: mocks.checkGeolocationGranted,
  requestGeolocationPermission: mocks.requestGeolocationPermission,
}));

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: {
    checkPermissions: mocks.geolocationCheck,
    requestPermissions: mocks.geolocationRequest,
    getCurrentPosition: mocks.geolocationGetCurrentPosition,
  },
}));

import {
  ensurePassengerLocationAccess,
  grantStateToStatusLabelKey,
  openPassengerAppSettings,
} from './passengerLocationAccess';

describe('passengerLocationAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isNative = false;
  });

  describe('grantStateToStatusLabelKey', () => {
    it('maps grant states to label keys', () => {
      expect(grantStateToStatusLabelKey('granted')).toBe('locationStatusGranted');
      expect(grantStateToStatusLabelKey('denied')).toBe('locationStatusDenied');
      expect(grantStateToStatusLabelKey('prompt')).toBe('locationStatusPrompt');
      expect(grantStateToStatusLabelKey('unsupported')).toBe('locationStatusUnsupported');
    });
  });

  describe('ensurePassengerLocationAccess (web)', () => {
    it('returns granted when already granted', async () => {
      mocks.checkGeolocationGranted.mockResolvedValue('granted');
      await expect(ensurePassengerLocationAccess()).resolves.toBe('granted');
      expect(mocks.requestGeolocationPermission).not.toHaveBeenCalled();
    });

    it('returns granted after successful request', async () => {
      mocks.checkGeolocationGranted.mockResolvedValue('prompt');
      mocks.requestGeolocationPermission.mockResolvedValue('granted');
      await expect(ensurePassengerLocationAccess()).resolves.toBe('granted');
    });

    it('returns denied_needs_settings when request denied', async () => {
      mocks.checkGeolocationGranted.mockResolvedValue('prompt');
      mocks.requestGeolocationPermission.mockResolvedValue('denied');
      await expect(ensurePassengerLocationAccess()).resolves.toBe('denied_needs_settings');
    });

    it('returns unsupported when geolocation unsupported', async () => {
      mocks.checkGeolocationGranted.mockResolvedValue('unsupported');
      await expect(ensurePassengerLocationAccess()).resolves.toBe('unsupported');
    });
  });

  describe('openPassengerAppSettings', () => {
    it('no-ops on web without throwing', async () => {
      mocks.isNative = false;
      await expect(openPassengerAppSettings()).resolves.toBeUndefined();
    });
  });
});
