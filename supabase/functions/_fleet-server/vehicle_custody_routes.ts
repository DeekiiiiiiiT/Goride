/**
 * Vehicle custody: fleet hand-over + driver Vehicle Handover proof eligibility.
 * Check-in POST (odometer + photo) is the handover proof that promotes handed_over to in_custody.
 */
import type { Hono } from "npm:hono@4.3.11";
import type { RbacUser } from "./rbac_middleware.ts";
import * as kv from "./kv_store.tsx";
import {
  expandDriverIdVariants,
  resolveDriverVehicleAssignment,
} from "./driver_vehicle_assignment.ts";
import {
  normalizeCustodyStatus,
  type VehicleCustodyStatus,
} from "./vehicle_custody.ts";

function rbacFromContext(c: { get: (k: string) => unknown }): RbacUser | null {
  const user = c.get("rbacUser") as RbacUser | undefined;
  return user?.userId ? user : null;
}

function vehicleLabel(v: Record<string, unknown>): string {
  const plate = String(v.licensePlate || v.plateNumber || "").trim();
  const name = `${v.make || ""} ${v.model || ""}`.trim();
  if (plate && name) return `${name} · ${plate}`;
  return plate || name || String(v.id || "Vehicle");
}

async function loadVehicle(vehicleId: string): Promise<Record<string, unknown> | null> {
  const row = await kv.get(`vehicle:${vehicleId}`);
  if (!row || typeof row !== "object") return null;
  return row as Record<string, unknown>;
}

async function saveVehicle(vehicle: Record<string, unknown>): Promise<void> {
  const id = String(vehicle.id || "").trim();
  if (!id) throw new Error("Vehicle id required");
  await kv.set(`vehicle:${id}`, vehicle);
}

export function registerVehicleCustodyRoutes(
  app: Hono,
  deps: {
    requireAuth: () => unknown;
    getOrgId: (c: { get: (k: string) => unknown }) => string | null;
    requirePermission: (perm: string) => unknown;
  },
): void {
  /** Fleet marks physical hand-over to the assigned driver. */
  app.post(
    "/make-server-37f42386/vehicles/:id/hand-over",
    deps.requireAuth() as never,
    deps.requirePermission("vehicles.edit") as never,
    async (c) => {
      try {
        const rbac = rbacFromContext(c);
        if (!rbac) return c.json({ error: "Unauthorized" }, 401);
        const orgId = deps.getOrgId(c);
        if (!orgId) return c.json({ error: "Organization required" }, 403);

        const vehicleId = c.req.param("id");
        const vehicle = await loadVehicle(vehicleId);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);
        if (vehicle.organizationId && String(vehicle.organizationId) !== orgId) {
          return c.json({ error: "Forbidden" }, 403);
        }

        const driverId = vehicle.currentDriverId != null ? String(vehicle.currentDriverId).trim() : "";
        if (!driverId) {
          return c.json({ error: "Assign a driver before marking handed over" }, 400);
        }

        const status = normalizeCustodyStatus(vehicle.custodyStatus);
        if (status === "in_custody") {
          return c.json({ vehicle, already: true });
        }

        const now = new Date().toISOString();
        const updated: Record<string, unknown> = {
          ...vehicle,
          custodyStatus: "handed_over" as VehicleCustodyStatus,
          handedOverAt: now,
          handedOverBy: rbac.userId,
        };
        delete updated.custodyConfirmedAt;
        delete updated.custodyConfirmedBy;

        await saveVehicle(updated);
        return c.json({ vehicle: updated });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /** Assigned driver confirms they physically have the vehicle. */
  app.post(
    "/make-server-37f42386/vehicles/:id/confirm-custody",
    deps.requireAuth() as never,
    async (c) => {
      try {
        const rbac = rbacFromContext(c);
        if (!rbac) return c.json({ error: "Unauthorized" }, 401);

        const vehicleId = c.req.param("id");
        const vehicle = await loadVehicle(vehicleId);
        if (!vehicle) return c.json({ error: "Vehicle not found" }, 404);

        const assignedId = vehicle.currentDriverId != null ? String(vehicle.currentDriverId).trim() : "";
        if (!assignedId) {
          return c.json({ error: "No driver assigned to this vehicle" }, 400);
        }

        const variants = await expandDriverIdVariants(rbac.userId);
        const isAssignee = variants.some((id) => id === assignedId) || assignedId === rbac.userId;
        if (!isAssignee) {
          return c.json({ error: "Only the assigned driver can confirm custody" }, 403);
        }

        const status = normalizeCustodyStatus(vehicle.custodyStatus);
        if (status === "in_custody") {
          return c.json({ vehicle, already: true });
        }
        if (status !== "handed_over") {
          return c.json({
            error: "Fleet must mark this vehicle as handed over before you can confirm",
            custodyStatus: status,
          }, 409);
        }

        const now = new Date().toISOString();
        const updated = {
          ...vehicle,
          custodyStatus: "in_custody" as VehicleCustodyStatus,
          custodyConfirmedAt: now,
          custodyConfirmedBy: rbac.userId,
        };
        await saveVehicle(updated);
        return c.json({ vehicle: updated });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );

  /** Driver/fleet: Vehicle Handover proof eligibility (needsCheckIn alias for client churn). */
  app.get(
    "/make-server-37f42386/check-ins/eligibility",
    deps.requireAuth() as never,
    async (c) => {
      try {
        const rbac = rbacFromContext(c);
        if (!rbac) return c.json({ error: "Unauthorized" }, 401);

        const driverIdParam = c.req.query("driverId") || rbac.userId;
        const orgId = deps.getOrgId(c);

        const selfVariants = await expandDriverIdVariants(rbac.userId);
        const isSelf = selfVariants.includes(driverIdParam) || driverIdParam === rbac.userId;
        if (!isSelf && !orgId) {
          return c.json({ error: "Forbidden" }, 403);
        }

        const resolved = await resolveDriverVehicleAssignment(driverIdParam, {
          organizationId: orgId,
        });
        const vehicle = resolved.vehicle;
        const vehicleId = resolved.vehicleId;

        let effectiveStatus = vehicle
          ? normalizeCustodyStatus(vehicle.custodyStatus)
          : ("none" as VehicleCustodyStatus);
        if (vehicleId && effectiveStatus === "none" && vehicle?.currentDriverId) {
          effectiveStatus = "assigned";
        }

        // One-time proof while fleet has marked handed_over — not weekly.
        const needsCheckIn = Boolean(vehicleId) && effectiveStatus === "handed_over";
        const eligible = needsCheckIn;

        let reason: string | null = null;
        if (!vehicleId) reason = "no_vehicle";
        else if (effectiveStatus === "assigned") reason = "awaiting_handover";
        else if (effectiveStatus === "handed_over") reason = "handover_proof_due";
        else if (effectiveStatus === "in_custody") reason = "handover_complete";

        return c.json({
          needsCheckIn,
          eligible,
          reason,
          custodyStatus: effectiveStatus,
          vehicleId,
          vehicleLabel: vehicle ? vehicleLabel(vehicle) : null,
          handedOverAt: vehicle?.handedOverAt ?? null,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return c.json({ error: msg }, 500);
      }
    },
  );
}

/**
 * Guard for POST /check-ins (Vehicle Handover proof).
 * Allowed from handed_over (driver completing proof) or in_custody (fleet backfill).
 */
export async function assertVehicleCustodyForCheckIn(
  vehicleId: string,
): Promise<{ ok: true; vehicle: Record<string, unknown> } | { ok: false; error: string; status: number }> {
  const vehicle = await loadVehicle(vehicleId);
  if (!vehicle) {
    return { ok: false, error: "Vehicle not found for vehicle handover", status: 404 };
  }
  const status = normalizeCustodyStatus(vehicle.custodyStatus);
  if (status === "handed_over" || status === "in_custody") {
    return { ok: true, vehicle };
  }
  const msg =
    status === "assigned"
      ? "Fleet must mark the vehicle as handed over before Vehicle Handover proof"
      : "Vehicle must be handed over before Vehicle Handover proof";
  return { ok: false, error: msg, status: 400 };
}

/** Promote handed_over → in_custody after successful odometer+photo handover proof. */
export async function completeCustodyFromHandoverProof(
  vehicleId: string,
  confirmedByUserId: string,
): Promise<Record<string, unknown> | null> {
  const vehicle = await loadVehicle(vehicleId);
  if (!vehicle) return null;
  const status = normalizeCustodyStatus(vehicle.custodyStatus);
  if (status === "in_custody") return vehicle;
  if (status !== "handed_over") return vehicle;

  const now = new Date().toISOString();
  const updated: Record<string, unknown> = {
    ...vehicle,
    custodyStatus: "in_custody" as VehicleCustodyStatus,
    custodyConfirmedAt: now,
    custodyConfirmedBy: confirmedByUserId,
  };
  await saveVehicle(updated);
  return updated;
}
