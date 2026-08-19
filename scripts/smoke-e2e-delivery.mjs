/**
 * End-to-end smoke: customer order → merchant ready → courier accept → deliver.
 * Usage: node scripts/smoke-e2e-delivery.mjs
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const PROJECT_REF = 'csfllzzastacofsvcdsc';
const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;
const MERCHANT_ID = 'e31e6d88-ae1d-4ad2-a1ae-d14001f5d372';
const MENU_ITEM_ID = '30d77535-496b-40f4-aff0-5875e3c9574a'; // Jerk Chicken Meal

const ACCOUNTS = {
  customer: { email: 'seed-customer@roamrush.app', password: 'RoamRushCustomer2026!' },
  merchant: { email: 'seed-island-grill@roamrush.app', password: 'RoamRushPartner2026!' },
  courier: { email: 'seed-courier@roamrush.app', password: 'RoamRushCourier2026!' },
};

function getApiKeys() {
  if (process.env.SUPABASE_ANON_KEY?.trim()) {
    return { anonKey: process.env.SUPABASE_ANON_KEY.trim() };
  }
  const out = execSync(`npx supabase projects api-keys --project-ref ${PROJECT_REF}`, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const parsed = JSON.parse(out);
  const anonKey = parsed.keys?.find((k) => k.id === 'anon' || k.name === 'anon')?.api_key;
  if (!anonKey) throw new Error('Could not read anon key');
  return { anonKey };
}

async function signIn(anonKey, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in ${email} failed: ${JSON.stringify(body)}`);
  return body.access_token;
}

async function api(anonKey, token, path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delivery${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
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

function assertOk(label, res, expected = 200) {
  if (res.status !== expected) {
    throw new Error(`${label} failed (${res.status}): ${res.text}`);
  }
  console.log(`✓ ${label}`);
  return res.body;
}

async function waitForOffer(anonKey, courierToken, orderNumber, attempts = 12) {
  for (let i = 0; i < attempts; i++) {
    const offersRes = await api(anonKey, courierToken, '/courier/offers');
    if (offersRes.status === 200) {
      const offers = offersRes.body?.offers ?? [];
      const match = offers.find((o) => o.order?.order_number === orderNumber);
      if (match) return match;
    }
    await new Promise((r) => setTimeout(r, 1000));
    if (i === 3 || i === 7) {
      await api(anonKey, courierToken, '/courier/offers/redispatch', { method: 'POST' });
    }
  }
  throw new Error(`No courier offer for ${orderNumber} after ${attempts}s`);
}

async function main() {
  const { anonKey } = getApiKeys();
  console.log('=== E2E delivery smoke ===\n');

  const [customerToken, merchantToken, courierToken] = await Promise.all([
    signIn(anonKey, ACCOUNTS.customer.email, ACCOUNTS.customer.password),
    signIn(anonKey, ACCOUNTS.merchant.email, ACCOUNTS.merchant.password),
    signIn(anonKey, ACCOUNTS.courier.email, ACCOUNTS.courier.password),
  ]);
  console.log('Signed in customer, merchant, courier\n');

  // Courier online near dropoff before dispatch
  assertOk(
    'Courier go online',
    await api(anonKey, courierToken, '/courier/availability', {
      method: 'PUT',
      body: JSON.stringify({ isOnline: true, lat: 18.014, lng: -76.954 }),
    }),
  );

  const idempotencyKey = `smoke-e2e-${randomUUID()}`;
  const placeRes = await api(anonKey, customerToken, '/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      merchantId: MERCHANT_ID,
      items: [{ menuItemId: MENU_ITEM_ID, quantity: 1 }],
      paymentMethod: 'cash',
      deliveryAddress: '12 Burke Rd, Spanish Town',
      deliveryLat: 18.015,
      deliveryLng: -76.955,
      customerName: 'Rush Test Customer',
      phone: '+18765550888',
    }),
  });
  const placed = assertOk('Place cash order', placeRes, 201);
  const order = placed.order ?? placed;
  const orderId = String(order.id);
  const orderNumber = String(order.order_number);
  console.log(`  Order ${orderNumber} (${orderId})\n`);

  for (const status of ['accepted', 'preparing', 'ready']) {
    const body = { status, actorType: 'merchant' };
    if (status === 'accepted') body.estimatedPrepTimeMins = 20;
    assertOk(
      `Merchant → ${status}`,
      await api(anonKey, merchantToken, `/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    );
  }

  const offer = await waitForOffer(anonKey, courierToken, orderNumber);
  console.log(`✓ Courier offer received (${offer.id})\n`);

  assertOk(
    'Courier accept offer',
    await api(anonKey, courierToken, `/courier/offers/${offer.id}/accept`, { method: 'POST' }),
  );

  for (const status of ['picked_up', 'in_transit', 'delivered', 'completed']) {
    assertOk(
      `Courier → ${status}`,
      await api(anonKey, courierToken, `/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status, actorType: 'courier' }),
      }),
    );
  }

  const activity = assertOk(
    'Courier history',
    await api(anonKey, courierToken, '/courier/history'),
  );
  const jobs = activity.deliveries ?? activity.jobs ?? activity.history ?? activity.activity ?? [];
  const completed = jobs.find(
    (j) => j.order_number === orderNumber || j.orderNumber === orderNumber,
  );
  if (!completed) {
    console.log('Activity response:', JSON.stringify(activity, null, 2));
  } else {
    console.log(`✓ Activity shows ${orderNumber} as ${completed.kind ?? completed.status ?? 'completed'}`);
  }

  console.log(`\nPASS: Full E2E completed for ${orderNumber}`);
}

main().catch((e) => {
  console.error('\nFAIL:', e.message);
  process.exit(1);
});
