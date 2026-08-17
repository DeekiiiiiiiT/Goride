/**
 * Server-side JAA match link application — mirrors roam-shared applyFuelMatchLinks.
 */
import * as kv from "./kv_store.tsx";
import { stampEntryCycleMetadata } from "./fuel_cycle_stamp.ts";

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

export type FuelMatchPair = {
  status: string;
  statementEntry?: Record<string, unknown>;
  driverEntry?: Record<string, unknown>;
};

export function applyFuelMatchLinks(
  pair: FuelMatchPair,
): { statement?: Record<string, unknown>; driver?: Record<string, unknown> } {
  if (!pair.statementEntry || !pair.driverEntry) return {};
  if (pair.status !== "matched" && pair.status !== "amount_mismatch") return {};

  const stmt = pair.statementEntry;
  const drv = pair.driverEntry;
  const stmtMeta = metaOf(stmt);
  const drvMeta = metaOf(drv);

  const statement = {
    ...stmt,
    driverId: drv.driverId || stmt.driverId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    cardId: drv.cardId || stmt.cardId,
    odometer: drv.odometer ?? stmt.odometer,
    metadata: {
      ...stmtMeta,
      jaaMatchedDriverEntryId: drv.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
    },
  };

  const driver = {
    ...drv,
    metadata: {
      ...drvMeta,
      jaaMatchedStatementId: stmt.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
      awaitingCardStatement: false,
    },
  };

  return { statement, driver };
}

/** Persist linked pair + re-stamp cycle metadata on both sides. */
export async function persistFuelMatchPair(
  pair: FuelMatchPair,
): Promise<{ ok: boolean; statementId?: string; driverId?: string }> {
  const linked = applyFuelMatchLinks(pair);
  if (!linked.statement || !linked.driver) return { ok: false };

  const vehicleId = String(linked.driver.vehicleId || linked.statement.vehicleId || "");
  const vehicle = vehicleId ? await kv.get(`vehicle:${vehicleId}`) : null;

  if (vehicle) {
    await stampEntryCycleMetadata(linked.statement, vehicle as Record<string, unknown>);
    await stampEntryCycleMetadata(linked.driver, vehicle as Record<string, unknown>);
  }

  await kv.set(`fuel_entry:${linked.statement.id}`, linked.statement);
  await kv.set(`fuel_entry:${linked.driver.id}`, linked.driver);

  return {
    ok: true,
    statementId: String(linked.statement.id),
    driverId: String(linked.driver.id),
  };
}
