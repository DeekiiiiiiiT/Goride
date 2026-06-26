import type { Context, Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveMerchantAccess,
  type MerchantMembership,
  type ResolvedMerchantAccess,
} from "./merchantAuth.ts";
import {
  buildStationDeepLinks,
  enrollRateLimitOk,
  generatePairingCode,
  hashDeviceToken,
  isValidStation,
  issueDeviceToken,
  normalizePairingCode,
  validateDeviceToken,
} from "./merchantStationDevice.ts";
import {
  hashPin,
  hashShiftToken,
  issueShiftToken,
  nextPinLockoutUntil,
  pinRateLimitLocked,
  PIN_MAX_ATTEMPTS,
  validatePinFormat,
  validateShiftToken,
  verifyPin,
} from "./merchantStationPin.ts";
import {
  mapTeamMember,
  parseJobStationInput,
} from "./merchantTeam.ts";

type StationDeps = {
  getSupabase: (authHeader: string | null) => SupabaseClient;
  getServiceSupabase: () => SupabaseClient;
};

let stationDepsRef: StationDeps | null = null;

function getSupabaseFromDeps(authHeader: string | null) {
  if (!stationDepsRef) throw new Error("merchantStation routes not initialized");
  return stationDepsRef.getSupabase(authHeader);
}

function getServiceSb() {
  if (!stationDepsRef) throw new Error("merchantStation routes not initialized");
  return stationDepsRef.getServiceSupabase();
}

function canUseStationKiosk(membership: MerchantMembership): boolean {
  return membership.is_owner || membership.role === "manager" || membership.role === "admin";
}

export type StationAccessResult =
  | {
    ok: true;
    mode: "jwt";
    user: { id: string; email?: string | null };
    resolved: ResolvedMerchantAccess;
  }
  | {
    ok: true;
    mode: "device";
    deviceId: string;
    merchantId: string;
    station: string;
    merchant: Record<string, unknown>;
  }
  | { ok: false; status: number; message: string };

function merchantIdFromAccess(access: Extract<StationAccessResult, { ok: true }>): string {
  return access.mode === "jwt"
    ? access.resolved.merchant.id as string
    : access.merchantId;
}

async function resolveStationAccess(c: Context): Promise<StationAccessResult> {
  const deviceToken = c.req.header("X-Station-Device-Token");
  if (deviceToken) {
    const validated = await validateDeviceToken(deviceToken);
    if (!validated) return { ok: false, status: 401, message: "Invalid device token" };

    const sb = getServiceSb();
    const tokenHash = await hashDeviceToken(deviceToken);
    const { data: device } = await sb
      .from("merchant_station_devices")
      .select("id, merchant_id, station, revoked_at, merchants(*)")
      .eq("token_hash", tokenHash)
      .is("revoked_at", null)
      .maybeSingle();

    if (!device) return { ok: false, status: 401, message: "Device not enrolled" };
    const row = device as Record<string, unknown>;
    if (String(row.merchant_id) !== validated.merchantId ||
      String(row.id) !== validated.deviceId) {
      return { ok: false, status: 401, message: "Device session mismatch" };
    }

    await sb
      .from("merchant_station_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", validated.deviceId);

    const merchant = row.merchants as Record<string, unknown>;
    return {
      ok: true,
      mode: "device",
      deviceId: validated.deviceId,
      merchantId: validated.merchantId,
      station: String(row.station),
      merchant,
    };
  }

  const authHeader = c.req.header("Authorization");
  if (!authHeader) return { ok: false, status: 401, message: "Unauthorized" };

  const supabase = getSupabaseFromDeps(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) return { ok: false, status: 403, message: "Not a merchant" };
  if (!canUseStationKiosk(resolved.membership)) {
    return { ok: false, status: 403, message: "Station kiosk requires owner or manager login" };
  }

  return { ok: true, mode: "jwt", user, resolved };
}

async function requireStationDevice(
  c: Context,
): Promise<StationAccessResult> {
  return resolveStationAccess(c);
}

async function requireOwnerMerchant(
  authHeader: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  if (!authHeader) return { ok: false, status: 401, message: "Unauthorized" };

  const supabase = getSupabaseFromDeps(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) return { ok: false, status: 403, message: "Not a merchant" };
  if (!resolved.membership.is_owner) {
    return { ok: false, status: 403, message: "Only the store owner can manage team members" };
  }
  return { ok: true, user, resolved };
}

async function ensurePairingCode(sb: SupabaseClient, merchantId: string): Promise<string> {
  const { data: merchant } = await sb
    .from("merchants")
    .select("kiosk_pairing_code")
    .eq("id", merchantId)
    .single();
  const existing = (merchant as Record<string, unknown> | null)?.kiosk_pairing_code;
  if (existing) return String(existing);

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generatePairingCode();
    const { error } = await sb
      .from("merchants")
      .update({
        kiosk_pairing_code: code,
        kiosk_pairing_rotated_at: new Date().toISOString(),
      })
      .eq("id", merchantId)
      .is("kiosk_pairing_code", null);
    if (!error) return code;
  }
  throw new Error("Could not generate pairing code");
}

function mapRosterMember(row: Record<string, unknown>) {
  const jobStation = row.job_station;
  const role = String(row.role);
  return {
    id: String(row.id),
    name: String(row.name),
    role: role === "manager" ? "manager" : "staff",
    jobStation:
      jobStation === "counter" || jobStation === "kitchen" || jobStation === "manager"
        ? String(jobStation)
        : null,
    pinStatus: String(row.pin_status),
  };
}

const ROSTER_PERMISSIONS: Record<string, string[]> = {
  staff: ["orders"],
  manager: ["orders", "menu", "analytics"],
};

async function endMemberShiftSessions(sb: SupabaseClient, memberId: string) {
  await sb
    .from("merchant_shift_sessions")
    .update({ ended_at: new Date().toISOString() })
    .eq("team_member_id", memberId)
    .is("ended_at", null);
}

export function registerMerchantStationRoutes(app: Hono, deps: StationDeps) {
  stationDepsRef = deps;

  app.post("/merchant/team/members/roster", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const name = String(body.name || "").trim();
    if (!name) return c.json({ error: "Name is required" }, 400);

    const roleInput = String(body.role || "staff");
    if (roleInput === "admin") {
      return c.json({ error: "Admins are invited by email only" }, 400);
    }
    const role = roleInput === "manager" ? "manager" : "staff";
    const station =
      body.jobStation === "none" || body.jobStation === null
        ? null
        : parseJobStationInput(body.jobStation, role);
    if (
      body.jobStation != null &&
      body.jobStation !== "" &&
      body.jobStation !== "none" &&
      station == null
    ) {
      return c.json({ error: "Invalid job station" }, 400);
    }

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

    const { data, error } = await sb
      .from("merchant_team_members")
      .insert({
        merchant_id: merchantId,
        name,
        role,
        permissions: ROSTER_PERMISSIONS[role],
        is_owner: false,
        login_type: "roster",
        pin_status: "unset",
        job_station: station,
      })
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ member: mapTeamMember(data as Record<string, unknown>) });
  });

  app.post("/merchant/team/members/:id/pin-reset", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const memberId = c.req.param("id");
    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

    const { data: member } = await sb
      .from("merchant_team_members")
      .select("id, login_type, is_owner")
      .eq("id", memberId)
      .eq("merchant_id", merchantId)
      .single();

    if (!member) return c.json({ error: "Member not found" }, 404);
    const row = member as Record<string, unknown>;
    if (row.is_owner) return c.json({ error: "Cannot reset owner PIN" }, 400);
    if (row.login_type !== "roster") {
      return c.json({ error: "PIN reset only applies to floor staff profiles" }, 400);
    }

    await endMemberShiftSessions(sb, memberId);

    const { data: updated, error } = await sb
      .from("merchant_team_members")
      .update({
        pin_status: "locked",
        pin_hash: null,
        pin_set_at: null,
        pin_failed_attempts: 0,
        pin_locked_until: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .select()
      .single();

    if (error) return c.json({ error: error.message }, 500);
    return c.json({ member: mapTeamMember(updated as Record<string, unknown>) });
  });

  app.get("/merchant/station/roster", async (c) => {
    const access = await requireStationDevice(c);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const sb = getServiceSb();
    const merchantId = merchantIdFromAccess(access);

    const { data, error } = await sb
      .from("merchant_team_members")
      .select("id, name, role, job_station, pin_status")
      .eq("merchant_id", merchantId)
      .eq("login_type", "roster")
      .order("name");

    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      members: (data || []).map((row) => mapRosterMember(row as Record<string, unknown>)),
    });
  });

  app.post("/merchant/station/pin/create", async (c) => {
    try {
      const access = await requireStationDevice(c);
      if (!access.ok) return c.json({ error: access.message }, access.status);

      const body = await c.req.json();
      const memberId = String(body.memberId || "");
      const pin = String(body.pin || "");
      const confirmPin = String(body.confirmPin || "");

      if (!memberId) return c.json({ error: "memberId is required" }, 400);
      if (pin !== confirmPin) return c.json({ error: "PINs do not match" }, 400);

      const pinError = validatePinFormat(pin);
      if (pinError) return c.json({ error: pinError }, 400);

      const sb = getServiceSb();
      const merchantId = merchantIdFromAccess(access);

      const { data: member } = await sb
        .from("merchant_team_members")
        .select("*")
        .eq("id", memberId)
        .eq("merchant_id", merchantId)
        .eq("login_type", "roster")
        .single();

      if (!member) return c.json({ error: "Staff member not found" }, 404);

      const row = member as Record<string, unknown>;
      const pinStatus = String(row.pin_status);
      if (pinStatus !== "unset" && pinStatus !== "locked") {
        return c.json({ error: "PIN is already set. Enter your PIN to sign in." }, 400);
      }

      const pinHash = await hashPin(pin);
      const { data: updated, error } = await sb
        .from("merchant_team_members")
        .update({
          pin_hash: pinHash,
          pin_status: "active",
          pin_set_at: new Date().toISOString(),
          pin_failed_attempts: 0,
          pin_locked_until: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", memberId)
        .select()
        .single();

      if (error) return c.json({ error: error.message }, 500);
      if (!updated) return c.json({ error: "Could not save PIN" }, 500);

      const { token, expiresAt } = await issueShiftToken(memberId, merchantId);
      const tokenHash = await hashShiftToken(token);
      const { error: sessionError } = await sb.from("merchant_shift_sessions").insert({
        merchant_id: merchantId,
        team_member_id: memberId,
        token_hash: tokenHash,
        expires_at: expiresAt,
      });
      if (sessionError) return c.json({ error: sessionError.message }, 500);

      return c.json({
        shiftToken: token,
        expiresAt,
        member: mapRosterMember(updated as Record<string, unknown>),
      });
    } catch (err) {
      console.error("pin/create failed", err);
      return c.json({
        error: err instanceof Error ? err.message : "PIN setup failed",
      }, 500);
    }
  });

  app.post("/merchant/station/pin/verify", async (c) => {
    const access = await requireStationDevice(c);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const memberId = String(body.memberId || "");
    const pin = String(body.pin || "");

    if (!memberId) return c.json({ error: "memberId is required" }, 400);

    const pinError = validatePinFormat(pin);
    if (pinError) return c.json({ error: pinError }, 400);

    const sb = getServiceSb();
    const merchantId = merchantIdFromAccess(access);

    const { data: member } = await sb
      .from("merchant_team_members")
      .select("*")
      .eq("id", memberId)
      .eq("merchant_id", merchantId)
      .eq("login_type", "roster")
      .single();

    if (!member) return c.json({ error: "Staff member not found" }, 404);

    const row = member as Record<string, unknown>;
    if (String(row.pin_status) === "unset" || String(row.pin_status) === "locked") {
      return c.json({ error: "Create a new PIN to continue", code: "pin_setup_required" }, 403);
    }

    if (pinRateLimitLocked(row.pin_locked_until as string | null)) {
      return c.json({ error: "Too many attempts. Try again later.", code: "pin_locked" }, 429);
    }

    const valid = await verifyPin(pin, String(row.pin_hash || ""));
    if (!valid) {
      const attempts = Number(row.pin_failed_attempts || 0) + 1;
      const updates: Record<string, unknown> = {
        pin_failed_attempts: attempts,
        updated_at: new Date().toISOString(),
      };
      if (attempts >= PIN_MAX_ATTEMPTS) {
        updates.pin_locked_until = nextPinLockoutUntil();
        updates.pin_failed_attempts = 0;
      }
      await sb.from("merchant_team_members").update(updates).eq("id", memberId);
      return c.json({ error: "Wrong PIN, try again", code: "pin_invalid" }, 401);
    }

    await sb.from("merchant_team_members").update({
      pin_failed_attempts: 0,
      pin_locked_until: null,
      updated_at: new Date().toISOString(),
    }).eq("id", memberId);

    const { token, expiresAt } = await issueShiftToken(memberId, merchantId);
    const tokenHash = await hashShiftToken(token);
    await sb.from("merchant_shift_sessions").insert({
      merchant_id: merchantId,
      team_member_id: memberId,
      token_hash: tokenHash,
      expires_at: expiresAt,
    });

    return c.json({
      shiftToken: token,
      expiresAt,
      member: mapRosterMember(row),
    });
  });

  app.post("/merchant/station/shift/end", async (c) => {
    const access = await requireStationDevice(c);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const shiftToken = c.req.header("X-Staff-Shift-Token");
    if (!shiftToken) return c.json({ error: "Shift token required" }, 400);

    const validated = await validateShiftToken(shiftToken);
    const merchantId = merchantIdFromAccess(access);
    if (!validated || validated.merchantId !== merchantId) {
      return c.json({ error: "Invalid shift session" }, 401);
    }

    const sb = getServiceSb();
    const tokenHash = await hashShiftToken(shiftToken);
    await sb
      .from("merchant_shift_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .is("ended_at", null);

    return c.json({ ok: true });
  });

  app.get("/merchant/station/pairing", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;
    const merchant = access.resolved.merchant as Record<string, unknown>;
    const code = await ensurePairingCode(sb, merchantId);

    const origin = c.req.header("origin") || "https://partner.roamdash.co";
    const stationLinks = buildStationDeepLinks(origin, code);

    return c.json({
      storeName: String(merchant.name || "Store"),
      pairingCode: code,
      stationLinks,
      staffOperationsEnabled: Boolean(merchant.staff_operations_enabled),
      staffStationPinEnabled: Boolean(merchant.staff_station_pin_enabled),
    });
  });

  app.patch("/merchant/station/pairing/flags", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const updates: Record<string, unknown> = {};
    if (body.staffOperationsEnabled != null) {
      updates.staff_operations_enabled = Boolean(body.staffOperationsEnabled);
    }
    if (body.staffStationPinEnabled != null) {
      updates.staff_station_pin_enabled = Boolean(body.staffStationPinEnabled);
    }
    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No flags to update" }, 400);
    }

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;
    const { data, error } = await sb
      .from("merchants")
      .update(updates)
      .eq("id", merchantId)
      .select("name, kiosk_pairing_code, staff_operations_enabled, staff_station_pin_enabled")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    const row = data as Record<string, unknown>;
    const code = String(row.kiosk_pairing_code || await ensurePairingCode(sb, merchantId));
    const origin = c.req.header("origin") || "https://partner.roamdash.co";

    return c.json({
      storeName: String(row.name || "Store"),
      pairingCode: code,
      stationLinks: buildStationDeepLinks(origin, code),
      staffOperationsEnabled: Boolean(row.staff_operations_enabled),
      staffStationPinEnabled: Boolean(row.staff_station_pin_enabled),
    });
  });

  app.post("/merchant/station/pairing/regenerate", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;
    const code = generatePairingCode();

    await sb
      .from("merchant_station_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("merchant_id", merchantId)
      .is("revoked_at", null);

    const { data, error } = await sb
      .from("merchants")
      .update({
        kiosk_pairing_code: code,
        kiosk_pairing_rotated_at: new Date().toISOString(),
      })
      .eq("id", merchantId)
      .select("name, staff_operations_enabled, staff_station_pin_enabled")
      .single();

    if (error) return c.json({ error: error.message }, 500);
    const row = data as Record<string, unknown>;
    const origin = c.req.header("origin") || "https://partner.roamdash.co";

    return c.json({
      storeName: String(row.name || "Store"),
      pairingCode: code,
      stationLinks: buildStationDeepLinks(origin, code),
      staffOperationsEnabled: Boolean(row.staff_operations_enabled),
      staffStationPinEnabled: Boolean(row.staff_station_pin_enabled),
    });
  });

  app.post("/merchant/station/device/enroll", async (c) => {
    const clientKey = c.req.header("x-forwarded-for") ||
      c.req.header("cf-connecting-ip") ||
      "unknown";
    if (!enrollRateLimitOk(clientKey)) {
      return c.json({ error: "Too many attempts. Try again shortly." }, 429);
    }

    const body = await c.req.json();
    const code = normalizePairingCode(String(body.code || ""));
    const station = String(body.station || "");
    if (!code) return c.json({ error: "Store code is required" }, 400);
    if (!isValidStation(station)) return c.json({ error: "Invalid station" }, 400);

    const sb = getServiceSb();
    const { data: merchant } = await sb
      .from("merchants")
      .select("id, name, verification_status, staff_station_pin_enabled, staff_operations_enabled")
      .eq("kiosk_pairing_code", code)
      .maybeSingle();

    if (!merchant) return c.json({ error: "Invalid store code" }, 404);
    const row = merchant as Record<string, unknown>;
    if (String(row.verification_status) !== "approved") {
      return c.json({ error: "Store is not active yet" }, 403);
    }
    if (!row.staff_station_pin_enabled) {
      return c.json({ error: "Tablet sign-in is not enabled for this store" }, 403);
    }

    const merchantId = String(row.id);
    const { data: deviceRow, error: deviceError } = await sb
      .from("merchant_station_devices")
      .insert({
        merchant_id: merchantId,
        station,
        token_hash: "pending",
      })
      .select("id")
      .single();

    if (deviceError || !deviceRow) {
      return c.json({ error: deviceError?.message || "Could not enroll device" }, 500);
    }

    const deviceId = String((deviceRow as Record<string, unknown>).id);
    const { token, expiresAt } = await issueDeviceToken(deviceId, merchantId);
    const tokenHash = await hashDeviceToken(token);

    await sb
      .from("merchant_station_devices")
      .update({ token_hash: tokenHash })
      .eq("id", deviceId);

    return c.json({
      deviceToken: token,
      expiresAt,
      merchantId,
      storeName: String(row.name || "Store"),
      station,
      staffOperationsEnabled: Boolean(row.staff_operations_enabled),
      staffStationPinEnabled: Boolean(row.staff_station_pin_enabled),
    });
  });

  app.get("/merchant/station/device/ping", async (c) => {
    const access = await requireStationDevice(c);
    if (!access.ok) return c.json({ error: access.message }, access.status);
    if (access.mode !== "device") {
      return c.json({ error: "Device token required" }, 400);
    }

    return c.json({
      ok: true,
      merchantId: access.merchantId,
      station: access.station,
      storeName: String(access.merchant.name || "Store"),
      staffOperationsEnabled: Boolean(access.merchant.staff_operations_enabled),
      staffStationPinEnabled: Boolean(access.merchant.staff_station_pin_enabled),
    });
  });

  app.post("/merchant/station/device/revoke", async (c) => {
    const deviceToken = c.req.header("X-Station-Device-Token");
    const authHeader = c.req.header("Authorization");
    const sb = getServiceSb();

    if (deviceToken) {
      const access = await resolveStationAccess(c);
      if (!access.ok || access.mode !== "device") {
        return c.json({ error: "Invalid device session" }, 401);
      }
      await sb
        .from("merchant_station_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", access.deviceId);
      return c.json({ ok: true });
    }

    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);
    const access = await requireOwnerMerchant(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json().catch(() => ({}));
    const deviceId = body.deviceId ? String(body.deviceId) : null;
    const merchantId = access.resolved.merchant.id as string;

    let query = sb
      .from("merchant_station_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("merchant_id", merchantId)
      .is("revoked_at", null);

    if (deviceId) query = query.eq("id", deviceId);

    await query;
    return c.json({ ok: true });
  });
}

export async function resolveEnrolledDevice(
  deviceToken: string,
  sb: SupabaseClient,
): Promise<{ merchantId: string; deviceId: string } | null> {
  const validated = await validateDeviceToken(deviceToken);
  if (!validated) return null;

  const tokenHash = await hashDeviceToken(deviceToken);
  const { data: device } = await sb
    .from("merchant_station_devices")
    .select("id, merchant_id, revoked_at")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();

  if (!device) return null;
  const row = device as Record<string, unknown>;
  if (String(row.id) !== validated.deviceId ||
    String(row.merchant_id) !== validated.merchantId) {
    return null;
  }

  return { merchantId: validated.merchantId, deviceId: validated.deviceId };
}

export async function resolveShiftTokenFromRequest(
  shiftTokenHeader: string | undefined,
  merchantId: string,
  sb: SupabaseClient,
): Promise<{ teamMemberId: string } | null> {
  if (!shiftTokenHeader) return null;

  const validated = await validateShiftToken(shiftTokenHeader);
  if (!validated || validated.merchantId !== merchantId) return null;

  const tokenHash = await hashShiftToken(shiftTokenHeader);
  const { data: session } = await sb
    .from("merchant_shift_sessions")
    .select("id, team_member_id, expires_at")
    .eq("token_hash", tokenHash)
    .is("ended_at", null)
    .maybeSingle();

  if (!session) return null;
  const row = session as Record<string, unknown>;
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return null;

  return { teamMemberId: String(row.team_member_id) };
}
