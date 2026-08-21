/**
 * Shared helpers for Roam Rush smoke scripts.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    // Spinner / box-drawing noise from interactive CLI
    .replace(/[│┃┊┊◑◐◓◒⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g, '');
}

function keysFromPayload(parsed) {
  const list = Array.isArray(parsed) ? parsed : parsed?.keys;
  if (!Array.isArray(list)) return null;
  const serviceKey = list.find((k) => k.id === 'service_role' || k.name === 'service_role')?.api_key;
  const anonKey = list.find((k) => k.id === 'anon' || k.name === 'anon')?.api_key;
  if (!serviceKey || !anonKey) return null;
  return { serviceKey, anonKey };
}

function parseApiKeysJson(out) {
  const cleaned = stripAnsi(out).trim();
  // CLI may return `{ "keys": [...] }` or a bare `[...]` depending on -o json.
  const objStart = cleaned.indexOf('{');
  const arrStart = cleaned.indexOf('[');
  let jsonText = '';
  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    const end = cleaned.lastIndexOf('}');
    if (end > objStart) jsonText = cleaned.slice(objStart, end + 1);
  } else if (arrStart >= 0) {
    const end = cleaned.lastIndexOf(']');
    if (end > arrStart) jsonText = cleaned.slice(arrStart, end + 1);
  }
  if (!jsonText) {
    throw new Error(`Could not find API keys JSON in CLI output: ${cleaned.slice(0, 200)}`);
  }
  const parsed = JSON.parse(jsonText);
  const keys = keysFromPayload(parsed);
  if (!keys) throw new Error('Could not read Supabase API keys (log in: supabase login)');
  return keys;
}

function readCachedApiKeys() {
  try {
    const cachePath = fileURLToPath(new URL('./.api-keys.cache.json', import.meta.url));
    const raw = readFileSync(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.anonKey && parsed?.serviceKey && parsed?.projectRef === PROJECT_REF) {
      return { anonKey: parsed.anonKey, serviceKey: parsed.serviceKey };
    }
  } catch {
    /* no cache */
  }
  return null;
}

function writeCachedApiKeys(keys) {
  try {
    const cachePath = fileURLToPath(new URL('./.api-keys.cache.json', import.meta.url));
    writeFileSync(
      cachePath,
      JSON.stringify({ projectRef: PROJECT_REF, anonKey: keys.anonKey, serviceKey: keys.serviceKey }, null, 0),
      'utf8',
    );
  } catch {
    /* best-effort cache */
  }
}

/** Fetch keys once; prefer env so pack runners avoid Windows CLI telemetry file locks. */
export function getApiKeys() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() && process.env.SUPABASE_ANON_KEY?.trim()) {
    return {
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
      anonKey: process.env.SUPABASE_ANON_KEY.trim(),
    };
  }

  const cached = readCachedApiKeys();
  if (cached) return cached;

  // Windows: interactive spinner / telemetry EPERM break JSON parsing. Force plain CLI.
  let lastErr;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const out = execSync(
        `npx supabase projects api-keys --project-ref ${PROJECT_REF} -o json`,
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          env: {
            ...process.env,
            CI: '1',
            NO_COLOR: '1',
            FORCE_COLOR: '0',
            TERM: 'dumb',
          },
        },
      );
      const keys = parseApiKeysJson(out);
      writeCachedApiKeys(keys);
      return keys;
    } catch (e) {
      // CLI often prints valid JSON then exits non-zero on telemetry rename — use stdout if present.
      const maybeOut = `${e?.stdout || ''}${e?.stderr || ''}`;
      if (/"api_key"|"keys"/.test(maybeOut)) {
        try {
          const keys = parseApiKeysJson(maybeOut);
          writeCachedApiKeys(keys);
          return keys;
        } catch {
          /* fall through to retry */
        }
      }
      lastErr = e;
      if (attempt === 4) break;
      const waitMs = 400 * attempt;
      const until = Date.now() + waitMs;
      while (Date.now() < until) {
        /* sync backoff */
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
