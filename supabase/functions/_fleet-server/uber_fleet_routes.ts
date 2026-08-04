/**
 * Uber Vehicles/Fleet API routes — connect (client credentials), sync vehicles/drivers, webhook.
 */
import type { Context } from "npm:hono";
import * as kv from "./kv_store.tsx";
import { requireAuth, requirePermission } from "./rbac_middleware.ts";
import { stampOrg } from "./org_scope.ts";
import {
  UBER_META_KV_KEY,
  UBER_TOKEN_KV_KEY,
  UBER_API_BASE,
  clearUberConnection,
  fleetScopes,
  getUberClientCredentials,
  getValidAccessToken,
  markUberConnected,
  obtainClientCredentialsToken,
  uberSecretsConfigured,
  verifyUberWebhookSignature,
  type UberTokenStore,
} from "./uber_fleet_auth.ts";

const BASE = "/make-server-37f42386";

type UberVehicle = {
  id?: string;
  owner_id?: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
  license_plate?: string;
  compliance?: { status?: string };
  assignments?: Array<{ driver_id?: string }>;
};

function normPlate(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, "");
}

function normVin(v: unknown): string {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

async function searchUberVehicles(
  accessToken: string,
  filters: { vin?: string; license_plate?: string } = {},
): Promise<{ vehicles: UberVehicle[]; error?: string; status?: number }> {
  const body: Record<string, unknown> = { fields: "_all_" };
  if (filters.vin || filters.license_plate) {
    body.filters = {
      ...(filters.vin ? { vin: filters.vin } : {}),
      ...(filters.license_plate ? { license_plate: filters.license_plate } : {}),
    };
  }

  const res = await fetch(`${UBER_API_BASE}/v1/vehicle-suppliers/vehicles/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return {
      vehicles: [],
      error: typeof data?.message === "string" ? data.message : text.slice(0, 500),
      status: res.status,
    };
  }

  const vehicles = Array.isArray(data.vehicles) ? data.vehicles : [];
  return { vehicles };
}

type SyncSummary = {
  success: boolean;
  vehiclesSearched: number;
  vehiclesMatched: number;
  vehiclesUpdated: number;
  driversLinked: number;
  unmatchedUberVehicles: Array<{
    uberVehicleId: string;
    vin?: string;
    licensePlate?: string;
    assignedDriverIds: string[];
  }>;
  unmatchedAssignments: Array<{ uberVehicleId: string; uberDriverId: string; fleetVehicleId: string }>;
  errors: string[];
  warning?: string;
};

async function syncFleetVehiclesAndDrivers(c: Context): Promise<SyncSummary> {
  const accessToken = await getValidAccessToken();
  const summary: SyncSummary = {
    success: true,
    vehiclesSearched: 0,
    vehiclesMatched: 0,
    vehiclesUpdated: 0,
    driversLinked: 0,
    unmatchedUberVehicles: [],
    unmatchedAssignments: [],
    errors: [],
  };

  const rawVehicles = (await kv.getByPrefix("vehicle:")) || [];
  const fleetVehicles = rawVehicles.filter((v: any) => v && typeof v === "object");
  const rawDrivers = (await kv.getByPrefix("driver:")) || [];
  const fleetDrivers = rawDrivers.filter((d: any) => d && typeof d === "object");

  const byVin = new Map<string, any>();
  const byPlate = new Map<string, any>();
  for (const v of fleetVehicles) {
    const vin = normVin(v.vin);
    const plate = normPlate(v.licensePlate || v.plateNumber);
    if (vin) byVin.set(vin, v);
    if (plate) byPlate.set(plate, v);
  }

  const driverByUberId = new Map<string, any>();
  for (const d of fleetDrivers) {
    const uid = String(d.uberDriverId || "").trim();
    if (uid) driverByUberId.set(uid, d);
  }

  // Prefer org-wide search when Uber allows empty filters.
  let uberVehicles: UberVehicle[] = [];
  const orgSearch = await searchUberVehicles(accessToken);
  if (orgSearch.error) {
    // Fall back: search per fleet VIN/plate
    summary.warning = `Org-wide search unavailable (${orgSearch.status}): ${orgSearch.error}. Falling back to per-vehicle lookup.`;
    const seen = new Set<string>();
    for (const v of fleetVehicles) {
      const vin = normVin(v.vin);
      const plate = String(v.licensePlate || v.plateNumber || "").trim();
      if (!vin && !plate) continue;
      const filters: { vin?: string; license_plate?: string } = {};
      if (vin) filters.vin = vin;
      else if (plate) filters.license_plate = plate;
      const one = await searchUberVehicles(accessToken, filters);
      if (one.error) {
        summary.errors.push(`${vin || plate}: ${one.error}`);
        continue;
      }
      for (const uv of one.vehicles) {
        const id = String(uv.id || "");
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        uberVehicles.push(uv);
      }
    }
  } else {
    uberVehicles = orgSearch.vehicles;
  }

  summary.vehiclesSearched = uberVehicles.length;

  for (const uv of uberVehicles) {
    const uberId = String(uv.id || "");
    const vin = normVin(uv.vin);
    const plate = normPlate(uv.license_plate);
    let match = (vin && byVin.get(vin)) || (plate && byPlate.get(plate)) || null;

    // Also match already-linked uberVehicleId
    if (!match && uberId) {
      match = fleetVehicles.find((v: any) => String(v.uberVehicleId || "") === uberId) || null;
    }

    const assignedDriverIds = (uv.assignments || [])
      .map((a) => String(a.driver_id || "").trim())
      .filter(Boolean);

    if (!match) {
      summary.unmatchedUberVehicles.push({
        uberVehicleId: uberId,
        vin: uv.vin,
        licensePlate: uv.license_plate,
        assignedDriverIds,
      });
      continue;
    }

    summary.vehiclesMatched += 1;
    const fleetId = String(match.id || "").trim();
    const kvKey = fleetId ? `vehicle:${fleetId}` : null;
    if (!kvKey) {
      summary.errors.push(`Matched vehicle missing id (uber ${uberId})`);
      continue;
    }

    const next = {
      ...match,
      uberVehicleId: uberId || match.uberVehicleId,
      uberOwnerId: uv.owner_id || match.uberOwnerId,
      uberComplianceStatus: uv.compliance?.status || match.uberComplianceStatus,
      uberAssignedDriverIds: assignedDriverIds,
      uberLastSyncedAt: new Date().toISOString(),
    };
    await kv.set(kvKey, stampOrg(next, c));
    summary.vehiclesUpdated += 1;

    // Link Uber driver ids onto fleet drivers when possible
    for (const uberDriverId of assignedDriverIds) {
      let driver = driverByUberId.get(uberDriverId);
      if (!driver && match.currentDriverId) {
        const current = fleetDrivers.find(
          (d: any) =>
            String(d.id) === String(match.currentDriverId) ||
            String(d.driverId) === String(match.currentDriverId),
        );
        if (current && !current.uberDriverId) {
          driver = current;
          const dKey = `driver:${current.id || current.driverId}`;
          const updated = {
            ...current,
            uberDriverId,
            uberLastSyncedAt: new Date().toISOString(),
          };
          await kv.set(dKey, stampOrg(updated, c));
          driverByUberId.set(uberDriverId, updated);
          summary.driversLinked += 1;
          continue;
        }
      }
      if (!driver) {
        summary.unmatchedAssignments.push({
          uberVehicleId: uberId,
          uberDriverId,
          fleetVehicleId: fleetId,
        });
      }
    }
  }

  const lastSync = new Date().toISOString();
  await markUberConnected({
    lastSync,
    lastSyncSummary: {
      vehiclesMatched: summary.vehiclesMatched,
      vehiclesUpdated: summary.vehiclesUpdated,
      driversLinked: summary.driversLinked,
      unmatchedCount: summary.unmatchedUberVehicles.length,
    },
  });

  return summary;
}

export function registerUberFleetRoutes(app: {
  get: (path: string, ...handlers: unknown[]) => unknown;
  post: (path: string, ...handlers: unknown[]) => unknown;
}) {
  // Public webhook — HMAC verified (no user JWT).
  app.post(`${BASE}/uber/webhook`, async (c: Context) => {
    try {
      const rawBody = await c.req.text();
      const creds = getUberClientCredentials();
      if (!creds) {
        console.error("[UberFleet] Webhook received but secrets missing");
        return c.json({ error: "Server not configured" }, 503);
      }

      const signature = c.req.header("X-Uber-Signature") || c.req.header("x-uber-signature");
      const ok = await verifyUberWebhookSignature(creds.clientSecret, rawBody, signature);
      if (!ok) {
        console.warn("[UberFleet] Webhook signature mismatch");
        return c.json({ error: "Invalid signature" }, 401);
      }

      const envHeader = c.req.header("X-Environment") || c.req.header("x-environment") || "unknown";
      let payload: any = {};
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch {
        return c.json({ error: "Invalid JSON" }, 400);
      }

      const eventId = String(payload.event_id || "").trim();
      if (eventId) {
        const dedupeKey = `uber_webhook_event:${eventId}`;
        const existing = await kv.get(dedupeKey);
        if (existing) {
          return c.json({ success: true, duplicate: true });
        }
        await kv.set(dedupeKey, {
          receivedAt: new Date().toISOString(),
          environment: envHeader,
          event_type: payload.event_type,
        });
      }

      const logKey = `uber_webhook_log:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;
      await kv.set(logKey, {
        event_id: eventId || null,
        event_type: payload.event_type || null,
        event_time: payload.event_time || null,
        meta: payload.meta || null,
        environment: envHeader,
        receivedAt: new Date().toISOString(),
      });

      return c.json({ success: true });
    } catch (e: any) {
      console.error("[UberFleet] Webhook error:", e);
      return c.json({ error: e.message || "Webhook failed" }, 500);
    }
  });

  app.get(`${BASE}/uber/status`, requireAuth(), async (c: Context) => {
    try {
      const secretsConfigured = uberSecretsConfigured();
      const tokenStore = (await kv.get(UBER_TOKEN_KV_KEY)) as UberTokenStore | null;
      const meta = ((await kv.get(UBER_META_KV_KEY)) as Record<string, unknown>) || {};
      const hasToken = !!(tokenStore?.access_token);
      const expired = hasToken && Date.now() >= Number(tokenStore!.expires_at);
      const connected = secretsConfigured && hasToken && !expired && meta.status === "connected";

      return c.json({
        id: "uber",
        name: "Uber Fleet",
        status: connected ? "connected" : secretsConfigured && hasToken && !expired ? "connected" : "disconnected",
        secretsConfigured,
        scopes: fleetScopes(),
        lastSync: meta.lastSync || "-",
        lastConnected: meta.lastConnected || null,
        lastSyncSummary: meta.lastSyncSummary || null,
        tokenExpiresAt: tokenStore?.expires_at || null,
        grantType: tokenStore?.grant_type || null,
        // Setup hints for fleet admins (no secrets)
        portal: {
          privacyPolicyUrl: "https://roamenterprise.co/privacy",
          redirectUri: "https://roamfleet.co/uber-callback",
          webhookUrl:
            "https://csfllzzastacofsvcdsc.supabase.co/functions/v1/make-server-37f42386/uber/webhook",
        },
      });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  app.post(`${BASE}/uber/connect`, requireAuth(), requirePermission("settings.edit"), async (c: Context) => {
    try {
      if (!uberSecretsConfigured()) {
        return c.json(
          {
            error:
              "Uber Fleet is not configured on the server. Set UBER_CLIENT_ID and UBER_CLIENT_SECRET as Supabase Edge Function secrets, then retry.",
            code: "SECRETS_MISSING",
          },
          503,
        );
      }

      const tokenStore = await obtainClientCredentialsToken();
      await markUberConnected({ lastSync: "-" });

      return c.json({
        success: true,
        status: "connected",
        scope: tokenStore.scope,
        expiresAt: tokenStore.expires_at,
      });
    } catch (e: any) {
      const status = e.status || 500;
      return c.json(
        {
          error: e.message || "Connect failed",
          code: e.code || "CONNECT_FAILED",
          details: e.details,
        },
        status,
      );
    }
  });

  app.post(`${BASE}/uber/disconnect`, requireAuth(), requirePermission("settings.edit"), async (c: Context) => {
    try {
      await clearUberConnection();
      return c.json({ success: true, status: "disconnected" });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Vehicles/Fleet sync (replaces deprecated consumer /v1.2/history)
  app.post(`${BASE}/uber/sync`, requireAuth(), requirePermission("settings.edit"), async (c: Context) => {
    try {
      if (!uberSecretsConfigured()) {
        return c.json({ error: "Uber secrets not configured", code: "SECRETS_MISSING" }, 503);
      }
      const tokenStore = (await kv.get(UBER_TOKEN_KV_KEY)) as UberTokenStore | null;
      if (!tokenStore?.access_token) {
        // Auto-connect if secrets exist but Connect was never clicked
        await obtainClientCredentialsToken();
        await markUberConnected({ lastSync: "-" });
      }

      const summary = await syncFleetVehiclesAndDrivers(c);
      return c.json(summary);
    } catch (e: any) {
      console.error("[UberFleet] Sync error:", e);
      return c.json(
        {
          error: e.message || "Sync failed",
          code: e.code || "SYNC_FAILED",
          details: e.details,
        },
        e.status || 500,
      );
    }
  });

  /**
   * Per-driver Authorization Code URL (Vehicles consent).
   * Org Connect uses /uber/connect (client credentials) — this is for later driver linking.
   */
  app.get(`${BASE}/uber/auth-url`, requireAuth(), async (c: Context) => {
    try {
      const creds = getUberClientCredentials();
      if (!creds) {
        return c.json({ error: "UBER_CLIENT_ID not configured", code: "SECRETS_MISSING" }, 503);
      }

      const redirectUri =
        c.req.query("redirect_uri") || "https://roamfleet.co/uber-callback";
      const scope = c.req.query("scope") || fleetScopes();
      const state = c.req.query("state") || crypto.randomUUID();

      // Vehicles / rental consent surface (not consumer login.uber.com)
      const authUrl =
        `https://bonjour.uber.com/marketplace/vehicle-solutions-agreement` +
        `?client_id=${encodeURIComponent(creds.clientId)}` +
        `&response_type=code` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&state=${encodeURIComponent(state)}`;

      return c.json({ url: authUrl, state, redirect_uri: redirectUri });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });

  // Optional: exchange driver authorization_code (kept for per-driver flows; Connect uses client_credentials)
  app.post(`${BASE}/uber/exchange`, requireAuth(), requirePermission("settings.edit"), async (c: Context) => {
    try {
      const creds = getUberClientCredentials();
      if (!creds) {
        return c.json({ error: "Secrets missing", code: "SECRETS_MISSING" }, 503);
      }
      const { code, redirect_uri } = await c.req.json();
      if (!code || !redirect_uri) {
        return c.json({ error: "Missing code or redirect_uri" }, 400);
      }

      const body = new URLSearchParams();
      body.append("client_id", creds.clientId);
      body.append("client_secret", creds.clientSecret);
      body.append("grant_type", "authorization_code");
      body.append("redirect_uri", redirect_uri);
      body.append("code", code);

      const tokenRes = await fetch("https://auth.uber.com/oauth/v2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) {
        return c.json({ error: "Token exchange failed", details: tokenData }, 400);
      }

      // Store driver-scoped token separately; do not overwrite org client_credentials token.
      const driverTokenKey = `integration:uber_driver_token:${tokenData.scope || "default"}`;
      await kv.set(driverTokenKey, {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: Date.now() + Number(tokenData.expires_in || 2592000) * 1000,
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        grant_type: "authorization_code",
      });

      return c.json({ success: true, storedAs: driverTokenKey });
    } catch (e: any) {
      return c.json({ error: e.message }, 500);
    }
  });
}
