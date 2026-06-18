/** Haulage quote token — separate namespace from passenger rides. */

import type { HaulageFareBreakdown } from "./buildHaulageQuote.ts";

const HAULAGE_QUOTE_TTL_MS = 5 * 60_000;
export const HAULAGE_SCHEDULED_QUOTE_TTL_MS = 30 * 60_000;

export type HaulageQuotePayload = {
  product: "haulage";
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  vehicle_type: "haulage";
  stairs_level: string;
  prep_status: string;
  items_fingerprint: string;
  distance_km: number;
  duration_minutes: number;
  fare_estimate_minor: number;
  currency: string;
  breakdown: HaulageFareBreakdown;
  booking_kind: "immediate" | "scheduled";
  scheduled_pickup_at: string | null;
  min_body_type_slug: string | null;
  total_weight_kg: number;
  manifest_summary: string;
  expires_at: string;
};

function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function secret(): string | null {
  return Deno.env.get("ROAM_RIDES_QUOTE_SECRET") ?? null;
}

async function hmac(data: string, key: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function encodePayload(p: HaulageQuotePayload): string {
  return btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(encoded: string): HaulageQuotePayload | null {
  try {
    const pad = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const p = JSON.parse(atob(b64)) as HaulageQuotePayload;
    return p.product === "haulage" ? p : null;
  } catch {
    return null;
  }
}

export function itemsFingerprint(
  items: { item_id: string; variant_id: string; qty?: number }[],
): string {
  return items
    .map((i) => `${i.item_id}:${i.variant_id}:${i.qty ?? 1}`)
    .sort()
    .join("|");
}

export async function mintHaulageQuoteToken(
  payload: Omit<HaulageQuotePayload, "expires_at" | "product" | "vehicle_type">,
  ttlMs = HAULAGE_QUOTE_TTL_MS,
): Promise<string> {
  const sec = secret();
  const full: HaulageQuotePayload = {
    ...payload,
    product: "haulage",
    vehicle_type: "haulage",
    pickup_lat: roundCoord(payload.pickup_lat),
    pickup_lng: roundCoord(payload.pickup_lng),
    dropoff_lat: roundCoord(payload.dropoff_lat),
    dropoff_lng: roundCoord(payload.dropoff_lng),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  };
  const body = encodePayload(full);
  if (!sec) return `haulage.unsigned.${body}`;
  const sig = await hmac(`haulage.${body}`, sec);
  return `haulage.${body}.${sig}`;
}

export type VerifyHaulageResult =
  | { ok: true; payload: HaulageQuotePayload }
  | { ok: false; reason: string };

export async function verifyHaulageQuoteToken(
  token: string,
  coords: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    items_fingerprint: string;
  },
): Promise<VerifyHaulageResult> {
  if (!token.startsWith("haulage.")) return { ok: false, reason: "invalid_token" };
  const rest = token.slice("haulage.".length);
  const parts = rest.split(".");
  let body: string;
  let sigPart: string | undefined;
  if (parts[0] === "unsigned" && parts.length === 2) {
    body = parts[1];
  } else if (parts.length >= 2) {
    sigPart = parts[parts.length - 1];
    body = parts.slice(0, -1).join(".");
  } else {
    return { ok: false, reason: "invalid_token" };
  }

  const payload = decodePayload(body);
  if (!payload) return { ok: false, reason: "invalid_token" };

  const sec = secret();
  if (!rest.startsWith("unsigned.")) {
    if (!sec) return { ok: false, reason: "missing_secret" };
    const expected = await hmac(`haulage.${body}`, sec);
    if (sigPart !== expected) return { ok: false, reason: "bad_signature" };
  }

  if (new Date(payload.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const mismatch =
    roundCoord(coords.pickup_lat) !== payload.pickup_lat ||
    roundCoord(coords.pickup_lng) !== payload.pickup_lng ||
    roundCoord(coords.dropoff_lat) !== payload.dropoff_lat ||
    roundCoord(coords.dropoff_lng) !== payload.dropoff_lng ||
    coords.items_fingerprint !== payload.items_fingerprint;

  if (mismatch) return { ok: false, reason: "quote_mismatch" };
  return { ok: true, payload };
}

export function haulageQuoteTokenHash(token: string): string {
  return token.slice(0, 64);
}
