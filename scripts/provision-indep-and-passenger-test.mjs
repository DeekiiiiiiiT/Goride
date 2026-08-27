/**
 * Provision independent driver + passenger test accounts.
 * Usage: node scripts/provision-indep-and-passenger-test.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

const ACCOUNTS = {
  independentDriver: {
    email: 'deekiiiiiii+indep.test.driver@gmail.com',
    password: 'RoamIndepTest2026!',
    displayName: 'Indep Test Driver',
    firstName: 'Indep',
    lastName: 'Test',
    role: 'driver',
  },
  passenger: {
    email: 'deekiiiiiii+test.passenger@gmail.com',
    password: 'RoamPassengerTest2026!',
    displayName: 'Test Passenger',
    firstName: 'Test',
    lastName: 'Passenger',
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

async function upsertAuthUser(serviceKey, account) {
  const payload = {
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: {
      role: account.role,
      name: account.displayName,
      first_name: account.firstName,
      last_name: account.lastName,
      surface: account.role === 'passenger' ? 'passenger' : 'driver',
    },
    app_metadata: { role: account.role },
  };

  const existing = await findUserByEmail(serviceKey, account.email);
  if (existing) {
    const data = await adminFetch(serviceKey, `/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        user_metadata: { ...(existing.user_metadata ?? {}), ...payload.user_metadata },
        app_metadata: { ...(existing.app_metadata ?? {}), ...payload.app_metadata },
      }),
    });
    return data.id ? data : { ...data, id: existing.id };
  }

  return adminFetch(serviceKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function provisionIndependentDriver(serviceKey, userId, account) {
  const existing = await restFetch(serviceKey, `driver_profiles?user_id=eq.${userId}&select=id`);
  const profileRow = {
    user_id: userId,
    mode: 'independent',
    fleet_id: null,
    fleet_joined_at: null,
    status: 'active',
    display_name: account.displayName,
    first_name: account.firstName,
    last_name: account.lastName,
    phone: '+18765550111',
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
    make: 'Honda',
    model: 'Civic',
    year: 2019,
    color: 'Silver',
    license_plate: 'INDEP-001',
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

  // Independent drivers still get a KV mirror for fleet-shared tools that key by driver:{id}
  await restFetch(serviceKey, 'kv_store_37f42386', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      key: `driver:${userId}`,
      value: {
        id: userId,
        driverId: userId,
        name: account.displayName,
        email: account.email,
        phone: '+18765550111',
        status: 'active',
        productLine: 'independent',
      },
    }),
  });
}

async function provisionPassenger(serviceKey, userId, account) {
  const existing = await restFetch(
    serviceKey,
    `rides_rider_profiles?user_id=eq.${userId}&select=id`,
  );
  const row = {
    user_id: userId,
    display_name: account.displayName,
    phone: '+18765550222',
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
  console.log('Provisioning independent driver + passenger...\n');

  const driverUser = await upsertAuthUser(serviceKey, ACCOUNTS.independentDriver);
  const driverId = driverUser.id ?? driverUser.user?.id;
  if (!driverId) throw new Error('Independent driver missing id');
  await provisionIndependentDriver(serviceKey, driverId, ACCOUNTS.independentDriver);

  const passengerUser = await upsertAuthUser(serviceKey, ACCOUNTS.passenger);
  const passengerId = passengerUser.id ?? passengerUser.user?.id;
  if (!passengerId) throw new Error('Passenger missing id');
  await provisionPassenger(serviceKey, passengerId, ACCOUNTS.passenger);

  console.log('INDEPENDENT DRIVER');
  console.log(`Email:    ${ACCOUNTS.independentDriver.email}`);
  console.log(`Password: ${ACCOUNTS.independentDriver.password}`);
  console.log(`User ID:  ${driverId}\n`);

  console.log('PASSENGER');
  console.log(`Email:    ${ACCOUNTS.passenger.email}`);
  console.log(`Password: ${ACCOUNTS.passenger.password}`);
  console.log(`User ID:  ${passengerId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
