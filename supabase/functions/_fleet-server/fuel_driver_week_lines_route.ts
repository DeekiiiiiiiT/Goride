/**
 * Driver Settlements → a driver's fuel lines for one week (fuel audit Part J screens 13, 14).
 * Read only: the week's fuel periods, this driver's lines (current and reversed), and the
 * driver's latest fuel statement (the amount the lines must add up to).
 */
import * as kv from "./kv_store.tsx";
import { getServiceClient } from "./service_client.ts";
import { getLatestWeekStatement } from "./week_statements.ts";
import { loadActorNames } from "./fuel_week_checks_route.ts";
import {
  buildDriverWeekFuel,
  type DriverWeekFuel,
  type DriverWeekLineRow,
} from "../../../packages/fuel-core/src/driverWeekFuelLines.ts";

export type DriverWeekFuelBody = DriverWeekFuel & {
  driverId: string;
  weekStart: string;
  plates: Record<string, string>;
  actorNames: Record<string, string>;
};

async function platesFor(vehicleIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    [...new Set(vehicleIds.filter(Boolean))].map(async (id) => {
      try {
        const v = (await kv.get(`vehicle:${id}`)) as Record<string, unknown> | null;
        const plate = String(v?.licensePlate || v?.plate || "").trim();
        if (plate) out[id] = plate;
      } catch {
        /* the screen shows the car id */
      }
    }),
  );
  return out;
}

export async function loadDriverWeekFuel(
  orgId: string,
  driverId: string,
  weekStart: string,
): Promise<DriverWeekFuelBody> {
  const sb = getServiceClient();
  const { data: periods, error } = await sb
    .from("fuel_reconciliation_period")
    .select("id, status, locked_at")
    .eq("org_id", orgId)
    .eq("week_start", weekStart);
  if (error) throw new Error(`fuel periods read failed: ${error.message}`);

  const lines: DriverWeekLineRow[] = [];
  let weekLocked = false;
  for (const p of periods || []) {
    if (String(p.status || "") === "locked" || p.locked_at) weekLocked = true;
    const { data, error: listErr } = await sb.rpc("fuel_week_lines_list", {
      p_org: orgId,
      p_period_id: String(p.id),
      p_driver_id: driverId,
    });
    if (listErr) throw new Error(`fuel lines read failed: ${listErr.message}`);
    if (Array.isArray(data)) lines.push(...(data as DriverWeekLineRow[]));
  }

  let statementDriverMinor: number | null = null;
  if (weekLocked) {
    const st = await getLatestWeekStatement(orgId, driverId, weekStart, "fuel");
    const minor = Number((st?.amountsMinor as { driverShare?: unknown } | undefined)?.driverShare);
    if (st && Number.isFinite(minor)) statementDriverMinor = minor;
  }

  const fuel = buildDriverWeekFuel({ lines, weekLocked, statementDriverMinor });
  const [plates, actorNames] = await Promise.all([
    platesFor(fuel.lines.map((l) => l.vehicleId)),
    loadActorNames(fuel.reopened?.by ? [fuel.reopened.by] : []),
  ]);
  return { ...fuel, driverId, weekStart, plates, actorNames };
}
