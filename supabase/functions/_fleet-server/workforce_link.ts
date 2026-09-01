/**
 * Single write contract for linking a driver account to a fleet org.
 * Writes auth metadata, fleet KV roster, and driver_profiles (SSOT for membership).
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
