/**
 * Build canonical ledger_event payloads for runtime writes (trips, fuel, toll).
 * Import/CSV flows use buildCanonicalImportEvents + append separately.
 */
import type { Context } from "npm:hono";
import { appendCanonicalLedgerEvents } from "./ledger_canonical.ts";

function isCompletedTripStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  if (!s) return false;
  if (s.includes("cancel") || s.includes("fail")) return false;
  return s.includes("complet") || s === "complete";
}

function isUberPlatform(platform: unknown): boolean {
  const p = String(platform ?? "").trim().toLowerCase();
  return p === "uber" || p.startsWith("uber ");
}

function coerceAmount(amount: unknown): number {
  const n = Number(amount);
  return Number.isFinite(n) ? n : 0;
}

/** Same money eligibility as tripHasMoneyForLedgerProjection in index.tsx */
export function tripHasMoneyForLedgerProjection(trip: Record<string, unknown>): boolean {
  if (!isCompletedTripStatus(trip?.status)) return false;
  const amt = coerceAmount(trip?.amount);
  const hasTripAmount = amt > 0;
  if (!isUberPlatform(trip?.platform)) return hasTripAmount;
  const uberGrossForLedger =
    coerceAmount(trip?.uberFareComponents) +
    coerceAmount(trip?.uberTips) +
    coerceAmount(trip?.uberPriorPeriodAdjustment);
  return hasTripAmount || uberGrossForLedger > 0;
}

/**
 * Per-trip fare for non-Uber platforms (Roam, InDrive, etc.).
 * Uber money is expected from CSV canonical / statement lines — skip to avoid double-counting.
 */
export function buildCanonicalTripFareEventsFromTrip(trip: Record<string, unknown>): Record<string, unknown>[] {
  if (!tripHasMoneyForLedgerProjection(trip)) return [];
  if (isUberPlatform(trip?.platform)) return [];

  const id = String(trip.id ?? "").trim();
  const driverId = String(trip.driverId ?? "").trim();
  if (!id || !driverId) return [];

  const rawDate = typeof trip.date === "string" ? trip.date.trim() : "";
  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];

  const net = coerceAmount(trip.amount);
  if (net <= 0) return [];

  const platform = String(trip.platform || "Roam").trim();

  return [
    {
      idempotencyKey: `trip:${id}|fare_earning`,
      date,
      driverId,
      eventType: "fare_earning",
      direction: "inflow",
      netAmount: net,
      grossAmount: net,
      currency: "JMD",
      sourceType: "trip",
      sourceId: id,
      batchId: typeof trip.batchId === "string" && trip.batchId.trim() ? trip.batchId.trim() : undefined,
      platform,
      vehicleId: typeof trip.vehicleId === "string" && trip.vehicleId.trim() ? trip.vehicleId.trim() : undefined,
      description: `Trip fare (${platform})`,
      metadata: { tripId: id },
    },
  ];
}

/** Fuel entry KV shape — amount & driverId required */
export function buildCanonicalFuelExpenseEvent(entry: Record<string, unknown>): Record<string, unknown> | null {
  const id = String(entry.id ?? "").trim();
  const driverId = String(entry.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const rawDate = typeof entry.date === "string" ? entry.date.trim() : "";
  const date = rawDate.includes("T") ? rawDate.slice(0, 10) : rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const amt = Math.abs(coerceAmount(entry.amount));
  if (amt <= 1e-9) return null;

  return {
    idempotencyKey: `fuel_entry:${id}|fuel_expense`,
    date,
    driverId,
    eventType: "fuel_expense",
    direction: "outflow",
    netAmount: amt,
    grossAmount: amt,
    currency: "JMD",
    sourceType: "transaction",
    sourceId: id,
    vehicleId: typeof entry.vehicleId === "string" && entry.vehicleId.trim() ? entry.vehicleId.trim() : undefined,
    platform: "Roam",
    description: typeof entry.vendor === "string" && entry.vendor.trim()
      ? `Fuel — ${entry.vendor.trim()}`
      : "Fuel expense",
    metadata: { fuelEntryId: id },
  };
}

export interface TollLedgerLike {
  id: string;
  date: string;
  driverId: string | null;
  amount: number;
  type: string;
  description?: string | null;
  vehicleId?: string | null;
}

export function buildCanonicalTollEventFromTollLedger(entry: TollLedgerLike): Record<string, unknown> | null {
  const id = String(entry.id ?? "").trim();
  const driverId = String(entry.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const date = String(entry.date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const t = String(entry.type ?? "").toLowerCase();
  const absAmt = Math.abs(Number(entry.amount) || 0);
  if (absAmt <= 1e-9) return null;

  if (t === "usage") {
    return {
      idempotencyKey: `toll_ledger:${id}|toll_charge`,
      date,
      driverId,
      eventType: "toll_charge",
      direction: "outflow",
      netAmount: absAmt,
      grossAmount: absAmt,
      currency: "JMD",
      sourceType: "transaction",
      sourceId: id,
      vehicleId: typeof entry.vehicleId === "string" && entry.vehicleId ? entry.vehicleId : undefined,
      platform: "Roam",
      description: entry.description?.trim() || "Toll charge",
      metadata: { tollLedgerId: id },
    };
  }

  if (t === "refund" || t === "top_up") {
    return {
      idempotencyKey: `toll_ledger:${id}|toll_${t}`,
      date,
      driverId,
      eventType: "toll_refund",
      direction: "inflow",
      netAmount: absAmt,
      grossAmount: absAmt,
      currency: "JMD",
      sourceType: "transaction",
      sourceId: id,
      vehicleId: typeof entry.vehicleId === "string" && entry.vehicleId ? entry.vehicleId : undefined,
      platform: "Roam",
      description: entry.description?.trim() || (t === "top_up" ? "Toll top-up" : "Toll refund"),
      metadata: { tollLedgerId: id, tollType: t },
    };
  }

  return null;
}

export async function appendCanonicalFuelExpenseIfEligible(
  entry: Record<string, unknown>,
  c: Context,
): Promise<void> {
  const ev = buildCanonicalFuelExpenseEvent(entry);
  if (!ev) return;
  try {
    await appendCanonicalLedgerEvents([ev], c);
  } catch (e) {
    console.error("[CanonicalOps] fuel append failed:", e);
  }
}

export async function appendCanonicalTollIfEligible(
  tollRecord: TollLedgerLike,
  c: Context,
): Promise<void> {
  const ev = buildCanonicalTollEventFromTollLedger(tollRecord);
  if (!ev) return;
  try {
    await appendCanonicalLedgerEvents([ev], c);
  } catch (e) {
    console.error("[CanonicalOps] toll append failed:", e);
  }
}

export async function appendCanonicalTripFaresIfEligible(
  trips: Record<string, unknown>[],
  c: Context,
): Promise<void> {
  const batch: Record<string, unknown>[] = [];
  for (const trip of trips) {
    batch.push(...buildCanonicalTripFareEventsFromTrip(trip));
  }
  if (batch.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    try {
      await appendCanonicalLedgerEvents(chunk, c);
    } catch (e) {
      console.error("[CanonicalOps] trip fare append failed:", e);
    }
  }
}
