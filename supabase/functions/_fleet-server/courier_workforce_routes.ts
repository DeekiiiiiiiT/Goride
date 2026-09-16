/**
 * Courier self-serve workforce membership: me + leave fleet.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { RbacUser } from "./rbac_middleware.ts";
import type { UnlinkCourierResult } from "./workforce_link.ts";
import { resolveDriverVehicleAssignment } from "./driver_vehicle_assignment.ts";

function rbacFromContext(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function vehicleDto(vehicle: Record<string, unknown> | null, vehicleId: string | null) {
  if (!vehicle || !vehicleId) return null;
  const make = typeof vehicle.make === "string" ? vehicle.make : "";
  const model = typeof vehicle.model === "string" ? vehicle.model : "";
  const yearRaw = vehicle.year;
  const year =
    typeof yearRaw === "number"
      ? yearRaw
      : typeof yearRaw === "string" && yearRaw.trim()
      ? Number(yearRaw) || null
      : null;
  const color = typeof vehicle.color === "string" ? vehicle.color : null;
  const licensePlate =
    (typeof vehicle.licensePlate === "string" && vehicle.licensePlate) ||
    (typeof vehicle.plate === "string" && vehicle.plate) ||
    "";
  const vehicleType =
    (typeof vehicle.vehicleType === "string" && vehicle.vehicleType) ||
    (typeof vehicle.type === "string" && vehicle.type) ||
    null;
  return {
    id: vehicleId,
    make,
    model,
    year,
    color,
    licensePlate,
    vehicleType,
  };
}

export function registerCourierWorkforceRoutes(
  app: Hono,
  deps: {
    supabase: SupabaseClient;
    requireAuth: () => unknown;
    unlinkCourierFromFleet: (userId: string) => Promise<UnlinkCourierResult>;
  },
): void {
  app.get("/make-server-37f42386/courier/workforce/me", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);
      const userId = rbacUser.userId;

      const { data: profile, error } = await deps.supabase
        .schema("delivery")
        .from("courier_profiles")
        .select("mode, fleet_id, fleet_role, fleet_joined_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw error;

      const mode = profile?.mode === "fleet" ? "fleet" : "independent";
      const fleetId =
        mode === "fleet" && profile?.fleet_id ? String(profile.fleet_id) : null;

      let fleetName: string | null = null;
      if (fleetId) {
        const { data: org } = await deps.supabase
          .from("organizations")
          .select("name")
          .eq("id", fleetId)
          .maybeSingle();
        fleetName = (org?.name as string | null) ?? null;
      }

      let assignedVehicle = null;
      if (mode === "fleet") {
        const resolved = await resolveDriverVehicleAssignment(userId, {
          organizationId: fleetId,
        });
        assignedVehicle = vehicleDto(resolved.vehicle, resolved.vehicleId);
      }

      return c.json({
        mode,
        fleetId,
        fleetName,
        fleetRole: mode === "fleet" ? (profile?.fleet_role ?? "courier") : null,
        joinedAt: mode === "fleet" ? (profile?.fleet_joined_at ?? null) : null,
        assignedVehicle,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });

  app.post("/make-server-37f42386/courier/workforce/leave", deps.requireAuth() as never, async (c) => {
    try {
      const rbacUser = rbacFromContext(c);
      if (!rbacUser) return c.json({ error: "Unauthorized" }, 401);

      const result = await deps.unlinkCourierFromFleet(rbacUser.userId);
      if (!result.success) return c.json({ error: result.error }, result.status);
      return c.json({ success: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return c.json({ error: msg }, 500);
    }
  });
}
