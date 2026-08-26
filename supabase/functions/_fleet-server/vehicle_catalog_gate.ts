/**
 * Server-side "parked until matched" guard.
 *
 * Enforces the rule: a fleet vehicle without a `vehicle_catalog_id` (or whose
 * `catalogStatus !== 'matched'`) cannot be operated against. Operational
 * routes (trips, fuel, toll, maintenance, equipment, driver assignment,
 * status changes to Active/Maintenance) must be wrapped with
 * `requireCatalogMatched(...)`.
 *
 * Policy decisions live in `src/utils/vehicleCatalogGate.ts` so the client
 * mirrors them; this module only adds Hono plumbing, KV lookups, audit
 * logging, RBAC bypass and the feature-flag rollout switch.
 */

import type { Context, Next } from "npm:hono";
import * as kv from "./kv_store.tsx";
import {
  hasPermission,
  type Permission,
  type RbacUser,
} from "./rbac_middleware.ts";
import {
  isStatusTransitionAllowedForCatalog,
  isVehicleCatalogMatched,
  VEHICLE_PENDING_CATALOG_ERROR_CODE,
  type CatalogGateVehicleShape,
} from "../../../apps/fleet/src/utils/vehicleCatalogGate.ts";

/** Permission that lets platform operators temporarily bypass the gate (rare). */
export const CATALOG_GATE_BYPASS_PERMISSION: Permission =
  "vehicles.bypass_catalog_gate" as Permission;

/**
 * When `false`, the gate logs warnings but does NOT block the request. Lets
 * us ship the enforcement code in warn-only mode and flip to enforce after a
 * burn-in period without redeploying. Reads `ENFORCE_VEHICLE_CATALOG_GATE`
 * (default: enforce).
 */
export function isEnforcementEnabled(): boolean {
  const raw = (Deno.env.get("ENFORCE_VEHICLE_CATALOG_GATE") ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off" && raw !== "warn";
}

/** Load the KV vehicle for gate decisions. Returns `null` if not found. */
export async function loadVehicleForGate(vehicleId: string): Promise<Record<string, unknown> | null> {
  if (!vehicleId) return null;
  const raw = await kv.get(`vehicle:${vehicleId}`);
  if (!raw || typeof raw !== "object") return null;
  return raw as Record<string, unknown>;
}

/** Re-export the predicate so handlers don't have to import the utils path themselves. */
export { isVehicleCatalogMatched };

/** Strongly-typed bypass check for use inside route handlers. */
export function rbacUserCanBypassCatalogGate(user: RbacUser | undefined): boolean {
  if (!user) return false;
  return hasPermission(user.resolvedRole, CATALOG_GATE_BYPASS_PERMISSION);
}

type GateContext = {
  route: string;
  vehicleId: string;
  userId: string;
  organizationId: string | null;
  reason: "missing_vehicle" | "not_matched" | "bypassed" | "warn_only" | "extractor_miss";
};

/**
 * Persist a blocked/warn-only attempt to KV (best-effort) and emit a console
 * line. Audit writes never throw.
 */
async function recordGateEvent(ctx: GateContext): Promise<void> {
  console.warn(
    `[catalog-gate] ${ctx.reason} route=${ctx.route} vehicleId=${ctx.vehicleId} user=${ctx.userId} org=${ctx.organizationId ?? "-"}`,
  );
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const suffix = Math.random().toString(36).slice(2, 8);
    await kv.set(`audit:catalog-gate:${ts}:${suffix}`, {
      ...ctx,
      timestamp: new Date().toISOString(),
    });
  } catch (_e) {
    /* never break the request because of audit failure */
  }
}

/** Recent gate audit rows for Dominion observability (newest first). */
export async function listRecentCatalogGateEvents(limit = 50): Promise<Record<string, unknown>[]> {
  const rows = (await kv.getByPrefix("audit:catalog-gate:")) || [];
  const sorted = [...rows].sort((a, b) => {
    const ta = String((a as { timestamp?: string }).timestamp || "");
    const tb = String((b as { timestamp?: string }).timestamp || "");
    return tb.localeCompare(ta);
  });
  return sorted.slice(0, Math.min(Math.max(limit, 1), 200)) as Record<string, unknown>[];
}

/**
 * Resolves the vehicle id from the request. Callers pass a small extractor so
 * each route can declare where the id lives (path / body / query / nested).
 *
 * Returning `null` means the request is not about a single vehicle and the
 * gate should pass through. Returning `[]` means an empty batch — also pass.
 */
export type VehicleIdExtractor = (
  c: Context,
  body: unknown,
) => string | string[] | null | Promise<string | string[] | null>;

export interface CatalogGateOptions {
  /** Where to find the vehicle id in the request. */
  vehicleId: VehicleIdExtractor;
  /** Optional human-readable label for logs / errors (defaults to `c.req.path`). */
  label?: string;
  /** If true, status field on body must be a parked-allowed value. */
  enforceStatusTransition?: boolean;
}

/**
 * Hono middleware that blocks operational writes when the targeted vehicle
 * is parked. Use as: `app.post(path, requireAuth(), requirePermission(...), requireCatalogMatched({ vehicleId: (c, body) => body.vehicleId }), handler)`.
 */
export function requireCatalogMatched(options: CatalogGateOptions) {
  return async (c: Context, next: Next) => {
    const user = c.get("rbacUser") as RbacUser | undefined;
    const route = options.label ?? c.req.path;

    // Read body once and cache on context so the handler doesn't re-parse.
    let body: unknown = c.get("__cachedRequestBody");
    if (body === undefined) {
      try {
        body = await c.req.json();
      } catch {
        body = null;
      }
      c.set("__cachedRequestBody", body);
    }

    let extracted: string | string[] | null;
    try {
      extracted = await options.vehicleId(c, body);
    } catch (e: unknown) {
      console.error("[catalog-gate] extractor failed", route, e);
      return c.json({ error: "Invalid request" }, 400);
    }

    if (extracted == null) {
      await recordGateEvent({
        route,
        vehicleId: "_none",
        userId: user?.userId ?? "_anon",
        organizationId: user?.organizationId ?? null,
        reason: "extractor_miss",
      });
      return await next();
    }

    const ids = (Array.isArray(extracted) ? extracted : [extracted])
      .map((s) => String(s ?? "").trim())
      .filter(Boolean);
    if (ids.length === 0) {
      await recordGateEvent({
        route,
        vehicleId: "_empty",
        userId: user?.userId ?? "_anon",
        organizationId: user?.organizationId ?? null,
        reason: "extractor_miss",
      });
      return await next();
    }

    const bypass = rbacUserCanBypassCatalogGate(user);
    const enforcement = isEnforcementEnabled();

    for (const vehicleId of ids) {
      const vehicle = await loadVehicleForGate(vehicleId);
      if (!vehicle) {
        await recordGateEvent({
          route,
          vehicleId,
          userId: user?.userId ?? "_anon",
          organizationId: user?.organizationId ?? null,
          reason: "missing_vehicle",
        });
        if (!enforcement || bypass) continue;
        return c.json(
          {
            error: "Vehicle not found",
            code: VEHICLE_PENDING_CATALOG_ERROR_CODE,
            vehicleId,
          },
          404,
        );
      }

      const shape = vehicle as CatalogGateVehicleShape;

      if (!isVehicleCatalogMatched(shape)) {
        await recordGateEvent({
          route,
          vehicleId,
          userId: user?.userId ?? "_anon",
          organizationId: user?.organizationId ?? null,
          reason: bypass ? "bypassed" : enforcement ? "not_matched" : "warn_only",
        });
        if (bypass || !enforcement) continue;
        return c.json(
          {
            error: "Vehicle is pending catalog match. A platform admin must approve the motor type before this action is allowed.",
            code: VEHICLE_PENDING_CATALOG_ERROR_CODE,
            vehicleId,
            catalogStatus: shape.catalogStatus ?? "pending_catalog",
          },
          403,
        );
      }

      if (options.enforceStatusTransition) {
        const incoming = (body && typeof body === "object" ? (body as Record<string, unknown>).status : undefined) as
          | string
          | undefined;
        if (incoming && !isStatusTransitionAllowedForCatalog(shape, incoming as never)) {
          if (!bypass && enforcement) {
            return c.json(
              {
                error: `Cannot set status to "${incoming}" while vehicle is pending catalog match.`,
                code: VEHICLE_PENDING_CATALOG_ERROR_CODE,
                vehicleId,
              },
              422,
            );
          }
        }
      }
    }

    await next();
  };
}

/**
 * Fields on the KV vehicle that are considered "operational" — touching any
 * of them while the vehicle is parked is rejected. Documents, hints, and the
 * catalog match itself are intentionally NOT in this list.
 */
const OPERATIONAL_VEHICLE_FIELDS: readonly string[] = [
  "currentDriverId",
  "currentDriverName",
  "tollTagId",
  "tollTagUuid",
  "tollTagProvider",
  "fuelScenarioId",
  "fuelSettings",
];

/**
 * Pure helper for `POST /vehicles` — given the previous KV vehicle (or null
 * for create), the new payload, and the resolution outcome, returns the safe
 * vehicle to persist plus a structured error if the caller tried to perform
 * an operational write while the vehicle is parked.
 */
export function applyCatalogGateOnCreate(
  payload: Record<string, unknown>,
  catalogId: string | null,
  previous?: Record<string, unknown> | null,
): { vehicle: Record<string, unknown>; rejected?: { code: typeof VEHICLE_PENDING_CATALOG_ERROR_CODE; message: string } } {
  const next = { ...payload };
  if (catalogId) {
    next.catalogStatus = "matched";
    next.vehicle_catalog_id = catalogId;
    return { vehicle: next };
  }

  next.catalogStatus = "pending_catalog";

  // Strip any incoming status that isn't allowed for parked vehicles.
  const incoming = typeof next.status === "string" ? (next.status as string) : undefined;
  if (incoming && incoming !== "Inactive" && incoming !== "Decommissioned") {
    return {
      vehicle: { ...next, status: "Inactive" },
      rejected: {
        code: VEHICLE_PENDING_CATALOG_ERROR_CODE,
        message: `Cannot set status to "${incoming}" while vehicle is pending catalog match.`,
      },
    };
  }

  // Block operational field writes on parked vehicles (driver/toll/fuel
  // assignment). For brand-new vehicles previous is null and any value is a
  // change; for updates we only reject when the field actually changed.
  for (const field of OPERATIONAL_VEHICLE_FIELDS) {
    const before = previous ? previous[field] : undefined;
    const after = next[field];
    if (after === undefined || after === before) continue;
    if (after === null || after === "") continue;
    return {
      vehicle: { ...next, status: "Inactive", [field]: before ?? null },
      rejected: {
        code: VEHICLE_PENDING_CATALOG_ERROR_CODE,
        message: `Cannot update "${field}" while vehicle is pending catalog match.`,
      },
    };
  }

  // No status change requested — force Inactive on first save when unmatched.
  next.status = "Inactive";
  return { vehicle: next };
}

/** Check the request body for a list of metric rows that target a vehicle. */
export function extractVehicleIdsFromMetricsBody(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const arr = (body as { metrics?: unknown }).metrics;
  if (!Array.isArray(arr)) return [];
  const ids = new Set<string>();
  for (const m of arr) {
    if (m && typeof m === "object") {
      const id = (m as { vehicleId?: unknown }).vehicleId;
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
  }
  return Array.from(ids);
}
