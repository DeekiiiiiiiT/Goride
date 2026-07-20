/**
 * Fuel P&L Offset — reversible, versioned compensating entry for the
 * driver-charged share of fuel fills after Consumption Reconciliation Finalize,
 * so Business Finance Fuel stops counting Personal / driver-share as fleet loss.
 *
 * Canonical ledger is append-only. This mirrors toll_pnl_offset.ts:
 * inflow offset → wash; outflow reinstate → undo. Marker tracks active version.
 *
 * Gated historically by a settings flag; offsets are now always on.
 */

import * as kv from "./kv_store.tsx";
import { appendCanonicalLedgerEvents, canonicalEventExistsByIdemKey } from "./ledger_canonical.ts";

const MARKER_PREFIX = "fuel_pnl_offset_marker:";

export type FuelPnlOffsetReason = "driver_share";

interface FuelPnlOffsetMarker {
  active: boolean;
  version: number;
  reason: FuelPnlOffsetReason;
  offsetIdempotencyKey?: string;
  reinstateIdempotencyKey?: string;
  /** Last offset amount (for reinstate when caller omits amount). */
  amount?: number;
  at?: string;
}

function markerKeyFor(fuelEntryId: string): string {
  return `${MARKER_PREFIX}fuel_entry:${fuelEntryId}`;
}

function originalExpenseKeyFor(fuelEntryId: string): string {
  return `fuel_entry:${fuelEntryId}|fuel_expense`;
}

export interface EmitFuelChargeOffsetParams {
  fuelEntryId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  /** Original fill date (matching principle). */
  date: string;
  /** Positive magnitude of the driver-share portion being offset. */
  amount: number;
  reason?: FuelPnlOffsetReason;
}

export interface EmitFuelChargeOffsetResult {
  written: boolean;
  idempotencyKey: string;
  version: number;
  skippedNoOriginalCharge?: boolean;
}

function buildOffsetEvent(
  p: EmitFuelChargeOffsetParams,
  version: number,
  amountAbs: number,
  dateOnly: string,
  reason: FuelPnlOffsetReason,
) {
  const idempotencyKey = `fuel_entry:${p.fuelEntryId}|fuel_charge_offset:v${version}`;
  return {
    idempotencyKey,
    date: dateOnly,
    driverId: p.driverId || "unknown",
    eventType: "fuel_charge_offset",
    direction: "inflow" as const,
    netAmount: amountAbs,
    grossAmount: amountAbs,
    currency: "JMD",
    sourceType: "transaction" as const,
    sourceId: p.fuelEntryId,
    vehicleId: p.vehicleId || undefined,
    platform: "Roam",
    description: `Fuel not a fleet loss (${reason})`,
    metadata: {
      category: "Fuel Reconciliation",
      reason,
      offsetsIdempotencyKey: originalExpenseKeyFor(p.fuelEntryId),
      version,
    },
  };
}

/**
 * Offset the driver-charged portion of a fuel fill. Idempotent when already active.
 */
export async function emitFuelChargeOffset(
  p: EmitFuelChargeOffsetParams,
  c: unknown,
): Promise<EmitFuelChargeOffsetResult> {
  const amountAbs = Math.abs(Number(p.amount) || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const reason: FuelPnlOffsetReason = p.reason || "driver_share";
  const markerKey = markerKeyFor(p.fuelEntryId);
  const marker = (await kv.get(markerKey)) as FuelPnlOffsetMarker | null;

  if (!marker?.active) {
    const hasOriginal = await canonicalEventExistsByIdemKey(originalExpenseKeyFor(p.fuelEntryId));
    if (!hasOriginal) {
      console.warn(
        `[FuelPnlOffset] skipping offset for fuel_entry:${p.fuelEntryId} — no original fuel_expense`,
      );
      return {
        written: false,
        idempotencyKey: originalExpenseKeyFor(p.fuelEntryId),
        version: marker?.version ?? 0,
        skippedNoOriginalCharge: true,
      };
    }
  }

  if (amountAbs <= 1e-9) {
    return {
      written: false,
      idempotencyKey: originalExpenseKeyFor(p.fuelEntryId),
      version: marker?.version ?? 0,
    };
  }

  if (marker && marker.active) {
    const event = buildOffsetEvent(p, marker.version, amountAbs, dateOnly, reason);
    const result = await appendCanonicalLedgerEvents([event], c as never);
    if (!result?.success || (result.failed || 0) > 0) {
      console.error(`[FuelPnlOffset] re-post of active offset ${event.idempotencyKey} failed:`, result?.details);
      throw new Error(`Failed to re-post fuel charge offset ${event.idempotencyKey}`);
    }
    return { written: false, idempotencyKey: event.idempotencyKey, version: marker.version };
  }

  const version = (marker?.version ?? 0) + 1;
  const event = buildOffsetEvent(p, version, amountAbs, dateOnly, reason);
  const result = await appendCanonicalLedgerEvents([event], c as never);
  if (!result?.success || (result.failed || 0) > 0) {
    console.error(`[FuelPnlOffset] emit offset ${event.idempotencyKey} failed:`, result?.details);
    throw new Error(`Failed to emit fuel charge offset ${event.idempotencyKey}`);
  }

  await kv.set(markerKey, {
    active: true,
    version,
    reason,
    offsetIdempotencyKey: event.idempotencyKey,
    amount: amountAbs,
    at: new Date().toISOString(),
  } as FuelPnlOffsetMarker);

  console.log(
    `[FuelPnlOffset] Emitted offset ${event.idempotencyKey} for fuel_entry:${p.fuelEntryId} (amount ${amountAbs})`,
  );
  return { written: true, idempotencyKey: event.idempotencyKey, version };
}

export interface ReinstateFuelChargeParams {
  fuelEntryId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  date: string;
  /** Positive magnitude; falls back to marker.amount when omitted. */
  amount?: number;
}

export interface ReinstateFuelChargeResult {
  reinstated: boolean;
  idempotencyKey: string | null;
}

/**
 * Undo an active fuel offset (period reset / re-finalize). Safe no-op when inactive.
 */
export async function reinstateFuelCharge(
  p: ReinstateFuelChargeParams,
  c: unknown,
): Promise<ReinstateFuelChargeResult> {
  const markerKey = markerKeyFor(p.fuelEntryId);
  const marker = (await kv.get(markerKey)) as FuelPnlOffsetMarker | null;

  if (!marker || !marker.active) {
    return { reinstated: false, idempotencyKey: null };
  }

  const amountAbs = Math.abs(Number(p.amount) || marker.amount || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const idempotencyKey = `fuel_entry:${p.fuelEntryId}|fuel_charge_reinstate:v${marker.version}`;

  const event = {
    idempotencyKey,
    date: dateOnly,
    driverId: p.driverId || "unknown",
    eventType: "fuel_charge_offset",
    direction: "outflow" as const,
    netAmount: amountAbs,
    grossAmount: amountAbs,
    currency: "JMD",
    sourceType: "transaction" as const,
    sourceId: p.fuelEntryId,
    vehicleId: p.vehicleId || undefined,
    platform: "Roam",
    description: "Fuel charge reinstated (finalize reset)",
    metadata: {
      category: "Fuel Reconciliation",
      reinstatesOffsetKey: marker.offsetIdempotencyKey,
      version: marker.version,
    },
  };

  if (amountAbs > 1e-9) {
    const result = await appendCanonicalLedgerEvents([event], c as never);
    if (!result?.success || (result.failed || 0) > 0) {
      console.error(`[FuelPnlOffset] reinstate ${idempotencyKey} failed:`, result?.details);
      throw new Error(`Failed to reinstate fuel charge ${idempotencyKey}`);
    }
  }

  await kv.set(markerKey, {
    active: false,
    version: marker.version,
    reason: marker.reason,
    offsetIdempotencyKey: marker.offsetIdempotencyKey,
    reinstateIdempotencyKey: idempotencyKey,
    amount: marker.amount,
    at: new Date().toISOString(),
  } as FuelPnlOffsetMarker);

  console.log(`[FuelPnlOffset] Reinstated fuel_entry:${p.fuelEntryId} v${marker.version} via ${idempotencyKey}`);
  return { reinstated: true, idempotencyKey };
}

/**
 * Fuel P&L offsets are always on — Finalize always syncs driver-share to
 * Business Finance. Kept as a function so call sites stay readable.
 */
export async function isFuelPnlOffsetEnabled(): Promise<boolean> {
  return true;
}

export type FuelReconciliationSettings = {
  /** @deprecated Always true — offsets are automatic. */
  fuelPnlOffsetEnabled: boolean;
};

export async function getFuelReconciliationSettings(): Promise<FuelReconciliationSettings> {
  return { fuelPnlOffsetEnabled: true };
}

export async function updateFuelReconciliationSettings(
  _patch: Partial<FuelReconciliationSettings>,
): Promise<FuelReconciliationSettings> {
  // No-op write path kept for older clients; flag is permanently on.
  return { fuelPnlOffsetEnabled: true };
}

/** Blended driver-share ratio — same formula as FuelCalculationService.getBlendedDriverShareRatio. */
export function blendedDriverShareRatio(driverShare: number, totalGasCardCost: number): number {
  if (!totalGasCardCost || totalGasCardCost <= 0) return 0;
  return driverShare / totalGasCardCost;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * For each fill in a finalized report week, reinstate any active offset then
 * emit a fresh driver-share offset (amount = entry.amount * blended ratio).
 */
export async function syncFuelPnlOffsetsForFinalizedReport(
  report: {
    driverId?: string;
    vehicleId?: string;
    weekStart?: string;
    weekEnd?: string;
    driverShare?: number;
    totalGasCardCost?: number;
    gasCardSpend?: number;
  },
  entries: Array<Record<string, unknown>>,
  c: unknown,
): Promise<{ emitted: number; reinstated: number; skipped: number }> {
  const ratio = blendedDriverShareRatio(
    Math.abs(Number(report.driverShare) || 0),
    Math.abs(Number(report.totalGasCardCost) || Number(report.gasCardSpend) || 0),
  );
  let emitted = 0;
  let reinstated = 0;
  let skipped = 0;

  const work = entries.filter((e) => String(e.id || "").trim());
  const CONCURRENCY = 5;
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= work.length) return;
      const entry = work[i];
      const fuelEntryId = String(entry.id || "").trim();
      const date = String(entry.date || report.weekStart || "").split("T")[0];
      const entryAmt = Math.abs(Number(entry.amount) || 0);
      const offsetAmt = round2(entryAmt * ratio);
      const driverId = String(entry.driverId || report.driverId || "") || null;
      const vehicleId = String(entry.vehicleId || report.vehicleId || "") || null;

      const rein = await reinstateFuelCharge(
        { fuelEntryId, driverId, vehicleId, date, amount: offsetAmt },
        c,
      );
      if (rein.reinstated) reinstated++;

      if (offsetAmt <= 0.005) {
        skipped++;
        continue;
      }

      const res = await emitFuelChargeOffset(
        {
          fuelEntryId,
          driverId,
          vehicleId,
          date,
          amount: offsetAmt,
          reason: "driver_share",
        },
        c,
      );
      if (res.written) emitted++;
      else if (res.skippedNoOriginalCharge) skipped++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, Math.max(1, work.length)) }, () => worker()),
  );

  return { emitted, reinstated, skipped };
}

/** Reinstate offsets for a list of fuel entry ids (period reset). */
export async function reinstateFuelPnlOffsetsForEntries(
  entries: Array<Record<string, unknown>>,
  c: unknown,
): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    const fuelEntryId = String(entry.id || "").trim();
    if (!fuelEntryId) continue;
    const date = String(entry.date || "").split("T")[0];
    const res = await reinstateFuelCharge(
      {
        fuelEntryId,
        driverId: entry.driverId ? String(entry.driverId) : null,
        vehicleId: entry.vehicleId ? String(entry.vehicleId) : null,
        date,
        amount: Math.abs(Number(entry.amount) || 0),
      },
      c,
    );
    if (res.reinstated) count++;
  }
  return count;
}
