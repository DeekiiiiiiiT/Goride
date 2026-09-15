/**
 * Server-side JAA match link application — mirrors roam-shared applyFuelMatchLinks.
 * After link persist, auto-stamps Verified GOD station when merchant uniquely matches.
 */
import * as kv from "./kv_store.tsx";
import { stampEntryCycleMetadata } from "./fuel_cycle_stamp.ts";
import {
  attachJaaPairIfUniqueMerchant,
  type AttachJaaPairResult,
} from "./fuel_jaa_station_heal.ts";

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

  const stmtAmount = Number(stmt.amount) || 0;
  const stmtLiters = stmt.liters != null ? Number(stmt.liters) : null;
  const stmtPpl =
    stmtLiters && stmtLiters > 0
      ? Number((stmtAmount / stmtLiters).toFixed(2))
      : stmt.pricePerLiter;

  const statement: Record<string, unknown> = {
    ...stmt,
    driverId: drv.driverId || stmt.driverId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    cardId: drv.cardId || stmt.cardId,
    odometer: drv.odometer ?? stmt.odometer,
    odometerImageUrl: drv.odometerImageUrl || stmt.odometerImageUrl,
    entryMode: drv.odometer != null ? "Anchor" : stmt.entryMode,
    transactionId: drv.transactionId || stmt.transactionId,
    reconciliationStatus: "Verified",
    metadata: {
      ...stmtMeta,
      jaaMatchedDriverEntryId: drv.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
      jaaMatchScore: (pair as { score?: number }).score,
      jaaMatchNotes: (pair as { notes?: string }).notes,
    },
  };

  const driver: Record<string, unknown> = {
    ...drv,
    amount: stmt.amount,
    liters: stmt.liters ?? drv.liters,
    pricePerLiter: stmtPpl ?? drv.pricePerLiter,
    location: drv.location || stmt.location,
    cardId: stmt.cardId || drv.cardId,
    vehicleId: drv.vehicleId || stmt.vehicleId,
    reconciliationStatus: "Verified",
    metadata: {
      ...drvMeta,
      awaitingCardStatement: false,
      countsInFuelSpend: true,
      countsInFuelVolume: Number(stmt.liters) > 0,
      jaaMatchedStatementId: stmt.id,
      jaaMatchStatus: pair.status,
      jaaMatchedAt: new Date().toISOString(),
      jaaReceiptNumber: stmtMeta.jaaReceiptNumber,
      jaaResponse: stmtMeta.jaaResponse,
      jaaFuelType: stmtMeta.jaaFuelType,
      jaaMatchScore: (pair as { score?: number }).score,
      priorDriverAmount: drv.amount,
      priorDriverLiters: drv.liters,
    },
  };

  if (stmtMeta.jaaFuelType && !driver.fuelType) {
    driver.fuelType = String(stmtMeta.jaaFuelType);
  }

  return { statement, driver };
}

/** Persist linked pair + re-stamp cycle metadata; auto GOD attach when merchant unique. */
export async function persistFuelMatchPair(
  pair: FuelMatchPair,
): Promise<{
  ok: boolean;
  statementId?: string;
  driverId?: string;
  stationHeal?: AttachJaaPairResult;
}> {
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

  // Reload after cycle stamp so attach reads latest money/odo/meta
  const statementFresh =
    (await kv.get(`fuel_entry:${linked.statement.id}`)) || linked.statement;
  const driverFresh = (await kv.get(`fuel_entry:${linked.driver.id}`)) || linked.driver;

  let stationHeal: AttachJaaPairResult | undefined;
  try {
    stationHeal = await attachJaaPairIfUniqueMerchant(
      statementFresh as Record<string, unknown>,
      driverFresh as Record<string, unknown>,
    );
  } catch (e) {
    console.error("[persistFuelMatchPair] station heal failed", e);
    stationHeal = {
      attached: false,
      reason: e instanceof Error ? e.message : "Station heal error",
    };
  }

  return {
    ok: true,
    statementId: String(linked.statement.id),
    driverId: String(linked.driver.id),
    stationHeal,
  };
}
