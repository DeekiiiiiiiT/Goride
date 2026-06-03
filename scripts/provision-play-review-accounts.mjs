/**
 * Creates Google Play reviewer test accounts (driver + rider).
 * Usage: node scripts/provision-play-review-accounts.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

const ACCOUNTS = {
  driver: {
    email: 'deekiiiiiii+roam.driver.review@gmail.com',
    password: 'RoamPlay2026!Driver',
    displayName: 'Play Store Driver',
    role: 'driver',
  },
  rider: {
    email: 'deekiiiiiii+roam.rider.review@gmail.com',
    password: 'RoamPlay2026!Rider',
    displayName: 'Play Store Rider',
    role: 'passenger',
  },
};

function getServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  }
  const out = execSync(`supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .replace(/\r/g, '')
    .replace(/\s+/g, ' ');
  const match = out.match(/service_role \| (eyJ[\w.-]+)/);
  if (!match?.[1]) throw new Error('Could not read service_role key from Supabase CLI');
  return match[1].trim();
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
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed (${res.status}): ${text}`);
  }
  return body;
}

async function findUserByEmail(serviceKey, email) {
  let page = 1;
  while (page <= 20) {
    const data = await adminFetch(
      serviceKey,
      `/auth/v1/admin/users?page=${page}&per_page=200`,
    );
    const users = data.users ?? [];
    const hit = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function upsertAuthUser(serviceKey, account) {
  const { email, password, role, displayName } = account;
  const payload = {
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role,
      name: displayName,
      first_name: 'Play',
      last_name: role === 'driver' ? 'Driver' : 'Rider',
      surface: role === 'passenger' ? 'passenger' : 'driver',
    },
    app_metadata: { role },
  };

  const existing = await findUserByEmail(serviceKey, email);
  if (existing) {
    const data = await adminFetch(serviceKey, `/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        user_metadata: { ...(existing.user_metadata ?? {}), ...payload.user_metadata },
        app_metadata: { ...(existing.app_metadata ?? {}), ...payload.app_metadata },
      }),
    });
    return data;
  }

  return adminFetch(serviceKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function restFetch(serviceKey, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(options.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`REST ${path} failed (${res.status}): ${text}`);
  }
  return body;
}

async function provisionDriver(serviceKey, userId, displayName) {
  const existing = await restFetch(
    serviceKey,
    `driver_profiles?user_id=eq.${userId}&select=id`,
  );
  const profileRow = {
    user_id: userId,
    mode: 'independent',
    fleet_id: null,
    status: 'active',
    display_name: displayName,
    first_name: 'Play',
    last_name: 'Driver',
    phone: '+18765550100',
    onboarding_complete: true,
    onboarding_step: null,
    gender: 'other',
    date_of_birth: '1990-01-15',
  };

  let profileId = existing?.[0]?.id;
  if (profileId) {
    await restFetch(serviceKey, `driver_profiles?id=eq.${profileId}`, {
      method: 'PATCH',
      body: JSON.stringify(profileRow),
    });
  } else {
    const inserted = await restFetch(serviceKey, 'driver_profiles', {
      method: 'POST',
      body: JSON.stringify(profileRow),
    });
    profileId = inserted[0].id;
  }

  const vehicles = await restFetch(
    serviceKey,
    `driver_vehicles?driver_profile_id=eq.${profileId}&is_primary=eq.true&select=id`,
  );
  const vehicleRow = {
    driver_profile_id: profileId,
    make: 'Toyota',
    model: 'Corolla',
    year: 2020,
    color: 'White',
    license_plate: 'PLAY-001',
    ownership_type: 'owned',
    is_primary: true,
    status: 'active',
    body_type: 'Sedan',
  };

  if (vehicles?.[0]?.id) {
    await restFetch(serviceKey, `driver_vehicles?id=eq.${vehicles[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(vehicleRow),
    });
  } else {
    await restFetch(serviceKey, 'driver_vehicles', {
      method: 'POST',
      body: JSON.stringify(vehicleRow),
    });
  }
}

async function provisionRider(serviceKey, userId, displayName) {
  const existing = await restFetch(
    serviceKey,
    `rides_rider_profiles?user_id=eq.${userId}&select=id`,
  );
  const row = {
    user_id: userId,
    display_name: displayName,
    phone: '+18765550200',
    account_status: 'active',
  };

  if (existing?.[0]?.id) {
    await restFetch(serviceKey, `rides_rider_profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    });
  } else {
    await restFetch(serviceKey, 'rides_rider_profiles', {
      method: 'POST',
      body: JSON.stringify(row),
    });
  }
}

async function main() {
  const serviceKey = getServiceRoleKey();
  console.log('Provisioning Play Store review accounts...\n');

  const driverUser = await upsertAuthUser(serviceKey, ACCOUNTS.driver);
  await provisionDriver(serviceKey, driverUser.id, ACCOUNTS.driver.displayName);
  console.log(`Driver OK: ${ACCOUNTS.driver.email}`);

  const riderUser = await upsertAuthUser(serviceKey, ACCOUNTS.rider);
  await provisionRider(serviceKey, riderUser.id, ACCOUNTS.rider.displayName);
  console.log(`Rider OK: ${ACCOUNTS.rider.email}`);

  console.log('\n--- Paste into Play Console → App access ---\n');
  console.log('ROAM DRIVER:');
  console.log(`Email: ${ACCOUNTS.driver.email}`);
  console.log(`Password: ${ACCOUNTS.driver.password}`);
  console.log('Steps: Open app → Sign in → Email → enter credentials → tap go online.\n');
  console.log('ROAM RIDES:');
  console.log(`Email: ${ACCOUNTS.rider.email}`);
  console.log(`Password: ${ACCOUNTS.rider.password}`);
  console.log('Steps: Open app → Sign in → Email → enter credentials → book a ride.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
