/**
 * Shared helpers for Roam Rush smoke scripts.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export const PROJECT_REF = 'csfllzzastacofsvcdsc';
export const SUPABASE_URL = `https://${PROJECT_REF}.supabase.co`;

export const SEED_CUSTOMER = {
  email: 'seed-customer@roamrush.app',
  password: 'RoamRushCustomer2026!',
  name: 'Rush Test Customer',
  phone: '+18765550888',
};

export const ISLAND_GRILL = {
  id: 'e31e6d88-ae1d-4ad2-a1ae-d14001f5d372',
  slug: 'island-grill',
  menuItemId: '30d77535-496b-40f4-aff0-5875e3c9574a', // Jerk Chicken Meal
};

export const DROP_OFF = {
  address: '12 Burke Rd, Spanish Town',
  lat: 18.015,
  lng: -76.955,
};

export function getApiKeys() {
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
  if (!serviceKey || !anonKey) throw new Error('Could not read Supabase API keys (log in: supabase login)');
  return { serviceKey, anonKey };
}

export async function signIn(anonKey, email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}): ${JSON.stringify(body)}`);
  return body.access_token;
}

export async function adminFetch(serviceKey, path, options = {}) {
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
  return { status: res.status, body, text };
}

export async function deliveryApi(anonKey, token, path, options = {}) {
  const headers = {
    apikey: anonKey,
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${SUPABASE_URL}/functions/v1/delivery${path}`, {
    ...options,
    headers,
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

export function assertOk(label, res, expected = 200) {
  if (res.status !== expected) {
    throw new Error(`${label} failed (${res.status}): ${res.text}`);
  }
  console.log(`✓ ${label}`);
  return res.body;
}

export function pass(message) {
  console.log(`\nPASS: ${message}`);
}

export async function placeCashOrder(anonKey, token, options = {}) {
  const merchantId = options.merchantId ?? ISLAND_GRILL.id;
  const menuItemId = options.menuItemId ?? ISLAND_GRILL.menuItemId;
  const idempotencyKey = options.idempotencyKey ?? `smoke-order-${randomUUID()}`;

  const res = await deliveryApi(anonKey, token, '/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      merchantId,
      items: [{ menuItemId, quantity: 1 }],
      paymentMethod: 'cash',
      deliveryAddress: DROP_OFF.address,
      deliveryLat: DROP_OFF.lat,
      deliveryLng: DROP_OFF.lng,
      customerName: SEED_CUSTOMER.name,
      phone: SEED_CUSTOMER.phone,
      tip: options.tip ?? 0,
    }),
  });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Place order failed (${res.status}): ${res.text}`);
  }

  const order = res.body?.order ?? res.body;
  return {
    orderId: String(order.id),
    orderNumber: String(order.order_number),
    order,
    idempotencyKey,
  };
}

export async function createConfirmedUser(serviceKey, email, password) {
  const create = await adminFetch(serviceKey, '/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: 'customer', surface: 'customer', name: 'Smoke Signup Test' },
      app_metadata: { role: 'customer', productLine: 'dash' },
    }),
  });
  if (create.status !== 200 && create.status !== 201) {
    throw new Error(`Admin create user failed (${create.status}): ${create.text}`);
  }
  return create.body;
}

export async function deleteUser(serviceKey, userId) {
  await adminFetch(serviceKey, `/auth/v1/admin/users/${userId}`, { method: 'DELETE' });
}
