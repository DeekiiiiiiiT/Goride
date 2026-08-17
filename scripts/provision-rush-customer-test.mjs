/**
 * Creates / refreshes the Roam Rush customer smoke-test account.
 * Usage: node scripts/provision-rush-customer-test.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const EMAIL = 'seed-customer@roamrush.app';
const PASSWORD = 'RoamRushCustomer2026!';
const DISPLAY = 'Rush Test Customer';
const PHONE = '+18765550888';
const HOME = {
  id: 'home-seed',
  label: 'home',
  line1: '12 Burke Rd',
  city: 'Spanish Town',
  isDefault: true,
  lat: 18.015,
  lng: -76.955,
};

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
    phone: PHONE,
    phone_confirm: true,
    user_metadata: {
      role: 'customer',
      name: DISPLAY,
      full_name: DISPLAY,
      first_name: 'Rush',
      last_name: 'Customer',
      phone: PHONE,
      surface: 'customer',
    },
    app_metadata: { role: 'customer', productLine: 'dash' },
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

  const row = {
    user_id: user.id,
    name: DISPLAY,
    phone: PHONE,
    email: EMAIL,
    default_address: `${HOME.line1}, ${HOME.city}`,
    default_lat: HOME.lat,
    default_lng: HOME.lng,
    saved_addresses: [HOME],
    account_status: 'active',
    updated_at: new Date().toISOString(),
  };

  const existing = await restDelivery(
    serviceKey,
    `customers?user_id=eq.${user.id}&select=id`,
  );
  if (existing?.[0]?.id) {
    await restDelivery(serviceKey, `customers?id=eq.${existing[0].id}`, {
      method: 'PATCH',
      body: JSON.stringify(row),
    });
    console.log('Updated customers');
  } else {
    await restDelivery(serviceKey, 'customers', {
      method: 'POST',
      body: JSON.stringify(row),
    });
    console.log('Inserted customers');
  }

  console.log('\nREADY');
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Address: ${HOME.line1}, ${HOME.city}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
