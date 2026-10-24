/**
 * Offboarding checklist. Never a hard stop — the caller asks for a typed name
 * when anything is still open. History stays on the fleet's books.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { resolveDriverVehicleAssignment } from "./driver_vehicle_assignment.ts";

export type OffboardingBlocker = {
  code: "vehicle" | "unsettled_week" | "cash_held" | "remittance" | "check_failed";
  label: string;
  amount?: number;
};

export type OffboardingReport = {
  displayName: string;
  blockers: OffboardingBlocker[];
  clear: boolean;
};

async function displayName(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  const meta = (data?.user?.user_metadata || {}) as Record<string, unknown>;
  const name = typeof meta.name === "string" ? meta.name.trim() : "";
  return name || data?.user?.email || "this person";
}

export async function offboardingCheck(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
): Promise<OffboardingReport> {
  const blockers: OffboardingBlocker[] = [];
  const name = await displayName(supabase, userId).catch(() => "this person");
  if (!organizationId) {
    return { displayName: name, blockers, clear: true };
  }

  try {
    const vehicle = await resolveDriverVehicleAssignment(userId, { organizationId });
    if (vehicle?.vehicleId) {
      blockers.push({
        code: "vehicle",
        label: "A fleet vehicle is still assigned",
      });
    }
  } catch {
    blockers.push({ code: "check_failed", label: "Vehicle assignment could not be checked" });
  }

  try {
    const { data, error } = await supabase
      .from("driver_financial_periods")
      .select("period_end, settlement_status, settlement_amount, cash_still_held")
      .eq("driver_id", userId)
      .eq("organization_id", organizationId)
      .order("period_end", { ascending: false });
    if (error) throw error;
    let owed = 0;
    let latestHeld: number | null = null;
    for (const row of data || []) {
      const status = String(row.settlement_status || "");
      if (status === "driver_owes") {
        owed += Math.abs(Number(row.settlement_amount) || 0);
      }
      if (latestHeld === null) latestHeld = Number(row.cash_still_held) || 0;
    }
    if (owed > 0) {
      blockers.push({
        code: "unsettled_week",
        label: "Unsettled weeks are still open",
        amount: Math.round(owed * 100) / 100,
      });
    }
    if (latestHeld && latestHeld > 0) {
      blockers.push({
        code: "cash_held",
        label: "Cash is still held from trips",
        amount: Math.round(latestHeld * 100) / 100,
      });
    }
  } catch {
    blockers.push({ code: "check_failed", label: "Settlements could not be checked" });
  }

  try {
    const { data, error } = await supabase
      .schema("delivery")
      .from("courier_remittance_accounts")
      .select("balance_minor")
      .eq("courier_id", userId)
      .maybeSingle();
    if (error) throw error;
    const minor = Number(data?.balance_minor) || 0;
    if (minor > 0) {
      blockers.push({
        code: "remittance",
        label: "Courier cash is still owed",
        amount: Math.round(minor) / 100,
      });
    }
  } catch {
    /* No remittance row is normal for a driver. */
  }

  return { displayName: name, blockers, clear: blockers.length === 0 };
}
