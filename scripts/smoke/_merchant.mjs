/**
 * Shared helpers for Roam Rush Partner (merchant) smoke scripts.
 */
import { randomUUID } from 'node:crypto';
import {
  ISLAND_GRILL,
  SEED_CUSTOMER,
  SUPABASE_URL,
  assertOk,
  deliveryApi,
  getApiKeys,
  placeCashOrder,
  signIn,
} from './_shared.mjs';

export const SEED_MERCHANT = {
  email: 'seed-island-grill@roamrush.app',
  password: 'RoamRushPartner2026!',
};

export { ISLAND_GRILL };

export async function signInMerchant(anonKey) {
  return signIn(anonKey, SEED_MERCHANT.email, SEED_MERCHANT.password);
}

export async function signInCustomer(anonKey) {
  return signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);
}

export async function getMerchantProfile(anonKey, token) {
  const body = assertOk(
    'GET /merchant/profile',
    await deliveryApi(anonKey, token, '/merchant/profile'),
  );
  const merchant = body?.merchant;
  if (!merchant?.id) throw new Error('Profile missing merchant.id');
  return merchant;
}

export async function listMerchantOrders(anonKey, token) {
  const body = assertOk(
    'GET /merchant/orders',
    await deliveryApi(anonKey, token, '/merchant/orders'),
  );
  return body?.orders ?? [];
}

export async function updateOrderStatus(anonKey, token, orderId, status) {
  const payload = { status, actorType: 'merchant' };
  if (status === 'accepted') payload.estimatedPrepTimeMins = 20;
  assertOk(
    `PUT /orders/${orderId}/status → ${status}`,
    await deliveryApi(anonKey, token, `/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  );
}

export async function advanceMerchantOrder(anonKey, token, orderId, targetStatus) {
  const flow = ['placed', 'accepted', 'preparing', 'ready'];
  const targetIdx = flow.indexOf(targetStatus);
  if (targetIdx < 0) throw new Error(`Unknown target status: ${targetStatus}`);

  let orders = await listMerchantOrders(anonKey, token);
  let row = orders.find((o) => o.id === orderId);
  if (!row) {
    const res = await deliveryApi(anonKey, token, `/orders/${orderId}`);
    if (res.status !== 200) throw new Error(`Order ${orderId} not found`);
    row = res.body?.order ?? res.body;
  }

  let status = String(row.status);
  while (flow.indexOf(status) < targetIdx) {
    const next = flow[flow.indexOf(status) + 1];
    await updateOrderStatus(anonKey, token, orderId, next);
    status = next;
  }
  return status;
}

/** Place a cash order as customer, then wait until it appears in partner queue. */
export async function preparePlacedOrder(anonKey, merchantToken, customerToken, { timeoutMs = 45000 } = {}) {
  const placed = await placeCashOrder(anonKey, customerToken, {
    idempotencyKey: `smoke-merchant-${randomUUID()}`,
  });
  const orderId = placed.orderId;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const orders = await listMerchantOrders(anonKey, merchantToken);
    if (orders.some((o) => o.id === orderId)) return { orderId, placed };
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Order ${orderId} never appeared in merchant queue within ${timeoutMs}ms`);
}

export async function setAcceptingOrders(anonKey, token, merchantId, isAccepting) {
  assertOk(
    `PUT /merchants/${merchantId} is_accepting_orders=${isAccepting}`,
    await deliveryApi(anonKey, token, `/merchants/${merchantId}`, {
      method: 'PUT',
      body: JSON.stringify({ is_accepting_orders: isAccepting }),
    }),
  );
}

export async function restDelivery(serviceKey, path, options = {}) {
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

export { getApiKeys, deliveryApi, assertOk, pass } from './_shared.mjs';
