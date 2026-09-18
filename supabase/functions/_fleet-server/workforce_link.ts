/**
 * Single write contracts for linking driver / courier accounts to a fleet org.
 * Drivers: auth metadata + KV roster + driver_profiles.
 * Couriers: courier_profiles (mode=fleet) + KV roster with serviceLines rush_delivery
 * (Fleet Couriers / Dashboard read the same drivers roster filtered by service line).
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type * as KvStore from "./kv_store.tsx";

export type UpsertDriverProfileFn = (opts: {
  userId: string;
  mode: "fleet" | "independent";
  fleetId?: string | null;
  displayName?: string | null;
  status?: string;
  onboardingComplete?: boolean;
  markFleetJoined?: boolean;
}) => Promise<void>;

export interface WorkforceLinkDeps {
  supabase: SupabaseClient;
  kv: typeof KvStore;
  upsertDriverProfile: UpsertDriverProfileFn;
  invalidateDriverCache: () => void;
}

/** Courier link only needs roster + courier_profiles (no driver_profiles upsert). */
export interface WorkforceCourierLinkDeps {
  supabase: SupabaseClient;
  kv: typeof KvStore;
  invalidateDriverCache: () => void;
}

type ServiceLine = "rideshare" | "rush_delivery";

function normalizeServiceLines(raw: unknown): ServiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is ServiceLine => l === "rideshare" || l === "rush_delivery");
}

/** Ensure rush_delivery is on the roster row; preserve rideshare when already present. */
export function mergeRushIntoServiceLines(
  existing: unknown,
  opts?: { treatMissingAsRideshare?: boolean },
): ServiceLine[] {
  const prior = normalizeServiceLines(existing);
  if (prior.length) {
    return prior.includes("rush_delivery") ? prior : [...prior, "rush_delivery"];
  }
  if (opts?.treatMissingAsRideshare) return ["rideshare", "rush_delivery"];
  return ["rush_delivery"];
}

/** Keeps Postgres `driver_profiles` aligned with KV + auth (service role bypasses RLS). */
export async function upsertDriverProfileFromServer(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    mode: "fleet" | "independent";
    fleetId?: string | null;
    displayName?: string | null;
    status?: string;
    onboardingComplete?: boolean;
    markFleetJoined?: boolean;
  },
): Promise<void> {
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: opts.userId,
    mode: opts.mode,
    display_name: opts.displayName ?? null,
    status: opts.status ?? "active",
    onboarding_complete: opts.onboardingComplete ?? false,
    updated_at: now,
  };
  if (opts.mode === "fleet" && opts.fleetId) {
    row.fleet_id = opts.fleetId;
    if (opts.markFleetJoined) row.fleet_joined_at = now;
  } else {
    row.fleet_id = null;
    row.fleet_joined_at = null;
  }
  const { error } = await supabase.from("driver_profiles").upsert(row, { onConflict: "user_id" });
  if (error) console.warn("[driver_profiles] upsert failed:", error.message);
}

export async function getDriverFleetMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ currentFleetId: string | null; meta: Record<string, unknown> }> {
  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) {
    throw new Error("User not found");
  }
  const meta = (authData.user.user_metadata || {}) as Record<string, unknown>;
  const { data: existingProf } = await supabase
    .from("driver_profiles")
    .select("fleet_id")
    .eq("user_id", userId)
    .maybeSingle();

  const currentFleetId =
    (typeof meta.organizationId === "string" && meta.organizationId.trim()) ||
    (existingProf?.fleet_id ? String(existingProf.fleet_id) : "") ||
    null;

  return { currentFleetId: currentFleetId || null, meta };
}

export type LinkDriverResult = { success: true; alreadyMember?: boolean };

/**
 * Link driver to fleet: metadata + KV roster + driver_profiles.
 * Refuses overwrite of a different fleet (409 semantics via thrown error).
 */
export async function linkDriverToFleet(
  deps: WorkforceLinkDeps,
  userId: string,
  fleetId: string,
): Promise<LinkDriverResult> {
  const trimmedFleetId = fleetId.trim();
  if (!trimmedFleetId) throw new Error("fleetId is required");

  const { data: org, error: orgErr } = await deps.supabase
    .from("organizations")
    .select("id")
    .eq("id", trimmedFleetId)
    .maybeSingle();
  if (orgErr || !org) throw new Error("Fleet not found");

  const { currentFleetId, meta } = await getDriverFleetMembership(deps.supabase, userId);

  if (currentFleetId && currentFleetId !== trimmedFleetId) {
    const err = new Error(
      "You are already linked to a fleet. Ask your current fleet owner to remove you first.",
    );
    (err as Error & { status?: number }).status = 409;
    throw err;
  }
  if (currentFleetId === trimmedFleetId) {
    return { success: true, alreadyMember: true };
  }

  const { data: authData, error: authErr } = await deps.supabase.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) throw new Error("User not found");

  const { data: existingProf } = await deps.supabase
    .from("driver_profiles")
    .select("onboarding_complete")
    .eq("user_id", userId)
    .maybeSingle();

  await deps.supabase.auth.admin.updateUserById(userId, {
    user_metadata: { ...meta, organizationId: trimmedFleetId },
  });

  const driverKv = await deps.kv.get(`driver:${userId}`);
  if (driverKv) {
    await deps.kv.set(`driver:${userId}`, { ...driverKv, organizationId: trimmedFleetId });
  } else {
    const email = authData.user.email || "";
    const driverName =
      (typeof meta.name === "string" && meta.name) || email.split("@")[0] || "Driver";
    await deps.kv.set(`driver:${userId}`, {
      id: userId,
      driverId: userId,
      driverName,
      email,
      status: "active",
      createdAt: new Date().toISOString(),
      acceptanceRate: 0,
      cancellationRate: 0,
      completionRate: 0,
      ratingLast500: 5.0,
      totalEarnings: 0,
      organizationId: trimmedFleetId,
    });
  }

  await deps.upsertDriverProfile({
    userId,
    mode: "fleet",
    fleetId: trimmedFleetId,
    displayName: typeof meta.name === "string" ? meta.name : null,
    status: "active",
    onboardingComplete: existingProf?.onboarding_complete === true,
    markFleetJoined: true,
  });

  deps.invalidateDriverCache();
  return { success: true };
}

export type LinkCourierResult =
  | { success: true; alreadyMember?: boolean }
  | { success: false; error: string; status: 404 | 409 };

/**
 * Link courier to fleet: courier_profiles mode=fleet + KV roster with rush_delivery.
 * Idempotent for same fleet (heals missing roster / serviceLines). Refuses other fleet (409).
 */
export async function linkCourierToFleet(
  deps: WorkforceCourierLinkDeps,
  userId: string,
  fleetId: string,
): Promise<LinkCourierResult> {
  const trimmedFleetId = fleetId.trim();
  if (!trimmedFleetId) throw new Error("fleetId is required");

  const { data: org, error: orgErr } = await deps.supabase
    .from("organizations")
    .select("id")
    .eq("id", trimmedFleetId)
    .maybeSingle();
  if (orgErr || !org) throw new Error("Fleet not found");

  const { data: existingCourier, error: courierReadErr } = await deps.supabase
    .schema("delivery")
    .from("courier_profiles")
    .select("user_id, mode, fleet_id, display_name, phone, email, status, total_deliveries")
    .eq("user_id", userId)
    .maybeSingle();
  if (courierReadErr) throw courierReadErr;
  if (!existingCourier) {
    return {
      success: false,
      error: "Complete courier profile setup before joining a fleet",
      status: 404,
    };
  }
  if (
    existingCourier.mode === "fleet" &&
    existingCourier.fleet_id &&
    existingCourier.fleet_id !== trimmedFleetId
  ) {
    return { success: false, error: "Already linked to another fleet", status: 409 };
  }

  const alreadyMember =
    existingCourier.mode === "fleet" && existingCourier.fleet_id === trimmedFleetId;

  if (!alreadyMember) {
    const { error: courierErr } = await deps.supabase.schema("delivery").from("courier_profiles")
      .update({
        mode: "fleet",
        fleet_id: trimmedFleetId,
        fleet_joined_at: new Date().toISOString(),
        fleet_role: "courier",
      })
      .eq("user_id", userId);
    if (courierErr) throw courierErr;
  }

  const { data: authData, error: authErr } = await deps.supabase.auth.admin.getUserById(userId);
  if (authErr || !authData?.user) throw new Error("User not found");

  const meta = (authData.user.user_metadata || {}) as Record<string, unknown>;
  const metaOrg =
    typeof meta.organizationId === "string" && meta.organizationId.trim()
      ? meta.organizationId.trim()
      : null;
  if (metaOrg && metaOrg !== trimmedFleetId) {
    return {
      success: false,
      error: "Already linked to another fleet",
      status: 409,
    };
  }
  if (metaOrg !== trimmedFleetId) {
    await deps.supabase.auth.admin.updateUserById(userId, {
      user_metadata: { ...meta, organizationId: trimmedFleetId },
    });
  }

  const email =
    (typeof existingCourier.email === "string" && existingCourier.email) ||
    authData.user.email ||
    "";
  const displayName =
    (typeof existingCourier.display_name === "string" && existingCourier.display_name.trim()) ||
    (typeof meta.name === "string" && meta.name) ||
    email.split("@")[0] ||
    "Courier";
  const phone =
    (typeof existingCourier.phone === "string" && existingCourier.phone) ||
    authData.user.phone ||
    "";
  const status =
    (typeof existingCourier.status === "string" && existingCourier.status) || "active";

  // Only treat blank serviceLines as rideshare when this user is already a
  // rideshare fleet driver. Courier-only joins must stay rush_delivery-only
  // (legacy empty-lines default was incorrectly tagging them as rideshare).
  const { data: driverProf } = await deps.supabase
    .from("driver_profiles")
    .select("mode, fleet_id")
    .eq("user_id", userId)
    .maybeSingle();
  const isRideshareFleetMember =
    driverProf?.mode === "fleet" &&
    !!driverProf?.fleet_id &&
    String(driverProf.fleet_id) === trimmedFleetId;

  const driverKv = await deps.kv.get(`driver:${userId}`);
  if (driverKv && typeof driverKv === "object") {
    const kvOrg =
      typeof (driverKv as { organizationId?: string }).organizationId === "string"
        ? String((driverKv as { organizationId: string }).organizationId)
        : null;
    if (kvOrg && kvOrg !== trimmedFleetId) {
      return {
        success: false,
        error: "Already linked to another fleet",
        status: 409,
      };
    }
    const serviceLines = mergeRushIntoServiceLines(
      (driverKv as { serviceLines?: unknown }).serviceLines,
      { treatMissingAsRideshare: isRideshareFleetMember },
    );
    const needsWrite =
      kvOrg !== trimmedFleetId ||
      JSON.stringify(normalizeServiceLines((driverKv as { serviceLines?: unknown }).serviceLines)) !==
        JSON.stringify(serviceLines);
    if (needsWrite) {
      await deps.kv.set(`driver:${userId}`, {
        ...driverKv,
        organizationId: trimmedFleetId,
        serviceLines,
        // Keep portal name fields populated for Couriers list
        driverName:
          (driverKv as { driverName?: string }).driverName ||
          (driverKv as { name?: string }).name ||
          displayName,
        name: (driverKv as { name?: string }).name || displayName,
        email: (driverKv as { email?: string }).email || email,
        phone: (driverKv as { phone?: string }).phone || phone,
      });
      deps.invalidateDriverCache();
    }
  } else {
    await deps.kv.set(`driver:${userId}`, {
      id: userId,
      driverId: userId,
      driverName: displayName,
      name: displayName,
      email,
      phone,
      status,
      createdAt: new Date().toISOString(),
      acceptanceRate: 0,
      cancellationRate: 0,
      completionRate: 0,
      ratingLast500: 5.0,
      totalEarnings: 0,
      totalTrips:
        typeof existingCourier.total_deliveries === "number"
          ? existingCourier.total_deliveries
          : 0,
      organizationId: trimmedFleetId,
      serviceLines: ["rush_delivery"] as ServiceLine[],
    });
    deps.invalidateDriverCache();
  }

  return { success: true, alreadyMember: alreadyMember || undefined };
}

/**
 * Ensure every fleet-linked courier_profiles row is on the org drivers roster
 * with serviceLines including rush_delivery (heals pre-gap accepts).
 * Also strips spurious rideshare from courier-only rows (no driver_profiles fleet).
 */
export async function healOrgCourierRoster(
  deps: WorkforceCourierLinkDeps,
  orgId: string,
  drivers: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const trimmed = orgId.trim();
  if (!trimmed) return drivers;

  const { data: couriers, error } = await deps.supabase
    .schema("delivery")
    .from("courier_profiles")
    .select("user_id")
    .eq("mode", "fleet")
    .eq("fleet_id", trimmed);
  if (error || !couriers?.length) return drivers;

  const courierIds = couriers.map((cp) => String(cp.user_id)).filter(Boolean);
  const rideshareFleetIds = new Set<string>();
  if (courierIds.length) {
    const { data: dps } = await deps.supabase
      .from("driver_profiles")
      .select("user_id, mode, fleet_id")
      .in("user_id", courierIds);
    for (const dp of dps ?? []) {
      if (
        dp?.mode === "fleet" &&
        dp?.fleet_id &&
        String(dp.fleet_id) === trimmed
      ) {
        rideshareFleetIds.add(String(dp.user_id));
      }
    }
  }

  const byId = new Map(
    drivers
      .filter((d) => d && typeof d === "object" && d.id)
      .map((d) => [String(d.id), d]),
  );
  let healed = false;

  for (const cp of couriers) {
    const id = String(cp.user_id);
    const existing = byId.get(id);
    const lines = normalizeServiceLines(existing?.serviceLines);
    const dualOk = rideshareFleetIds.has(id);

    if (existing && lines.includes("rush_delivery")) {
      // Courier-only wrongly tagged rideshare → Drivers tab leak
      if (lines.includes("rideshare") && !dualOk) {
        const fixed: Record<string, unknown> = {
          ...existing,
          serviceLines: ["rush_delivery"] as ServiceLine[],
        };
        await deps.kv.set(`driver:${id}`, fixed);
        byId.set(id, fixed);
        healed = true;
      }
      continue;
    }

    const linked = await linkCourierToFleet(deps, id, trimmed);
    if (!linked.success) continue;
    const row = await deps.kv.get(`driver:${id}`);
    if (row && typeof row === "object") {
      byId.set(id, row as Record<string, unknown>);
      healed = true;
    }
  }

  if (!healed) return drivers;
  deps.invalidateDriverCache();
  return Array.from(byId.values());
}

export type UnlinkCourierResult =
  | { success: true; wasMember: boolean }
  | { success: false; error: string; status: 400 | 404 };

/**
 * Reverse of linkCourierToFleet: independent mode, clear fleet_id, release vehicles,
 * strip rush_delivery from roster when courier-only (keep org if still rideshare fleet).
 */
export async function unlinkCourierFromFleet(
  deps: WorkforceCourierLinkDeps,
  userId: string,
): Promise<UnlinkCourierResult> {
  const { data: existingCourier, error: courierReadErr } = await deps.supabase
    .schema("delivery")
    .from("courier_profiles")
    .select("user_id, mode, fleet_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (courierReadErr) throw courierReadErr;
  if (!existingCourier) {
    return { success: false, error: "Courier profile not found", status: 404 };
  }
  if (existingCourier.mode !== "fleet" || !existingCourier.fleet_id) {
    return { success: false, error: "You are not linked to a fleet", status: 400 };
  }

  const leftFleetId = String(existingCourier.fleet_id);

  const { error: courierErr } = await deps.supabase.schema("delivery").from("courier_profiles")
    .update({
      mode: "independent",
      fleet_id: null,
      fleet_joined_at: null,
      fleet_role: null,
    })
    .eq("user_id", userId);
  if (courierErr) throw courierErr;

  const { data: driverProf } = await deps.supabase
    .from("driver_profiles")
    .select("mode, fleet_id")
    .eq("user_id", userId)
    .maybeSingle();
  const stillRideshareFleet =
    driverProf?.mode === "fleet" &&
    driverProf?.fleet_id &&
    String(driverProf.fleet_id) === leftFleetId;

  const { data: authData } = await deps.supabase.auth.admin.getUserById(userId);
  if (authData?.user) {
    const meta = (authData.user.user_metadata || {}) as Record<string, unknown>;
    const metaOrg =
      typeof meta.organizationId === "string" ? meta.organizationId.trim() : "";
    if (metaOrg === leftFleetId && !stillRideshareFleet) {
      await deps.supabase.auth.admin.updateUserById(userId, {
        user_metadata: { ...meta, organizationId: null },
      });
    }
  }

  // Release fleet vehicles pointing at this courier
  try {
    const { fromKvStore } = await import("./fleet_sql_bridge.ts");
    const { applyDriverAssignmentChangeOnVehicle } = await import("./driver_vehicle_assignment.ts");
    const { data: vehicleRowsRaw } = await fromKvStore()
      .select("key, value")
      .like("key", "vehicle:%")
      .eq("value->>currentDriverId", userId);
    const vehicleRows = (Array.isArray(vehicleRowsRaw) ? vehicleRowsRaw : []) as Array<{
      key: string;
      value: unknown;
    }>;
    for (const row of vehicleRows) {
      const vehicle = row.value as Record<string, unknown>;
      const updated = applyDriverAssignmentChangeOnVehicle(vehicle, {
        ...vehicle,
        currentDriverId: null,
        currentDriverName: null,
      });
      await deps.kv.set(String(row.key), updated);
    }
  } catch (e) {
    console.warn(`[unlinkCourierFromFleet] vehicle release failed for ${userId}:`, e);
  }

  const driverKv = await deps.kv.get(`driver:${userId}`);
  if (driverKv && typeof driverKv === "object") {
    const lines = normalizeServiceLines((driverKv as { serviceLines?: unknown }).serviceLines)
      .filter((l) => l !== "rush_delivery");
    const keepOrg = stillRideshareFleet || lines.includes("rideshare");
    await deps.kv.set(`driver:${userId}`, {
      ...driverKv,
      organizationId: keepOrg ? leftFleetId : null,
      serviceLines: lines.length ? lines : stillRideshareFleet ? ["rideshare"] : [],
      assignedVehicleId: null,
      assignedVehiclePlate: null,
      assignedVehicleName: null,
      vehicle: null,
    });
  }

  deps.invalidateDriverCache();
  return { success: true, wasMember: true };
}

/** Clear courier_profiles fleet link (used by fleet detach/remove). */
export async function clearCourierFleetMembership(
  supabase: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await supabase.schema("delivery").from("courier_profiles")
    .update({
      mode: "independent",
      fleet_id: null,
      fleet_joined_at: null,
      fleet_role: null,
    })
    .eq("user_id", userId)
    .eq("mode", "fleet");
  if (error) console.warn("[clearCourierFleetMembership] failed:", error.message);
}
