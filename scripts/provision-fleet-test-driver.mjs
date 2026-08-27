/**
 * One-off: provision a FLEET test driver under Deeki T's org (not independent).
 * Usage: node scripts/provision-fleet-test-driver.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

/** Deeki T / deekiiiiiii@gmail.com — organizations.id === owner_id */
const FLEET_ORG_ID = '8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823';

const ACCOUNT = {
  email: 'deekiiiiiii+fleet.test.driver@gmail.com',
  password: 'RoamFleetTest2026!',
  displayName: 'Fleet Test Driver',
  firstName: 'Fleet',
  lastName: 'Test',
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

async function upsertAuthUser(serviceKey) {
  const payload = {
    email: ACCOUNT.email,
    password: ACCOUNT.password,
    email_confirm: true,
    user_metadata: {
      role: 'driver',
      name: ACCOUNT.displayName,
      first_name: ACCOUNT.firstName,
      last_name: ACCOUNT.lastName,
      surface: 'driver',
    },
    app_metadata: {
      role: 'driver',
      organizationId: FLEET_ORG_ID,
    },
  };

  const existing = await findUserByEmail(serviceKey, ACCOUNT.email);
  if (existing) {
    return adminFetch(serviceKey, `/auth/v1/admin/users/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        user_metadata: { ...(existing.user_metadata ?? {}), ...payload.user_metadata },
        app_metadata: { ...(existing.app_metadata ?? {}), ...payload.app_metadata },
      }),
    });
  }

  return adminFetch(serviceKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function upsertFleetDriverProfile(serviceKey, userId) {
  const now = new Date().toISOString();
  const existing = await restFetch(
    serviceKey,
    `driver_profiles?user_id=eq.${userId}&select=id`,
  );
  const profileRow = {
    user_id: userId,
    mode: 'fleet',
    fleet_id: FLEET_ORG_ID,
    fleet_joined_at: now,
    status: 'active',
    display_name: ACCOUNT.displayName,
    first_name: ACCOUNT.firstName,
    last_name: ACCOUNT.lastName,
    phone: '+18765550999',
    onboarding_complete: true,
    onboarding_step: null,
    gender: 'other',
    date_of_birth: '1992-06-15',
    updated_at: now,
  };

  if (existing?.[0]?.id) {
    await restFetch(serviceKey, `driver_profiles?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(profileRow),
    });
  } else {
    await restFetch(serviceKey, 'driver_profiles', {
      method: 'POST',
      body: JSON.stringify({ ...profileRow, created_at: now }),
    });
  }
}

async function upsertFleetDriverKv(serviceKey, userId) {
  const record = {
    id: userId,
    driverId: userId,
    name: ACCOUNT.displayName,
    email: ACCOUNT.email,
    phone: '+18765550999',
    status: 'active',
    organizationId: FLEET_ORG_ID,
    productLine: 'fleet',
  };
  await restFetch(serviceKey, 'kv_store_37f42386', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ key: `driver:${userId}`, value: record }),
  });
}

async function main() {
  const serviceKey = getServiceRoleKey();
  console.log('Provisioning FLEET test driver under Deeki T org...\n');

  const user = await upsertAuthUser(serviceKey);
  const userId = user.id ?? user.user?.id;
  if (!userId) throw new Error('Auth user missing id');

  await upsertFleetDriverProfile(serviceKey, userId);
  await upsertFleetDriverKv(serviceKey, userId);

  console.log('OK — fleet driver ready\n');
  console.log(`Email:    ${ACCOUNT.email}`);
  console.log(`Password: ${ACCOUNT.password}`);
  console.log(`User ID:  ${userId}`);
  console.log(`Fleet:    deekiiiiiii's Fleet (${FLEET_ORG_ID})`);
  console.log('\nIn Fleet app: assign a vehicle (and Active gas card if testing Gas Card Fill).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
