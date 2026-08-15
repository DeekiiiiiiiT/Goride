import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const thenTrap = vi.fn(() => {
  throw new Error('"Geolocation.then()" is not implemented on android');
});

const geo = {
  checkPermissions: vi.fn(async () => ({ location: 'granted' })),
  requestPermissions: vi.fn(async () => ({ location: 'granted' })),
  getCurrentPosition: vi.fn(async () => ({
    coords: { latitude: 18.0, longitude: -77.0 },
  })),
};

vi.mock('@capacitor/geolocation', () => ({
  Geolocation: new Proxy(geo, {
    get(target, prop, receiver) {
      if (prop === 'then') thenTrap();
      return Reflect.get(target, prop, receiver);
    },
  }),
}));

import {
  checkGeolocationGranted,
  requestGeolocationPermission,
} from '@roam/types';

describe('native geolocation thenable (ROAM-DRIVER-1)', () => {
  beforeEach(() => {
    thenTrap.mockClear();
    geo.checkPermissions.mockClear();
    geo.requestPermissions.mockClear();
    geo.getCurrentPosition.mockClear();
    vi.stubGlobal('window', {
      Capacitor: { isNativePlatform: () => true },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not unwrap the Capacitor plugin as a Promise when checking permission', async () => {
    await expect(checkGeolocationGranted()).resolves.toBe('granted');
    expect(thenTrap).not.toHaveBeenCalled();
    expect(geo.checkPermissions).toHaveBeenCalledOnce();
  });

  it('does not unwrap the plugin when requesting permission', async () => {
    await expect(requestGeolocationPermission()).resolves.toBe('granted');
    expect(thenTrap).not.toHaveBeenCalled();
    expect(geo.requestPermissions).toHaveBeenCalledOnce();
  });
});
