/**
 * Adapter lookup maps for toll v2 fleet import (P2-R5).
 * Same data sources as GET /toll-tags and GET /toll-plazas, scoped to org from the caller.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  normalizeIndriveDriverLookupKey,
  normalizeTagForLookup,
  normalizePlate,
} from "../../../packages/toll-core/src/v2/adapters/common.ts";
import type { IndriveCtx, TagStatementCtx, UberCtx } from "../../../packages/toll-core/src/v2/adapters/types.ts";
import { getCanonicalDriverName, type DriverIdentityLike } from "./driver_identity.ts";
import { queryFleet } from "./repos/baseRepo.ts";
import * as kv from "./kv_store.tsx";

export type PlazaLookup = Record<string, string>;

/** Normalized plates for a fleet vehicle row (primary + aliases). */
export function vehiclePlatesForLookup(v: Record<string, unknown>): string[] {
  const out: string[] = [];
  const primary = normalizePlate(
    String(v.plateNumber ?? v.licensePlate ?? v.plate_number ?? v.license_plate ?? ""),
  );
  if (primary) out.push(primary);
  const aliases = v.plate_aliases ?? v.plateAliases;
  if (Array.isArray(aliases)) {
    for (const a of aliases) {
      const p = normalizePlate(String(a ?? ""));
      if (p && !out.includes(p)) out.push(p);
    }
  }
  return out;
}

export async function buildTagStatementCtx(orgId: string): Promise<TagStatementCtx> {
  const tagRes = await queryFleet("toll_tags", {
    org: orgId,
    limit: 5000,
  });
  if (tagRes.error) throw tagRes.error;

  const vehRes = await queryFleet("vehicles", {
    org: orgId,
    limit: 5000,
  });
  if (vehRes.error) throw vehRes.error;

  const tagToVehicle: Record<string, string> = {};
  for (const row of tagRes.data) {
    const tag = row as Record<string, unknown>;
    const tagNumber = String(tag.tagNumber ?? tag.tag_number ?? "").trim();
    const vehicleId = String(tag.assignedVehicleId ?? tag.assigned_vehicle_id ?? "").trim();
    if (!tagNumber || !vehicleId) continue;
    const key = normalizeTagForLookup(tagNumber);
    tagToVehicle[key] = vehicleId;
    tagToVehicle[tagNumber] = vehicleId;
  }

  const vehicleToDriver: Record<string, string> = {};
  for (const row of vehRes.data) {
    const v = row as Record<string, unknown>;
    const vehicleId = String(v.id ?? "").trim();
    const driverId = String(v.currentDriverId ?? v.current_driver_id ?? "").trim();
    if (vehicleId && driverId) vehicleToDriver[vehicleId] = driverId;
  }

  const plazaIdByName = await buildPlazaIdByName(orgId);
  return { tagToVehicle, vehicleToDriver, plazaIdByName };
}

export async function buildPlazaIdByName(orgId: string): Promise<PlazaLookup> {
  const res = await queryFleet("toll_plazas", {
    filters: [
      { op: "or", value: `organization_id.eq.${orgId},organization_id.is.null` },
    ],
    limit: 2000,
  });
  if (res.error) throw res.error;
  const map: PlazaLookup = {};
  for (const row of res.data) {
    const plaza = row as Record<string, unknown>;
    const id = String(plaza.id ?? "").trim();
    const name = String(plaza.name ?? plaza.plazaName ?? "").trim();
    if (id && name) map[name] = id;
  }
  return map;
}

export async function buildTopupCtx(orgId: string): Promise<{ tagToVehicle?: Record<string, string> }> {
  const ctx = await buildTagStatementCtx(orgId);
  return { tagToVehicle: ctx.tagToVehicle };
}

async function loadOrgDrivers(orgId: string): Promise<DriverIdentityLike[]> {
  const res = await queryFleet("drivers", { org: orgId, limit: 5000 });
  if (!res.error && res.data.length > 0) {
    return res.data as DriverIdentityLike[];
  }
  const prefix = await kv.getByPrefix("driver:");
  return (prefix ?? []).filter((d: Record<string, unknown>) =>
    !d.organizationId || String(d.organizationId) === orgId
  ) as DriverIdentityLike[];
}

export async function buildUberCtx(orgId: string): Promise<UberCtx> {
  const drivers = await loadOrgDrivers(orgId);
  const driverByUberUuid: Record<string, string> = {};
  for (const d of drivers) {
    const canonical = String(d.id ?? d.driverId ?? "").trim();
    const uberId = String(d.uberDriverId ?? "").trim();
    if (canonical && uberId) driverByUberUuid[uberId] = canonical;
  }

  const vehRes = await queryFleet("vehicles", { org: orgId, limit: 5000 });
  if (vehRes.error) throw vehRes.error;
  const vehicleByPlate: Record<string, string> = {};
  for (const row of vehRes.data) {
    const v = row as Record<string, unknown>;
    const id = String(v.id ?? "").trim();
    for (const plate of vehiclePlatesForLookup(v)) {
      if (id && plate) vehicleByPlate[plate] = id;
    }
  }
  return { driverByUberUuid, vehicleByPlate };
}

export function buildIndriveDriverMapFromRecords(
  drivers: DriverIdentityLike[],
): Record<string, string> {
  const driverByExternalId: Record<string, string> = {};
  for (const d of drivers) {
    const canonical = String(d.id ?? d.driverId ?? "").trim();
    if (!canonical) continue;
    const indriveId = String(d.inDriveDriverId ?? "").trim();
    if (indriveId) driverByExternalId[indriveId] = canonical;
    const nameKey = normalizeIndriveDriverLookupKey(getCanonicalDriverName(d));
    if (nameKey) driverByExternalId[nameKey] = canonical;
  }
  return driverByExternalId;
}

export async function buildIndriveCtx(orgId: string): Promise<IndriveCtx> {
  const drivers = await loadOrgDrivers(orgId);
  const driverByExternalId = buildIndriveDriverMapFromRecords(drivers);

  const vehRes = await queryFleet("vehicles", { org: orgId, limit: 5000 });
  if (vehRes.error) throw vehRes.error;
  const vehicleByPlate: Record<string, string> = {};
  for (const row of vehRes.data) {
    const v = row as Record<string, unknown>;
    const id = String(v.id ?? "").trim();
    for (const plate of vehiclePlatesForLookup(v)) {
      if (id && plate) vehicleByPlate[plate] = id;
    }
  }

  return { driverByExternalId, vehicleByPlate };
}

export function resolvePlazaId(plazaName: string, map: PlazaLookup): string {
  const trimmed = (plazaName || "").trim();
  if (!trimmed) return "unknown";
  return map[trimmed] ?? "unknown";
}

/** Load driver canonical id for the signed-in user (fleet driver record). */
export async function resolveDriverIdForUser(
  orgId: string,
  userId: string,
): Promise<string | null> {
  const drivers = await loadOrgDrivers(orgId);
  const match = drivers.find((d) => {
    const ids = [d.id, d.driverId, (d as Record<string, unknown>).userId]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    return ids.includes(userId);
  });
  if (match?.id) return String(match.id);
  if (match?.driverId) return String(match.driverId);
  const kvDriver = await kv.get(`driver:${userId}`) as Record<string, unknown> | null;
  if (kvDriver?.id) return String(kvDriver.id);
  if (kvDriver?.driverId) return String(kvDriver.driverId);
  return null;
}

export async function checkTollSysTollsV2On(orgId: string): Promise<
  { ok: true; enabled: boolean } | { ok: false; error: unknown }
> {
  const { getServiceClient } = await import("./service_client.ts");
  const svc = getServiceClient();
  const { data, error } = await svc.rpc("toll_sys_tolls_v2_on", { p_company: orgId });
  if (error) return { ok: false, error };
  return { ok: true, enabled: Boolean(data) };
}

export async function createServiceRpcFromModule(): Promise<
  (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
> {
  const { getServiceClient } = await import("./service_client.ts");
  const svc = getServiceClient();
  return async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await svc.rpc(fn, args);
    return { data, error: error ? { message: error.message } : null };
  };
}

export async function checkTollV2Enabled(userClient: SupabaseClient): Promise<
  { ok: true; enabled: boolean } | { ok: false; error: unknown }
> {
  const { data: enabled, error } = await userClient.rpc("toll_v2_enabled");
  if (error) return { ok: false, error };
  return { ok: true, enabled: Boolean(enabled) };
}
