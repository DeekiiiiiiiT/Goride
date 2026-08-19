/**
 * Shared helpers for Roam Rush Courier smoke scripts.
 */
import { randomUUID } from 'node:crypto';
import {
  DROP_OFF,
  ISLAND_GRILL,
  SEED_CUSTOMER,
  SUPABASE_URL,
  assertOk,
  deliveryApi,
  getApiKeys,
  placeCashOrder,
  signIn,
} from './_shared.mjs';

export const SEED_COURIER = {
  email: 'seed-courier@roamrush.app',
  password: 'RoamRushCourier2026!',
  name: 'Rush Test Courier',
};

export const SEED_MERCHANT = {
  email: 'seed-island-grill@roamrush.app',
  password: 'RoamRushPartner2026!',
};

/** GPS near Spanish Town drop-off so dispatch radius includes the courier. */
export const COURIER_GPS = { lat: 18.014, lng: -76.954 };

export async function signInCourier(anonKey) {
  return signIn(anonKey, SEED_COURIER.email, SEED_COURIER.password);
}

export async function signInMerchant(anonKey) {
  return signIn(anonKey, SEED_MERCHANT.email, SEED_MERCHANT.password);
}

export async function signInCustomer(anonKey) {
  return signIn(anonKey, SEED_CUSTOMER.email, SEED_CUSTOMER.password);
}

export async function goCourierOnline(anonKey, courierToken) {
  return assertOk(
    'Courier go online',
    await deliveryApi(anonKey, courierToken, '/courier/availability', {
      method: 'PUT',
      body: JSON.stringify({
        isOnline: true,
        lat: COURIER_GPS.lat,
        lng: COURIER_GPS.lng,
      }),
    }),
  );
}

export async function goCourierOffline(anonKey, courierToken) {
  return assertOk(
    'Courier go offline',
    await deliveryApi(anonKey, courierToken, '/courier/availability', {
      method: 'PUT',
      body: JSON.stringify({ isOnline: false }),
    }),
  );
}

export async function markOrderReady(anonKey, customerToken, merchantToken) {
  const { orderId, orderNumber } = await placeCashOrder(anonKey, customerToken, {
    idempotencyKey: `smoke-courier-${randomUUID()}`,
  });
  console.log(`  Placed order ${orderNumber}`);

  for (const status of ['accepted', 'preparing', 'ready']) {
    const body = { status, actorType: 'merchant' };
    if (status === 'accepted') body.estimatedPrepTimeMins = 20;
    assertOk(
      `Merchant → ${status}`,
      await deliveryApi(anonKey, merchantToken, `/orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    );
  }

  return { orderId, orderNumber };
}

export async function redispatchStranded(anonKey, serviceKey) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delivery/courier/offers/redispatch`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
      'x-service-role': serviceKey,
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

export async function waitForCourierOffer(
  anonKey,
  courierToken,
  orderNumber,
  serviceKey,
  attempts = 15,
) {
  for (let i = 0; i < attempts; i++) {
    const res = await deliveryApi(anonKey, courierToken, '/courier/offers');
    if (res.status === 200) {
      const offers = res.body?.offers ?? [];
      const match = offers.find((o) => o.order?.order_number === orderNumber);
      if (match) return match;
    }
    if (i === 4 || i === 9) {
      const rd = await redispatchStranded(anonKey, serviceKey);
      if (rd.status === 200) console.log('  Redispatched stranded offers');
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No courier offer for ${orderNumber} after ${attempts}s`);
}

export async function acceptCourierOffer(anonKey, courierToken, offerId) {
  return assertOk(
    'Accept courier offer',
    await deliveryApi(anonKey, courierToken, `/courier/offers/${offerId}/accept`, {
      method: 'POST',
    }),
  );
}

export async function advanceCourierFromStatus(anonKey, courierToken, orderId, currentStatus) {
  const flow = {
    assigned: ['picked_up', 'in_transit', 'delivered', 'completed'],
    picked_up: ['in_transit', 'delivered', 'completed'],
    in_transit: ['delivered', 'completed'],
    ready: ['picked_up', 'in_transit', 'delivered', 'completed'],
  };
  const steps = flow[currentStatus] ?? [];
  for (const status of steps) {
    const res = await deliveryApi(anonKey, courierToken, `/orders/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, actorType: 'courier' }),
    });
    if (res.status !== 200) {
      throw new Error(`Courier → ${status} failed (${res.status}): ${res.text}`);
    }
  }
}

export async function completeCourierDelivery(anonKey, courierToken, orderId) {
  await advanceCourierFromStatus(anonKey, courierToken, orderId, 'assigned');
}

export async function ensureCourierIdle(anonKey, courierToken) {
  const stack = await deliveryApi(anonKey, courierToken, '/courier/stack');
  const legs = stack.body?.legs ?? [];
  for (const leg of legs) {
    const orderId = String(leg.order_id ?? leg.order?.id ?? '');
    const status = String(leg.order?.status ?? '');
    if (!orderId) continue;
    if (['assigned', 'picked_up', 'in_transit', 'ready'].includes(status)) {
      console.log(`  Clearing stuck delivery ${orderId} (${status})`);
      await advanceCourierFromStatus(anonKey, courierToken, orderId, status);
    }
  }
  await goCourierOffline(anonKey, courierToken);
}

export async function prepareReadyOffer(anonKey) {
  const { serviceKey } = getApiKeys();
  const [customerToken, merchantToken, courierToken] = await Promise.all([
    signInCustomer(anonKey),
    signInMerchant(anonKey),
    signInCourier(anonKey),
  ]);

  await ensureCourierIdle(anonKey, courierToken);
  await goCourierOnline(anonKey, courierToken);
  const { orderId, orderNumber } = await markOrderReady(anonKey, customerToken, merchantToken);
  const offer = await waitForCourierOffer(anonKey, courierToken, orderNumber, serviceKey);

  return { anonKey, courierToken, customerToken, merchantToken, serviceKey, orderId, orderNumber, offer };
}
