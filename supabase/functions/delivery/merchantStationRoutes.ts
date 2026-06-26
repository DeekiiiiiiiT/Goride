import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  resolveMerchantAccess,
  type MerchantMembership,
  type ResolvedMerchantAccess,
} from "./merchantAuth.ts";
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
  jobStationRequiresOrders,
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

async function requireStationDevice(
  authHeader: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  const supabase = getSupabaseFromDeps(authHeader);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Unauthorized" };

  const resolved = await resolveMerchantAccess(user.id, user.email);
  if (!resolved) return { ok: false, status: 403, message: "Not a merchant" };
  if (!canUseStationKiosk(resolved.membership)) {
    return { ok: false, status: 403, message: "Station kiosk requires owner or manager login" };
  }

  return { ok: true, user, resolved };
}

async function requireOwnerMerchant(
  authHeader: string,
): Promise<
  | { ok: true; user: { id: string; email?: string | null }; resolved: ResolvedMerchantAccess }
  | { ok: false; status: number; message: string }
> {
  const access = await requireStationDevice(authHeader);
  if (!access.ok) return access;
  if (!access.resolved.membership.is_owner) {
    return { ok: false, status: 403, message: "Only the store owner can manage team members" };
  }
  return access;
}

function mapRosterMember(row: Record<string, unknown>) {
  const jobStation = row.job_station;
  return {
    id: String(row.id),
    name: String(row.name),
    jobStation:
      jobStation === "counter" || jobStation === "kitchen" ? String(jobStation) : null,
    pinStatus: String(row.pin_status),
  };
}

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

    const station = parseJobStationInput(body.jobStation, "staff");
    if (!station || !jobStationRequiresOrders(station)) {
      return c.json({ error: "Job station must be counter or kitchen" }, 400);
    }

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

    const { data, error } = await sb
      .from("merchant_team_members")
      .insert({
        merchant_id: merchantId,
        name,
        role: "staff",
        permissions: ["orders"],
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
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireStationDevice(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

    const { data, error } = await sb
      .from("merchant_team_members")
      .select("id, name, job_station, pin_status")
      .eq("merchant_id", merchantId)
      .eq("login_type", "roster")
      .in("job_station", ["counter", "kitchen"])
      .order("name");

    if (error) return c.json({ error: error.message }, 500);
    return c.json({
      members: (data || []).map((row) => mapRosterMember(row as Record<string, unknown>)),
    });
  });

  app.post("/merchant/station/pin/create", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireStationDevice(authHeader);
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
    const merchantId = access.resolved.merchant.id as string;

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
      member: mapRosterMember(updated as Record<string, unknown>),
    });
  });

  app.post("/merchant/station/pin/verify", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireStationDevice(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const body = await c.req.json();
    const memberId = String(body.memberId || "");
    const pin = String(body.pin || "");

    if (!memberId) return c.json({ error: "memberId is required" }, 400);

    const pinError = validatePinFormat(pin);
    if (pinError) return c.json({ error: pinError }, 400);

    const sb = getServiceSb();
    const merchantId = access.resolved.merchant.id as string;

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
    const authHeader = c.req.header("Authorization");
    if (!authHeader) return c.json({ error: "Unauthorized" }, 401);

    const access = await requireStationDevice(authHeader);
    if (!access.ok) return c.json({ error: access.message }, access.status);

    const shiftToken = c.req.header("X-Staff-Shift-Token");
    if (!shiftToken) return c.json({ error: "Shift token required" }, 400);

    const validated = await validateShiftToken(shiftToken);
    if (!validated || validated.merchantId !== access.resolved.merchant.id) {
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
