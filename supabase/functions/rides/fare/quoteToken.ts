/** Signed quote tokens — lock upfront fare between quote and book. Fail-closed: no unsigned tokens. */

import type { FareBreakdown } from "./compute.ts";

const QUOTE_TTL_MS = 10 * 60_000;
/** Trip-intent commit/book window — aligned with book_by_at (15 min). */
export const TRIP_INTENT_QUOTE_TTL_MS = 15 * 60_000;
/** Scheduled ride quote at book time (30 min). */
export const SCHEDULED_QUOTE_TTL_MS = 30 * 60_000;

export interface QuotePayload {
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  vehicle_type: string;
  city: string;
  distance_km: number;
  duration_minutes: number;
  surge_multiplier: number;
  fare_estimate_minor: number;
  currency: string;
  fare_breakdown?: FareBreakdown;
  expires_at: string;
}

function roundCoord(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function secret(): string | null {
  const s = Deno.env.get("ROAM_RIDES_QUOTE_SECRET");
  if (!s || !s.trim()) return null;
  return s;
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

function encodePayload(p: QuotePayload): string {
  return btoa(JSON.stringify(p)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePayload(encoded: string): QuotePayload | null {
  try {
    const pad = encoded.length % 4 === 0 ? "" : "=".repeat(4 - (encoded.length % 4));
    const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/") + pad;
    return JSON.parse(atob(b64)) as QuotePayload;
  } catch {
    return null;
  }
}

export async function mintQuoteToken(
  payload: Omit<QuotePayload, "expires_at">,
  ttlMs = QUOTE_TTL_MS,
): Promise<string> {
  const sec = secret();
  if (!sec) {
    throw new Error("ROAM_RIDES_QUOTE_SECRET is required to mint quote tokens");
  }
  const full: QuotePayload = {
    ...payload,
    pickup_lat: roundCoord(payload.pickup_lat),
    pickup_lng: roundCoord(payload.pickup_lng),
    dropoff_lat: roundCoord(payload.dropoff_lat),
    dropoff_lng: roundCoord(payload.dropoff_lng),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  };
  const body = encodePayload(full);
  const sig = await hmac(body, sec);
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: QuotePayload }
  | {
    ok: false;
    reason:
      | "missing_secret"
      | "invalid_token"
      | "bad_signature"
      | "expired"
      | "coord_mismatch"
      | "unsigned_rejected";
  };

export async function verifyQuoteToken(
  token: string,
  coords: {
    pickup_lat: number;
    pickup_lng: number;
    dropoff_lat: number;
    dropoff_lng: number;
    vehicle_type: string;
  },
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length < 2) return { ok: false, reason: "invalid_token" };

  // Legacy unsigned tokens are never accepted (forgeable without the HMAC secret).
  if (parts[0] === "unsigned") {
    return { ok: false, reason: "unsigned_rejected" };
  }

  const sigPart = parts[parts.length - 1];
  const body = parts.slice(0, -1).join(".");

  const payload = decodePayload(body);
  if (!payload) return { ok: false, reason: "invalid_token" };

  const sec = secret();
  if (!sec) return { ok: false, reason: "missing_secret" };

  const expected = await hmac(body, sec);
  if (sigPart !== expected) return { ok: false, reason: "bad_signature" };

  if (new Date(payload.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const mismatch =
    roundCoord(coords.pickup_lat) !== payload.pickup_lat ||
    roundCoord(coords.pickup_lng) !== payload.pickup_lng ||
    roundCoord(coords.dropoff_lat) !== payload.dropoff_lat ||
    roundCoord(coords.dropoff_lng) !== payload.dropoff_lng ||
    coords.vehicle_type !== payload.vehicle_type;

  if (mismatch) return { ok: false, reason: "coord_mismatch" };

  return { ok: true, payload };
}

export function quoteTokenHash(token: string): string {
  return token.slice(0, 64);
}
