/**
 * Creates / refreshes the Roam Rush courier smoke-test account.
 * Usage: node scripts/provision-rush-courier-test.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const EMAIL = 'seed-courier@roamrush.app';
const PASSWORD = 'RoamRushCourier2026!';
const DISPLAY = 'Rush Test Courier';

function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const out = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  const key = parsed.keys?.find((k) => k.id === 'service_role' || k.name === 'service_role')?.api_key;
  if (!key) throw new Error('Could not read service_role key from Supabase CLI');
  return key;
}

async function adminFetch(serviceKey, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  return body;
}

async function restDelivery(serviceKey, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Accept-Profile': 'delivery',
      'Content-Profile': 'delivery',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`REST ${path} failed (${res.status}): ${text}`);
  return body;
}

async function findUserByEmail(serviceKey, email) {
  let page = 1;
  while (page <= 20) {
    const data = await adminFetch(serviceKey, `/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = data.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function main() {
  const serviceKey = getServiceRoleKey();
  const payload = {
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: 'courier',
      name: DISPLAY,
      full_name: DISPLAY,
      surface: 'courier',
    },
    app_metadata: { role: 'courier', productLine: 'dash' },
  };

  let user = await findUserByEmail(serviceKey, EMAIL);
  if (user) {
    user = await adminFetch(serviceKey, `/auth/v1/admin/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        user_metadata: { ...(user.user_metadata ?? {}), ...payload.user_metadata },
        app_metadata: { ...(user.app_metadata ?? {}), ...payload.app_metadata },
      }),
    });
    console.log(`Updated auth user ${user.id}`);
  } else {
    user = await adminFetch(serviceKey, '/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    console.log(`Created auth user ${user.id}`);
  }

  const profile = {
    user_id: user.id,
    email: EMAIL,
    display_name: DISPLAY,
    phone: '+18765550999',
    status: 'active',
    onboarding_complete: true,
    vehicle_type: 'motorcycle',
    background_check_status: 'approved',
    documents_verified_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    rating: 4.9,
    total_deliveries: 12,
    acceptance_rate_pct: 98,
    completion_rate_pct: 99,
    updated_at: new Date().toISOString(),
  };

  const existing = await restDelivery(
    serviceKey,
    `courier_profiles?user_id=eq.${user.id}&select=user_id`,
  );
  if (existing?.[0]?.user_id) {
    await restDelivery(serviceKey, `courier_profiles?user_id=eq.${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify(profile),
    });
    console.log('Updated courier_profiles');
  } else {
    await restDelivery(serviceKey, 'courier_profiles', {
      method: 'POST',
      body: JSON.stringify(profile),
    });
    console.log('Inserted courier_profiles');
  }

  const vehicles = await restDelivery(
    serviceKey,
    `courier_vehicles?user_id=eq.${user.id}&select=id`,
  );
  const vehicle = {
    user_id: user.id,
    make: 'Honda',
    model: 'PCX',
    year: 2022,
    color: 'Green',
    license_plate: 'RUSH-TEST',
    vehicle_type: 'motorcycle',
    is_primary: true,
    status: 'active',
    updated_at: new Date().toISOString(),
  };
  if (vehicles?.[0]?.id) {
    await restDelivery(serviceKey, `courier_vehicles?id=eq.${vehicles[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(vehicle),
    });
    console.log('Updated courier_vehicles');
  } else {
    await restDelivery(serviceKey, 'courier_vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicle),
    });
    console.log('Inserted courier_vehicles');
  }

  console.log('\nREADY');
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
