import { expect, test, type Locator } from '@playwright/test';

const TYPES = [
  { slug: 'gas_station', label: 'Gas station', fence: 150 },
  { slug: 'mechanic_garage', label: 'Mechanic garage', fence: 50 },
  { slug: 'parts_store', label: 'Parts store', fence: 50 },
  { slug: 'tyre_shop', label: 'Tyre shop', fence: 50 },
  { slug: 'car_wash', label: 'Car wash', fence: 50 },
  { slug: 'public_restroom', label: 'Public restroom', fence: 50 },
  { slug: 'roadside_assistance', label: 'Roadside assistance', fence: 50 },
  { slug: 'toll_plaza', label: 'Toll plaza', fence: 200 },
];

async function dropPin(dialog: Locator) {
  const map = dialog.locator('.leaflet-container');
  await map.waitFor();
  const box = await map.boundingBox();
  if (!box) throw new Error('Map is not on screen');
  await map.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(dialog.getByText('Parish boundary is derived automatically from the pin coordinate.')).toBeVisible();
}

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
    aal: 'aal2',
    sub: '11111111-1111-4111-8111-111111111111',
    role: 'authenticated',
    exp: 4_000_000_000,
    app_metadata: { role: 'platform_owner' },
  })}.sig`;
}

test.beforeEach(async ({ page }) => {
  const access = token();
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'owner@example.com',
    app_metadata: { role: 'platform_owner' },
    user_metadata: {},
  };
  const session = {
    access_token: access,
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  await page.addInitScript((stored) => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify(stored));
  }, session);

  await page.route('**/auth/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/factors')) {
      await route.fulfill({ json: { all: [], totp: [], phone: [] } });
      return;
    }
    await route.fulfill({ json: session });
  });

  await page.route('**/functions/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/admin/taxonomy')) {
      await route.fulfill({
        json: {
          groups: [{ code: '1', label: 'Road', colour: '#ffe6cc', sort: 1 }],
          categories: [{ code: '1.1', group_code: '1', label: 'Fuel', sort: 1 }],
          placeTypes: TYPES.map((row) => ({
            slug: row.slug,
            category_code: '1.1',
            label: row.label,
            default_geofence_m: row.fence,
            default_facilities: [],
            match_profile: 'none',
            attribute_schema: null,
          })),
          facilityTypes: [],
          brands: [],
        },
      });
      return;
    }
    if (url.includes('/admin/register/nearby')) {
      const type = new URL(url).searchParams.get('type');
      await route.fulfill({
        json: {
          duplicates: type === 'gas_station'
            ? [{ id: 'dup-1', name: 'Existing station', distance_m: 40 }]
            : [],
        },
      });
      return;
    }
    if (url.includes('/admin/register')) {
      await route.fulfill({ json: { rows: [], total: 0, place: null, id: 'new-1' } });
      return;
    }
    if (url.includes('petrojam-prices')) {
      await route.fulfill({ json: { refineries: [] } });
      return;
    }
    if (url.includes('/admin/prices')) {
      await route.fulfill({ json: { items: [], review: 0, overview: {} } });
      return;
    }
    await route.fulfill({ json: {} });
  });
});

test('register blocks verify until the checklist is clear', async ({ page }) => {
  await page.goto('/?page=places-register');
  await page.getByRole('button', { name: 'Add a place' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a place' });
  const typeSelect = dialog.getByRole('combobox', { name: /^Place type/ });
  const verify = dialog.getByRole('button', { name: 'Save and verify' });

  for (const row of TYPES) {
    await typeSelect.selectOption(row.label);
    await expect(verify).toBeDisabled();
  }

  await typeSelect.selectOption('Gas station');
  await dialog.getByRole('textbox', { name: 'Place name *' }).fill('New station');
  await expect(verify).toBeDisabled();
  await dropPin(dialog);
  await expect(verify).toBeEnabled();
  await verify.click();
  await expect(dialog.getByText('A place of this type is already inside the geofence.')).toBeVisible();

  await page.goto('/?page=fuel-price-engine');
  await expect(page.getByRole('heading', { name: 'Price Engine' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Review/ })).toBeVisible();

  await page.goto('/?page=places-register');
  await page.getByRole('button', { name: 'Add a place' }).click();
  const again = page.getByRole('dialog', { name: 'Add a place' });
  await again.getByRole('combobox', { name: /^Place type/ }).selectOption('Mechanic garage');
  await again.getByRole('textbox', { name: 'Place name *' }).fill('New garage');
  await dropPin(again);
  await expect(again.getByRole('button', { name: 'Save and verify' })).toBeEnabled();
  await again.getByRole('button', { name: 'Save and verify' }).click();
  await expect(again).toBeHidden();
});
