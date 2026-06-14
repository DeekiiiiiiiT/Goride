/**
 * Driver admin compliance routes — queue listing and background-check updates.
 */
import type { Hono } from "https://deno.land/x/hono@v4.3.11/mod.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getJwtRoles, jwtPrimaryRole } from "../../_shared/authEdge.ts";
import { getDriverAdminDb } from "../../_shared/driverAdminDb.ts";
import type { ProductAdminUser } from "../../_shared/productAdmin.ts";
import { driverAudit } from "./audit.ts";
import {
  canForceApprove,
  canStrictApprove,
  computeComplianceBlockers,
  isInComplianceQueue,
  type ComplianceProfileInput,
  type DriverComplianceBlocker,
} from "./complianceLogic.ts";
import {
  requireWrite,
} from "./permissions.ts";

interface Deps {
  svc: () => SupabaseClient;
}

function serviceAuth() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

function isDriverUser(user: {
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): boolean {
  if (getJwtRoles(user).includes("driver")) return true;
  const surface = user.user_metadata?.surface;
  if (surface === "driver") return true;
  return jwtPrimaryRole(user) === "driver";
}

function profileInput(row: Record<string, unknown>): ComplianceProfileInput {
  return {
    status: (row.status as ComplianceProfileInput["status"]) ?? "pending",
    mode: (row.mode as string) ?? "independent",
    onboarding_complete: Boolean(row.onboarding_complete),
    background_check_status: (row.background_check_status as string | null) ?? null,
    insurance_expiry: (row.insurance_expiry as string | null) ?? null,
  };
}

function buildComplianceRow(
  profile: Record<string, unknown> | null,
  hasVehicle: boolean,
  email: string,
  adminRoles: string[],
): Record<string, unknown> {
  const input = profile ? profileInput(profile) : null;
  const blockers = computeComplianceBlockers(input, hasVehicle);
  const status = input?.status ?? "pending";
  return {
    driver_id: profile ? (profile.user_id as string) : null,
    driver_name: profile ? ((profile.display_name as string | null) ?? null) : null,
    driver_email: email,
    account_status: status,
    mode: input?.mode ?? "independent",
    onboarding_complete: input?.onboarding_complete ?? false,
    background_check_status: input?.background_check_status ?? null,
    insurance_expiry: input?.insurance_expiry ?? null,
    has_vehicle: hasVehicle,
    blockers,
    can_strict_approve: canStrictApprove(blockers, status),
    can_force_approve: canForceApprove(adminRoles, blockers, status),
    created_at: profile ? ((profile.created_at as string | null) ?? null) : null,
  };
}

async function fetchVehicleCountsByProfileId(
  db: SupabaseClient,
  profileIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!profileIds.length) return counts;

  const { data } = await db
    .from("driver_vehicles")
    .select("driver_profile_id")
    .in("driver_profile_id", profileIds);

  for (const row of data ?? []) {
    const pid = row.driver_profile_id as string;
    counts.set(pid, (counts.get(pid) ?? 0) + 1);
  }
  return counts;
}

export function registerComplianceRoutes(admin: Hono, deps: Deps) {
  admin.get("/compliance", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const legacyStatus = c.req.query("status");
    const queueOnly = c.req.query("queue") !== "false";
    const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
    const offset = Math.max(parseInt(c.req.query("offset") ?? "0"), 0);

    const resolved = await getDriverAdminDb();
    const { db, tables } = resolved;

    const { data: profiles, error } = await db
      .from(tables.driver_profiles)
      .select(
        "id, user_id, display_name, phone, mode, onboarding_complete, background_check_status, insurance_expiry, status, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return c.json({ drivers: [], total: 0, error: error.message }, 500);
    }

    const profileIds = (profiles ?? []).map((p) => p.id as string);
    const vehicleCounts = await fetchVehicleCountsByProfileId(db, profileIds);

    const auth = deps.svc();
    const profileByUserId = new Map(
      (profiles ?? []).map((p) => [p.user_id as string, p]),
    );

    const rows: Record<string, unknown>[] = [];

    for (const p of profiles ?? []) {
      const uid = p.user_id as string;
      const hasVehicle = (vehicleCounts.get(p.id as string) ?? 0) > 0;
      const { data: u } = await auth.auth.admin.getUserById(uid);
      const email = u?.user?.email ?? "";

      const blockers = computeComplianceBlockers(profileInput(p), hasVehicle);
      const status = (p.status as ComplianceProfileInput["status"]) ?? "pending";

      if (legacyStatus === "pending" && Boolean(p.onboarding_complete)) continue;
      if (legacyStatus === "complete" && !Boolean(p.onboarding_complete)) continue;

      if (queueOnly && legacyStatus == null && !isInComplianceQueue(blockers, status)) {
        continue;
      }

      rows.push({
        ...buildComplianceRow(p, hasVehicle, email, adminUser.roles),
        driver_id: uid,
      });
    }

    // Auth-only driver accounts without a profile row
    if (queueOnly && legacyStatus == null) {
      let page = 1;
      const perPage = 200;
      for (;;) {
        const { data: list, error: listErr } = await auth.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr || !list?.users?.length) break;
        for (const u of list.users) {
          if (!isDriverUser(u)) continue;
          if (profileByUserId.has(u.id)) continue;
          const blockers: DriverComplianceBlocker[] = ["no_profile"];
          rows.push({
            driver_id: u.id,
            driver_name: null,
            driver_email: u.email ?? "",
            account_status: "pending",
            mode: "independent",
            onboarding_complete: false,
            background_check_status: null,
            insurance_expiry: null,
            has_vehicle: false,
            blockers,
            can_strict_approve: false,
            can_force_approve: false,
            created_at: u.created_at ?? null,
          });
        }
        if (list.users.length < perPage) break;
        page++;
        if (page > 25) break;
      }
    }

    rows.sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at as string).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at as string).getTime() : 0;
      return tb - ta;
    });

    const total = rows.length;
    const page = rows.slice(offset, offset + limit);

    return c.json({ drivers: page, total, limit, offset });
  });

  admin.patch("/compliance/:driverId", async (c) => {
    const adminUser = c.get("adminUser") as ProductAdminUser;
    const denied = requireWrite(adminUser);
    if (denied) return denied;

    const driverId = c.req.param("driverId");
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const resolved = await getDriverAdminDb();
    const { db } = resolved;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const bgValues = new Set(["pending", "approved", "rejected"]);
    if (typeof body.background_check === "string") {
      if (!bgValues.has(body.background_check)) {
        return c.json({
          ok: false,
          error: "invalid_background_check",
          message: "background_check must be pending, approved, or rejected",
        }, 400);
      }
      patch.background_check_status = body.background_check;
      if (body.background_check === "approved") {
        patch.background_check_date = new Date().toISOString().slice(0, 10);
      }
      if (body.background_check === "pending" || body.background_check === "rejected") {
        patch.background_check_date = null;
      }
    }

    if (typeof body.insurance_expiry === "string" && body.insurance_expiry.trim()) {
      patch.insurance_expiry = body.insurance_expiry.trim().slice(0, 10);
    } else if (body.insurance_expiry === null) {
      patch.insurance_expiry = null;
    }

    if (Object.keys(patch).length <= 1) {
      return c.json({ ok: false, error: "no_updates", message: "No valid fields to update" }, 400);
    }

    const { data: profile, error } = await db
      .from("driver_profiles")
      .update(patch)
      .eq("user_id", driverId)
      .select(
        "id, user_id, display_name, mode, onboarding_complete, background_check_status, insurance_expiry, status, created_at",
      )
      .maybeSingle();

    if (error) return c.json({ ok: false, error: error.message }, 400);
    if (!profile) return c.json({ ok: false, error: "not_found", message: "Driver profile not found" }, 404);

    const { data: vehicles } = await db
      .from("driver_vehicles")
      .select("id")
      .eq("driver_profile_id", profile.id as string)
      .limit(1);

    const auth = deps.svc();
    const { data: u } = await auth.auth.admin.getUserById(driverId);

    await driverAudit(adminUser.id, "admin_driver_compliance_updated", {
      driver_user_id: driverId,
      updates: body,
      admin_email: adminUser.email,
    });

    const hasVehicle = (vehicles ?? []).length > 0;
    return c.json({
      ok: true,
      driver: buildComplianceRow(profile, hasVehicle, u?.user?.email ?? "", adminUser.roles),
    });
  });
}
