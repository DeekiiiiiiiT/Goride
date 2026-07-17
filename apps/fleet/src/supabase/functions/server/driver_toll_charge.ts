/**
 * Driver Toll Charge — single consolidated, reversible, versioned emitter.
 *
 * When a toll is resolved as "Charge Driver" (personal use, or an underpaid
 * toll charged back via Claimable Loss), the driver owes the fleet for it.
 * Historically several divergent paths produced this charge with inconsistent
 * (or missing) downstream effects, and none of them supported RECLASSIFYING a
 * resolution (e.g. Charge Driver -> Write Off, or flip-flopping) — the charge
 * was never reversed, and re-charging after a reversal was a silent no-op.
 * This module is the ONE place a driver toll charge is emitted OR reversed.
 *
 * Persistence model (append-only, double-entry style — never deletes/mutates
 * a prior financial record for a business-state change):
 *   1. SSOT — a canonical `toll_charged_to_driver` / `toll_charge_reversed`
 *      ledger_event, keyed deterministically (`toll_charge:{tollId}:v{n}` /
 *      `toll_charge_reversal:{tollId}:v{n}`) so retries are idempotent.
 *   2. Compatibility projection — a `Toll Charge` transaction:* row (negative
 *      = debit) and, on reversal, an OFFSETTING positive `Toll Charge` row
 *      dated identically to the original so the period nets to zero. Only
 *      created when `driverTollChargeSyncEnabled` is ON.
 *
 * A per-toll marker (`toll_charge_projection:{tollId}`) tracks the CURRENT
 * active charge (if any) plus a monotonic version, so a toll can cycle
 * charge -> reverse -> re-charge -> reverse indefinitely without collision:
 *   { active: boolean; txId: string; version: number; reversalTxId?: string }
 * Markers written before this versioning existed only have `{txId}` — those
 * are read as `{ active: true, version: 1 }` for backward compatibility.
 *
 * NON-BREAKAGE: flag default OFF ⇒ no projection txn is created/reversed and
 * the driver views are byte-identical to today. The canonical SSOT events are
 * additive and unconditional (mirrors the pre-existing writeTollLedgerEntry
 * pattern elsewhere in this codebase).
 */

import * as kv from "./kv_store.tsx";
import { appendCanonicalLedgerEvents } from "./ledger_canonical.ts";
import { stampOrg } from "./org_scope.ts";
import { postFinancialEvent } from "./financial_ledger.ts";

const SETTINGS_KEY = "toll_reconciliation:settings";
const PROJECTION_MARKER_PREFIX = "toll_charge_projection:";

/** Feature flag — default OFF via strict `=== true` (mirrors refund automation). */
export async function isDriverTollChargeSyncEnabled(): Promise<boolean> {
  const rec = (await kv.get(SETTINGS_KEY)) as { driverTollChargeSyncEnabled?: boolean } | null;
  return rec?.driverTollChargeSyncEnabled === true;
}

/**
 * Master flag for the unified toll-settlement rework (one source of truth across
 * all four driver financial tabs). Default OFF. Depends operationally on
 * driverTollChargeSyncEnabled (the personal charge must reach the cash side).
 */
export async function isUnifiedTollSettlementEnabled(): Promise<boolean> {
  const rec = (await kv.get(SETTINGS_KEY)) as { unifiedTollSettlementEnabled?: boolean } | null;
  return rec?.unifiedTollSettlementEnabled === true;
}

interface DriverTollChargeMarker {
  /** Legacy markers (pre-versioning) omit this — read as `true`. */
  active?: boolean;
  txId: string;
  /** Legacy markers omit this — read as `1`. */
  version?: number;
  reversalTxId?: string;
  claimId?: string;
  at?: string;
}

interface NormalizedMarker {
  active: boolean;
  txId: string;
  version: number;
}

function normalizeMarker(raw: DriverTollChargeMarker | null): NormalizedMarker | null {
  if (!raw || !raw.txId) return null;
  return {
    active: raw.active ?? true, // legacy markers had no `active` field — treat as active
    txId: raw.txId,
    version: raw.version ?? 1, // legacy markers had no `version` field — treat as v1
  };
}

export interface EmitDriverTollChargeParams {
  /** The toll ledger / transaction id being charged. */
  tollId: string;
  /** The resolving claim id (audit metadata only — NOT the idempotency anchor). */
  claimId: string;
  driverId: string;
  driverName?: string;
  vehicleId?: string;
  tripId?: string | null;
  /** Positive magnitude of the toll amount. */
  amount: number;
  /** ISO date/datetime of the toll (its ACTUAL date, not the resolution date). */
  date: string;
  description?: string;
  /** Provenance: 'human_confirmed' | 'system_suggested' | 'claim_resolution' | ... */
  source: string;
}

export interface EmitDriverTollChargeResult {
  canonicalWritten: boolean;
  /** The projection transaction id, or null when the flag is OFF. */
  projectionTxId: string | null;
  /** True when an already-active charge was found (idempotent no-op). */
  alreadyProjected: boolean;
}

function buildChargeCanonicalEvent(
  p: EmitDriverTollChargeParams,
  version: number,
  amountAbs: number,
  dateOnly: string,
  description: string,
) {
  return {
    idempotencyKey: `toll_charge:${p.tollId}:v${version}`,
    date: dateOnly,
    driverId: p.driverId || "unknown",
    eventType: "toll_charged_to_driver",
    direction: "outflow" as const,
    netAmount: -amountAbs, // driver bears the cost
    grossAmount: amountAbs,
    currency: "JMD",
    sourceType: "toll_resolution",
    sourceId: p.tollId,
    vehicleId: p.vehicleId,
    platform: "Roam",
    description,
    metadata: {
      category: "Toll Charge",
      driverName: p.driverName,
      claimId: p.claimId,
      tollId: p.tollId,
      tripId: p.tripId ?? undefined,
      source: p.source,
      version,
    },
  };
}

/**
 * Emit a driver toll charge. Safe to call repeatedly for the same toll — if
 * an active charge already exists, this is a no-op that returns the existing
 * txId. After a reversal, calling this again correctly re-charges under a new
 * version rather than being silently blocked.
 */
export async function emitDriverTollCharge(
  p: EmitDriverTollChargeParams,
  c: unknown,
): Promise<EmitDriverTollChargeResult> {
  const amountAbs = Math.abs(Number(p.amount) || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const description = p.description || "Toll charged to driver (personal use)";

  const markerKey = `${PROJECTION_MARKER_PREFIX}${p.tollId}`;
  const marker = normalizeMarker((await kv.get(markerKey)) as DriverTollChargeMarker | null);

  if (marker && marker.active) {
    // Already actively charged — idempotent no-op. Re-write the SAME
    // canonical event key so a redundant call is a safe no-op end-to-end too
    // (appendCanonicalLedgerEvents dedups by idempotencyKey).
    const canonicalEvent = buildChargeCanonicalEvent(p, marker.version, amountAbs, dateOnly, description);
    let canonicalWritten = false;
    try {
      await appendCanonicalLedgerEvents([canonicalEvent], { get: () => undefined } as never);
      canonicalWritten = true;
    } catch (err) {
      console.error("[DriverTollCharge] canonical write failed:", err);
    }
    if (!(await isDriverTollChargeSyncEnabled())) {
      return { canonicalWritten, projectionTxId: null, alreadyProjected: false };
    }
    return { canonicalWritten, projectionTxId: marker.txId, alreadyProjected: true };
  }

  // First charge for this toll, or re-charging after a reversal — bump version.
  const version = (marker?.version ?? 0) + 1;
  const canonicalEvent = buildChargeCanonicalEvent(p, version, amountAbs, dateOnly, description);
  let canonicalWritten = false;
  try {
    const appendResult = await appendCanonicalLedgerEvents(
      [canonicalEvent],
      { get: () => undefined } as never,
    );
    // Honor insert/skip/fail — never claim success when validation rejected the event.
    canonicalWritten = !!(appendResult?.success && (appendResult.failed || 0) === 0);
  } catch (err) {
    console.error("[DriverTollCharge] canonical write failed:", err);
  }

  // Always post to SQL unified financial ledger (not behind the projection flag).
  try {
    const fin = await postFinancialEvent({
      idempotencyKey: `toll_charge:${p.tollId}:v${version}`,
      domain: "toll",
      eventType: "toll_charged_to_driver",
      sourceSystem: "driver_charge",
      sourceId: p.tollId,
      driverId: p.driverId,
      vehicleId: p.vehicleId,
      occurredAt: dateOnly,
      amountMajor: -amountAbs,
      direction: "outflow",
      product: "roam_driver",
      debitAccountKey: p.driverId?.match(/^[0-9a-f-]{36}$/i)
        ? `user:${p.driverId}:driver:digital`
        : "platform:driver_receivable",
      creditAccountKey: "platform:clearing",
      allocations: [{
        allocation_type: "driver_charge",
        amount_minor: Math.round(amountAbs * 100),
        toll_id: p.tollId,
        claim_id: p.claimId,
        driver_id: p.driverId,
      }],
      payload: {
        description,
        claimId: p.claimId,
        version,
        source: p.source,
      },
    });
    if (!fin.ok && !fin.skipped) {
      console.error("[DriverTollCharge] financial ledger post failed:", fin.error);
    } else {
      canonicalWritten = canonicalWritten || fin.ok;
    }
  } catch (err) {
    console.error("[DriverTollCharge] financial ledger exception:", err);
  }

  if (!(await isDriverTollChargeSyncEnabled())) {
    return { canonicalWritten, projectionTxId: null, alreadyProjected: false };
  }

  const txId = crypto.randomUUID();
  const projectionTx = stampOrg(
    {
      id: txId,
      driverId: p.driverId,
      date: p.date || new Date().toISOString(),
      description,
      category: "Toll Charge",
      type: "Adjustment",
      amount: -amountAbs, // NEGATIVE = debit (charge). Fixes the legacy sign bug.
      status: "Completed",
      paymentMethod: "Cash", // affects the Cash Wallet
      tripId: p.tripId ?? undefined,
      metadata: {
        claimId: p.claimId,
        tollId: p.tollId,
        source: p.source,
        projection: "driver_toll_charge",
        version,
      },
    } as Record<string, unknown>,
    c as never,
  );

  await kv.set(`transaction:${txId}`, projectionTx);
  await kv.set(markerKey, {
    active: true,
    txId,
    version,
    claimId: p.claimId,
    at: new Date().toISOString(),
  } as DriverTollChargeMarker);

  console.log(
    `[DriverTollCharge] Emitted projection txn ${txId} v${version} for claim ${p.claimId} (amount -${amountAbs}, source ${p.source})`,
  );
  return { canonicalWritten, projectionTxId: txId, alreadyProjected: false };
}

export interface ReverseDriverTollChargeParams {
  tollId: string;
  claimId: string;
  source: string;
}

export interface ReverseDriverTollChargeResult {
  /** True when an active charge was found and reversed. False = safe no-op. */
  reversed: boolean;
  reversalTxId: string | null;
}

/**
 * Reverse the currently-active driver toll charge for a toll, if any. Writes
 * an OFFSETTING positive entry (never deletes/mutates the original) dated
 * identically to the original charge so that accounting period nets to zero.
 * Safe to call when there is nothing to reverse (no-op, `reversed: false`).
 */
export async function reverseDriverTollCharge(
  p: ReverseDriverTollChargeParams,
  c: unknown,
): Promise<ReverseDriverTollChargeResult> {
  const markerKey = `${PROJECTION_MARKER_PREFIX}${p.tollId}`;
  const marker = normalizeMarker((await kv.get(markerKey)) as DriverTollChargeMarker | null);

  if (!marker || !marker.active) {
    // Nothing active to reverse — never charged, or already reversed. Safe no-op.
    return { reversed: false, reversalTxId: null };
  }

  const original = (await kv.get(`transaction:${marker.txId}`)) as Record<string, unknown> | null;
  if (!original) {
    // Data inconsistency: an active marker points at a transaction that no
    // longer exists. We cannot compute an exact offsetting amount — log loudly
    // and clear the marker so future re-charges are not blocked, but do not
    // fabricate a reversal amount.
    console.error(
      `[DriverTollCharge] reverse: active marker for toll ${p.tollId} points to missing transaction ${marker.txId} — clearing marker without a financial reversal entry.`,
    );
    await kv.set(markerKey, { active: false, txId: marker.txId, version: marker.version } as DriverTollChargeMarker);
    return { reversed: false, reversalTxId: null };
  }

  const originalAmount = Math.abs(Number(original.amount) || 0);
  const originalDate = (original.date as string) || new Date().toISOString();
  const originalDriverId = (original.driverId as string) || "unknown";
  const originalVehicleId = original.vehicleId as string | undefined;
  const originalTripId = original.tripId as string | undefined;

  // Canonical reversal event — always written (unconditional SSOT, mirrors
  // the charge side's unconditional canonical write).
  const reversalEvent = {
    idempotencyKey: `toll_charge_reversal:${p.tollId}:v${marker.version}`,
    date: originalDate.split("T")[0],
    driverId: originalDriverId,
    eventType: "toll_charge_reversed",
    direction: "inflow" as const, // reverses the original outflow
    netAmount: originalAmount, // positive — cancels the prior negative
    grossAmount: originalAmount,
    currency: "JMD",
    sourceType: "toll_resolution",
    sourceId: p.tollId,
    vehicleId: originalVehicleId,
    platform: "Roam",
    description: "Reversal of toll charge to driver",
    metadata: {
      category: "Toll Charge Reversal",
      claimId: p.claimId,
      tollId: p.tollId,
      source: p.source,
      version: marker.version,
      reversesTxId: marker.txId,
    },
  };

  try {
    await appendCanonicalLedgerEvents([reversalEvent], { get: () => undefined } as never);
  } catch (err) {
    console.error("[DriverTollCharge] reversal canonical write failed:", err);
  }

  if (!(await isDriverTollChargeSyncEnabled())) {
    // Flag off: don't touch the projection layer, but the marker MUST still
    // flip inactive — otherwise a later re-charge (once the flag is back on)
    // would incorrectly no-op against a charge already unwound canonically.
    await kv.set(markerKey, { active: false, txId: marker.txId, version: marker.version } as DriverTollChargeMarker);
    return { reversed: true, reversalTxId: null };
  }

  const reversalTxId = crypto.randomUUID();
  const reversalTx = stampOrg(
    {
      id: reversalTxId,
      driverId: originalDriverId,
      date: originalDate, // SAME date as the original charge so the period nets to zero
      description: "Reversal of toll charge to driver",
      category: "Toll Charge",
      type: "Adjustment",
      amount: originalAmount, // POSITIVE — offsets the original negative debit
      status: "Completed",
      paymentMethod: "Cash",
      tripId: originalTripId,
      metadata: {
        claimId: p.claimId,
        tollId: p.tollId,
        source: p.source,
        projection: "driver_toll_charge_reversal",
        reversesTxId: marker.txId,
        version: marker.version,
      },
    } as Record<string, unknown>,
    c as never,
  );

  await kv.set(`transaction:${reversalTxId}`, reversalTx);
  await kv.set(markerKey, {
    active: false,
    txId: marker.txId,
    version: marker.version,
    reversalTxId,
  } as DriverTollChargeMarker);

  console.log(
    `[DriverTollCharge] Reversed charge txn ${marker.txId} v${marker.version} via reversal ${reversalTxId} for claim ${p.claimId}`,
  );
  return { reversed: true, reversalTxId };
}
