import type { Page } from '@playwright/test';

const FLAGS = {
  'plug.explore': true,
  'plug.fuel_log': true,
  'plug.garage': true,
  'plug.parts': true,
  'plug.map_it': true,
  'plug.tolls': true,
  'plug.documents': true,
};

export const PLUG_SUPPLIED_NAMES = ['Total Half Way Tree', 'Portmore'];
export const PLUG_SUPPLIED_PRICES = [210];
export const PLUG_SUPPLIED_CLOCKS: string[] = [];
export const PLUG_SUPPLIED_STREETS: string[] = [];
export const PLUG_SUPPLIED_ENGINES: string[] = [];
export const PLUG_SUPPLIED_CHASSIS: string[] = [];

const STATION = {
  id: 'st_live',
  name: 'Total Half Way Tree',
  brand: 'Total',
  lat: 18.0128,
  lng: -76.7967,
  prices: { e10_87: 210 },
};

function sessionBody(role = 'explorer_user') {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: 'test-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: 'test-refresh',
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      phone: '+18765550199',
      email: 'driver@example.com',
      app_metadata: { provider: 'phone', providers: ['phone'], role, roles: [role] },
      user_metadata: { display_name: 'Test Driver', app: 'plug' },
    },
  };
}

/** Answer catalog and explorer calls inside the test. The app has no demo switch. */
export async function standIn(page: Page, options?: { role?: string; persist?: boolean }) {
  const role = options?.role || 'explorer_user';
  if (options?.persist) {
    await page.addInitScript((session) => {
      localStorage.setItem('sb-example-auth-plug', JSON.stringify(session));
    }, sessionBody(role));
  }
  const vehicles: Array<Record<string, unknown>> = [];
  const pins: Array<Record<string, unknown>> = [];
  await page.addInitScript(() => {
    sessionStorage.setItem('plug-lat', '18.0128');
    sessionStorage.setItem('plug-lng', '-76.7967');
    sessionStorage.setItem('plug-accuracy', '12');
    sessionStorage.setItem('plug-pin-lat', '18.0128');
    sessionStorage.setItem('plug-pin-lng', '-76.7967');
  });
  await page.context().grantPermissions(['geolocation']);
  await page.context().setGeolocation({ latitude: 18.0128, longitude: -76.7967, accuracy: 12 });

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/logout')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }
    if (url.includes('/otp') && !url.includes('/verify')) {
      await route.fulfill({ json: {} });
      return;
    }
    await route.fulfill({ json: sessionBody(role) });
  });

  await page.route('**/platform-catalog/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/stations')) {
      await route.fulfill({ json: { stations: [STATION], station: STATION } });
      return;
    }
    if (url.includes('/tolls')) {
      await route.fulfill({ json: { plazas: [{ id: 'plaza-1', name: 'Portmore', highway: 'Highway 2000' }] } });
      return;
    }
    if (url.includes('/geo/parishes')) {
      await route.fulfill({ json: { areas: [{ pcode: 'JM-SA', name: 'St Andrew' }] } });
      return;
    }
    if (url.includes('/parts')) {
      await route.fulfill({ json: { parts: [{ part_id: 'p1', name: 'Brake pads', category: 'Brakes', tier: 1 }], comingSoon: false } });
      return;
    }
    if (url.includes('/vehicle-catalog')) {
      await route.fulfill({ json: { vehicles: [{ id: 'var-1', make: 'Toyota', model: 'Roomy', year: 2019 }] } });
      return;
    }
    if (url.includes('/schedules')) {
      await route.fulfill({ json: { tasks: [{ name: 'Oil change', op_code: 'oil' }] } });
      return;
    }
    await route.fulfill({ json: { vehicles: [], places: [], parts: [] } });
  });

  await page.route('**/functions/v1/explorer/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/.*\/explorer/, '') || '/';
    const method = route.request().method();
    if (path.startsWith('/flags')) {
      await route.fulfill({ json: { flags: FLAGS } });
      return;
    }
    if (path.startsWith('/garage') || path === '/vehicles' && method === 'GET') {
      await route.fulfill({ json: { vehicles } });
      return;
    }
    if (path.startsWith('/vehicles') && method === 'POST') {
      const vehicle = { id: 'car-1', nickname: '2019 Toyota Roomy', make: 'Toyota', model: 'Roomy', year: 2019 };
      vehicles.splice(0, vehicles.length, vehicle);
      await route.fulfill({ json: { vehicle } });
      return;
    }
    if (path.startsWith('/pins') && method === 'POST') {
      const pin = { id: 'pin-1', placeId: 'pin-1', name: 'Test place', status: 'pending' };
      pins.push(pin);
      await route.fulfill({ json: pin });
      return;
    }
    if (path.includes('/me/export')) {
      await route.fulfill({
        json: {
          profile: [{ display_name: 'Test Driver', created_at: '2026-01-15T00:00:00.000Z' }],
          fuel_log: [],
          user_vehicle: vehicles,
        },
      });
      return;
    }
    if (path.startsWith('/contributions')) {
      await route.fulfill({ json: { pins, level: {}, trust: {} } });
      return;
    }
    await route.fulfill({ json: { ok: true, vehicles, notifications: [], logs: [], pins, flags: FLAGS, reminders: [] } });
  });
}
