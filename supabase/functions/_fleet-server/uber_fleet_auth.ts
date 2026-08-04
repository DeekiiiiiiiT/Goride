/**
 * Uber Vehicles / Fleet API — Client Credentials auth + HMAC webhook verify.
 * Secrets: UBER_CLIENT_ID + UBER_CLIENT_SECRET (Deno.env — never browser KV).
 */
import * as kv from "./kv_store.tsx";

export const UBER_TOKEN_KV_KEY = "integration:uber_token";
export const UBER_META_KV_KEY = "integration:uber";
export const UBER_TOKEN_URL = "https://auth.uber.com/oauth/v2/token";
export const UBER_API_BASE = "https://api.uber.com";

/** Phase-1 org scopes (Vehicles search / assignment). Override via UBER_FLEET_SCOPES. */
export const DEFAULT_FLEET_SCOPES =
  "vehicle_suppliers.vehicles.read vehicle_suppliers.vehicles.assignment";

export type UberTokenStore = {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
  scope?: string;
  token_type?: string;
  grant_type: "client_credentials" | "authorization_code";
};

export function getUberClientCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = (Deno.env.get("UBER_CLIENT_ID") || "").trim();
  const clientSecret = (Deno.env.get("UBER_CLIENT_SECRET") || "").trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function uberSecretsConfigured(): boolean {
  return getUberClientCredentials() !== null;
}

export function fleetScopes(): string {
  const fromEnv = (Deno.env.get("UBER_FLEET_SCOPES") || "").trim();
  return fromEnv || DEFAULT_FLEET_SCOPES;
}

/** Fetch (or refresh) an org-level Client Credentials token. */
export async function obtainClientCredentialsToken(): Promise<UberTokenStore> {
  const creds = getUberClientCredentials();
  if (!creds) {
    throw Object.assign(new Error("UBER_CLIENT_ID / UBER_CLIENT_SECRET not configured on server"), {
      code: "SECRETS_MISSING",
      status: 503,
    });
  }

  const body = new URLSearchParams();
  body.append("client_id", creds.clientId);
  body.append("client_secret", creds.clientSecret);
  body.append("grant_type", "client_credentials");
  body.append("scope", fleetScopes());

  const tokenRes = await fetch(UBER_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const tokenData = await tokenRes.json().catch(() => ({}));

  if (!tokenRes.ok) {
    console.error("[UberFleet] Client credentials failed:", tokenData);
    throw Object.assign(
      new Error(
        typeof tokenData?.error_description === "string"
          ? tokenData.error_description
          : typeof tokenData?.error === "string"
            ? tokenData.error
            : "Uber token request failed",
      ),
      { code: "TOKEN_FAILED", status: 400, details: tokenData },
    );
  }

  const store: UberTokenStore = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expires_at: Date.now() + Number(tokenData.expires_in || 2592000) * 1000,
    scope: tokenData.scope,
    token_type: tokenData.token_type || "Bearer",
    grant_type: "client_credentials",
  };
  await kv.set(UBER_TOKEN_KV_KEY, store);
  return store;
}

/** Valid access token, refreshing via client_credentials when expired. */
export async function getValidAccessToken(): Promise<string> {
  let tokenStore = (await kv.get(UBER_TOKEN_KV_KEY)) as UberTokenStore | null;
  const skewMs = 60_000;
  if (tokenStore?.access_token && Date.now() < Number(tokenStore.expires_at) - skewMs) {
    return tokenStore.access_token;
  }
  // Client-credentials grants: re-mint rather than relying on refresh_token.
  tokenStore = await obtainClientCredentialsToken();
  return tokenStore.access_token;
}

export async function clearUberConnection(): Promise<void> {
  await kv.del(UBER_TOKEN_KV_KEY);
  const meta = (await kv.get(UBER_META_KV_KEY)) as Record<string, unknown> | null;
  if (meta && typeof meta === "object") {
    await kv.set(UBER_META_KV_KEY, {
      ...meta,
      id: "uber",
      name: "Uber Fleet",
      status: "disconnected",
      lastSync: "-",
      credentials: undefined,
    });
  } else {
    await kv.set(UBER_META_KV_KEY, {
      id: "uber",
      name: "Uber Fleet",
      status: "disconnected",
      lastSync: "-",
    });
  }
}

export async function markUberConnected(extra: Record<string, unknown> = {}): Promise<void> {
  const prev = ((await kv.get(UBER_META_KV_KEY)) as Record<string, unknown>) || {};
  await kv.set(UBER_META_KV_KEY, {
    ...prev,
    id: "uber",
    name: "Uber Fleet",
    status: "connected",
    lastConnected: new Date().toISOString(),
    // Never persist client secrets in KV — env only.
    credentials: undefined,
    ...extra,
  });
}

/** Hex HMAC-SHA256 of raw body with client secret (Uber X-Uber-Signature). */
export async function computeUberWebhookSignature(
  clientSecret: string,
  rawBody: string,
): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(clientSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyUberWebhookSignature(
  clientSecret: string,
  rawBody: string,
  headerSignature: string | null | undefined,
): Promise<boolean> {
  if (!headerSignature || !clientSecret) return false;
  const expected = await computeUberWebhookSignature(clientSecret, rawBody);
  const a = expected.toLowerCase();
  const b = String(headerSignature).trim().toLowerCase();
  if (a.length !== b.length) return false;
  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
