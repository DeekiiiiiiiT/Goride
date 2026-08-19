/**
 * Diagnose partner merchant order queue vs DB rows.
 * Usage: node scripts/smoke-merchant-orders.mjs
 */
import { execSync } from 'node:child_process';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const EMAIL = 'seed-island-grill@roamrush.app';
const PASSWORD = 'RoamRushPartner2026!';
const MERCHANT_SLUG = 'island-grill';

function getApiKeys() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.SUPABASE_ANON_KEY?.trim()) {
    return {
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      anonKey: process.env.SUPABASE_ANON_KEY.trim(),
    };
  }
  const out = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  const serviceKey = parsed.keys?.find((k) => k.id === 'service_role' || k.name === 'service_role')?.api_key;
  const anonKey = parsed.keys?.find((k) => k.id === 'anon' || k.name === 'anon')?.api_key;
  if (!serviceKey || !anonKey) throw new Error('Could not read Supabase API keys');
  return { serviceKey, anonKey };
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

async function signIn(anonKey, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}): ${text}`);
  return body;
}

async function deliveryFetch(anonKey, accessToken, path) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delivery${path}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, text };
}

async function main() {
  const { serviceKey, anonKey } = getApiKeys();

  console.log('=== Island Grill merchant orders smoke ===\n');

  const merchants = await restDelivery(
    serviceKey,
    `merchants?slug=eq.${MERCHANT_SLUG}&select=id,slug,name,owner_id`,
  );
  const merchant = merchants?.[0];
  if (!merchant) throw new Error(`Merchant ${MERCHANT_SLUG} not found in DB`);
  console.log('DB merchant:', merchant.id, merchant.slug, merchant.name);

  const dbOrders = await restDelivery(
    serviceKey,
    `orders?merchant_id=eq.${merchant.id}&status=in.(placed,accepted,preparing,ready)&select=id,order_number,status,payment_method,payment_status,placed_at&order=placed_at.desc&limit=10`,
  );
  console.log(`\nDB active orders (placed/accepted/preparing/ready): ${dbOrders.length}`);
  for (const row of dbOrders) {
    console.log(
      `  - ${row.order_number} status=${row.status} payment=${row.payment_method}/${row.payment_status}`,
    );
  }

  const paidVisible = dbOrders.filter(
    (o) => !['wipay', 'paypal'].includes(String(o.payment_method)) || o.payment_status !== 'pending',
  );
  console.log(`\nDB orders visible to kitchen filter: ${paidVisible.length}`);

  const session = await signIn(anonKey, EMAIL, PASSWORD);
  console.log(`\nSigned in as ${EMAIL} (user ${session.user?.id})`);

  const profileRes = await deliveryFetch(anonKey, session.access_token, '/merchant/profile');
  console.log(`\nGET /merchant/profile → ${profileRes.status}`);
  if (profileRes.status !== 200) {
    console.log(profileRes.text);
    process.exit(1);
  }
  const profileMerchantId = profileRes.body?.merchant?.id;
  console.log('Profile merchant.id:', profileMerchantId);
  console.log('Profile merchant.slug:', profileRes.body?.merchant?.slug);
  console.log('Owner match:', profileMerchantId === merchant.id ? 'YES' : 'NO — MISMATCH');

  const ordersRes = await deliveryFetch(anonKey, session.access_token, '/merchant/orders');
  console.log(`\nGET /merchant/orders → ${ordersRes.status}`);
  if (ordersRes.status !== 200) {
    console.log(ordersRes.text);
    process.exit(1);
  }
  const apiOrders = ordersRes.body?.orders ?? [];
  console.log(`API active orders returned: ${apiOrders.length}`);
  for (const row of apiOrders) {
    console.log(`  - ${row.order_number} status=${row.status} payment=${row.payment_method}/${row.payment_status}`);
  }

  const apiPlaced = apiOrders.filter((o) => o.status === 'placed');
  const dbPlaced = paidVisible.filter((o) => o.status === 'placed');

  console.log('\n=== Summary ===');
  console.log(`DB placed (kitchen-visible): ${dbPlaced.length}`);
  console.log(`API placed (New tab):        ${apiPlaced.length}`);

  if (dbPlaced.length > 0 && apiPlaced.length === 0) {
    console.error('\nFAIL: DB has placed orders but API returned none.');
    process.exit(1);
  }

  if (profileMerchantId !== merchant.id) {
    console.error('\nFAIL: Partner profile merchant_id does not match Island Grill DB row.');
    process.exit(1);
  }

  console.log('\nPASS: Merchant orders API aligns with DB expectations.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
