/**
 * Sets a known password on the Island Grill partner smoke-test account.
 * Usage: node scripts/provision-rush-partner-test.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const EMAIL = 'seed-island-grill@roamrush.app';
const PASSWORD = 'RoamRushPartner2026!';
const DISPLAY = 'Island Grill Partner';
const MERCHANT_SLUG = 'island-grill';

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
      role: 'merchant',
      name: DISPLAY,
      full_name: DISPLAY,
      surface: 'partner',
    },
    app_metadata: { role: 'merchant', productLine: 'dash' },
  };

  let user = await findUserByEmail(serviceKey, EMAIL);
  if (!user) {
    throw new Error(`Auth user ${EMAIL} not found — seed merchants may be missing`);
  }

  user = await adminFetch(serviceKey, `/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      ...payload,
      user_metadata: { ...(user.user_metadata ?? {}), ...payload.user_metadata },
      app_metadata: { ...(user.app_metadata ?? {}), ...payload.app_metadata },
    }),
  });
  console.log(`Updated auth user ${user.id}`);

  const merchants = await restDelivery(
    serviceKey,
    `merchants?slug=eq.${MERCHANT_SLUG}&select=id,slug,name,owner_id,is_active,is_accepting_orders,operational_status,verification_status,onboarding_status`,
  );
  const merchant = merchants?.[0];
  if (!merchant) throw new Error(`Merchant ${MERCHANT_SLUG} not found`);

  await restDelivery(serviceKey, `merchants?id=eq.${merchant.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      owner_id: user.id,
      is_active: true,
      is_accepting_orders: true,
      operational_status: 'active',
      verification_status: 'approved',
      onboarding_status: 'submitted',
      updated_at: new Date().toISOString(),
    }),
  });
  console.log(`Linked ${merchant.name} (${merchant.slug}) to partner login`);

  console.log('\nREADY');
  console.log(`Email: ${EMAIL}`);
  console.log(`Password: ${PASSWORD}`);
  console.log(`Restaurant: ${merchant.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
