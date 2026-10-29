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

/** Matches `20261028191804_places_plug_chips.sql` seed rows. */
const PLUG_CHIPS = [
  { chip: 'mechanic', placeType: 'mechanic_garage', label: 'Mechanics', mapLabel: 'Mechanic', icon: 'build', empty: 'No mechanics mapped near you yet', sort: 1 },
  { chip: 'parts_store', placeType: 'parts_store', label: 'Parts stores', mapLabel: 'Parts store', icon: 'settings', empty: 'No parts stores mapped near you yet', sort: 2 },
  { chip: 'fuel', placeType: 'gas_station', label: 'Fuel prices', mapLabel: 'Fuel station', icon: 'local_gas_station', empty: 'No fuel stations mapped near you yet', sort: 3 },
  { chip: 'tyre_air', placeType: 'tyre_shop', label: 'Tyres & air', mapLabel: 'Tyres & air', icon: 'tire_repair', empty: 'No tyre and air places mapped near you yet', sort: 4 },
  { chip: 'car_wash', placeType: 'car_wash', label: 'Car wash', mapLabel: 'Car wash', icon: 'local_car_wash', empty: 'No car washes mapped near you yet', sort: 5 },
  { chip: 'restroom', placeType: 'public_restroom', label: 'Restrooms', mapLabel: 'Restroom', icon: 'wc', empty: 'No restrooms mapped near you yet', sort: 6 },
  { chip: 'toll', placeType: 'toll_plaza', label: 'Tolls', mapLabel: 'Toll', icon: 'toll', empty: 'No tolls mapped near you yet', sort: 7 },
  { chip: 'roadside', placeType: 'roadside_assistance', label: 'Roadside help', mapLabel: 'Roadside help', icon: 'sos', empty: 'No roadside help mapped near you yet', sort: 8 },
];

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
      app_metadata: { provider: 'google', providers: ['google'], role, roles: [role] },
      user_metadata: { display_name: 'Test Driver', app: 'plug' },
    },
  };
}

/** Answer catalog and explorer calls inside the test. The app has no demo switch. */
export async function standIn(page: Page, options?: { role?: string; persist?: boolean; flagsOff?: boolean }) {
  const role = options?.role || 'explorer_user';
  const flags = options?.flagsOff
    ? Object.fromEntries(Object.keys(FLAGS).map((name) => [name, false]))
    : FLAGS;
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
    const fix = {
      coords: { latitude: 18.0128, longitude: -76.7967, accuracy: 12, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
      timestamp: Date.now(),
    };
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (ok) => ok(fix),
        watchPosition: (ok) => { ok(fix); return 1; },
        clearWatch: () => undefined,
      },
    });
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
    if (url.includes('/places/taxonomy')) {
      await route.fulfill({
        json: {
          groups: [{ code: '1', label: 'On site', colour: '#ffe6cc', sort: 1 }],
          categories: [{ code: '1.4', group_code: '1', slug: 'driver_facilities', label: 'Restroom', sort: 14 }],
          facilityTypes: [{ slug: 'restroom', category_code: '1.4', label: 'Restroom' }],
          plugChips: PLUG_CHIPS,
        },
      });
      return;
    }
    if (url.includes('/places/search')) {
      const facility = new URL(url).searchParams.get('facility');
      await route.fulfill({
        json: {
          results: facility === 'restroom'
            ? [
              { place_id: 'far-stop', display_name: 'Far restroom', place_name: 'Far Station', distance_m: 900, category_code: '1.4' },
              { place_id: 'near-stop', display_name: 'Near restroom', place_name: 'Near Station', distance_m: 80, category_code: '1.4' },
            ]
            : [],
        },
      });
      return;
    }
    if (url.includes('/places/')) {
      await route.fulfill({
        json: {
          place: {
            id: 'near-stop',
            name: 'Near Station',
            facilities: [{ id: 'fac-1', type: 'restroom', category: '1.4', label: 'Restroom' }],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { vehicles: [], places: [], parts: [] } });
  });

  await page.route('**/functions/v1/explorer/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/.*\/explorer/, '') || '/';
    const method = route.request().method();
    if (path === '/join' && method === 'POST') {
      await route.fulfill({ json: { ok: true, displayName: role === 'passenger' ? 'Test Driver' : null } });
      return;
    }
    if (path.startsWith('/flags')) {
      await route.fulfill({ json: { flags } });
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
    await route.fulfill({ json: { ok: true, vehicles, notifications: [], logs: [], pins, flags, reminders: [] } });
  });
}
