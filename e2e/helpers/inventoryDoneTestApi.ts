import { getLocalSupabaseKeys, signInPlatformAal2 } from './mmP01Auth';
import {
  INV_DONE_DRIVER_EMAIL,
  INV_DONE_OWNER_EMAIL,
  INV_DONE_PASSWORD,
} from './inventoryDoneTestAuth';

const BASE =
  process.env.FLEET_BASE_URL?.replace(/\/$/, '') || 'http://127.0.0.1:3000';

async function supabaseEnv() {
  const { base, anonKey } = await getLocalSupabaseKeys();
  return { fnBase: base.replace(/\/$/, ''), anonKey };
}

function inventoryPrefix(fnBase: string) {
  return `${fnBase}/functions/v1/fleet-core/make-server-37f42386/inventory`;
}

async function accessToken(email = INV_DONE_OWNER_EMAIL) {
  const { fnBase, anonKey } = await supabaseEnv();
  const signed = await signInPlatformAal2(fnBase, anonKey, email, INV_DONE_PASSWORD);
  return { token: signed.access_token as string, fnBase, anonKey };
}

export async function inventoryDoneTestFetch(
  path: string,
  init: RequestInit & { email?: string } = {},
) {
  const { token, fnBase, anonKey } = await accessToken(init.email);
  const headers: Record<string, string> = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(`${inventoryPrefix(fnBase)}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, body, ok: res.ok };
}

export async function assertPhaseBlocked(path: string, init?: RequestInit) {
  const res = await inventoryDoneTestFetch(path, init);
  if (res.status !== 403) {
    throw new Error(`Expected 403 for ${path}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
}

export async function acceptDeliveryOfferAsDriver(offerId: string) {
  const { fnBase, anonKey } = await supabaseEnv();
  const signed = await signInPlatformAal2(fnBase, anonKey, INV_DONE_DRIVER_EMAIL, INV_DONE_PASSWORD);
  const res = await fetch(`${fnBase}/functions/v1/delivery/courier/offers/${offerId}/accept`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${signed.access_token as string}`,
    },
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep text */
  }
  return { status: res.status, body, ok: res.ok };
}

export async function driverKitCheckAllPresent(vehicleId: string) {
  return inventoryDoneTestFetch('/driver/kit-check', {
    method: 'POST',
    email: INV_DONE_DRIVER_EMAIL,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': `dt14-kit-${Date.now()}`,
    },
    body: JSON.stringify({ allPresent: true, vehicleId }),
  });
}

export { BASE as INV_DONE_FLEET_BASE };
