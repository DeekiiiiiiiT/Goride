/**
 * Driver Toll Charge — single consolidated emitter.
 *
 * When a toll is resolved as "Charge Driver" (personal use), the driver owes the
 * fleet for it. Historically three divergent paths produced this charge with
 * inconsistent (or missing) downstream effects. This module is the ONE place a
 * driver toll charge is emitted, so every resolution route behaves identically.
 *
 * It writes:
 *   1. SSOT — a canonical `toll_charged_to_driver` ledger_event (always), keyed
 *      deterministically so retries are idempotent. Powers the scalable
 *      driver-overview aggregate.
 *   2. Compatibility projection — ONE correctly-signed (negative = debit)
 *      `Toll Charge` transaction:* row, so the existing transaction-driven driver
 *      views (Expenses / Settlement / Cash Wallet) reflect it without a rewrite.
 *      Only when the `driverTollChargeSyncEnabled` flag is ON. Idempotent via a
 *      per-claim marker so re-resolving never double-charges.
 *
 * NON-BREAKAGE: flag default OFF ⇒ no projection txn is created and the driver
 * views are byte-identical to today. The canonical event is additive.
 */

import * as kv from "./kv_store.tsx";
import { appendCanonicalLedgerEvents } from "./ledger_canonical.ts";
import { stampOrg } from "./org_scope.ts";

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

export interface EmitDriverTollChargeParams {
  /** The toll ledger / transaction id being charged. */
  tollId: string;
  /** The resolving claim id — the idempotency anchor (one charge per claim). */
  claimId: string;
  driverId: string;
  driverName?: string;
  vehicleId?: string;
  tripId?: string | null;
  /** Positive magnitude of the toll amount. */
  amount: number;
  /** ISO date/datetime of the toll. */
  date: string;
  description?: string;
  /** Provenance: 'human_confirmed' | 'system_suggested' | 'claim_resolution' | ... */
  source: string;
}

export interface EmitDriverTollChargeResult {
  canonicalWritten: boolean;
  /** The projection transaction id, or null when the flag is OFF / already emitted. */
  projectionTxId: string | null;
  /** True when an existing projection was found (idempotent no-op). */
  alreadyProjected: boolean;
}

/**
 * Emit a driver toll charge. Safe to call multiple times for the same claim —
 * the canonical event and the projection txn are both idempotent.
 */
export async function emitDriverTollCharge(
  p: EmitDriverTollChargeParams,
  c: unknown,
): Promise<EmitDriverTollChargeResult> {
  const amountAbs = Math.abs(Number(p.amount) || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const description = p.description || "Toll charged to driver (personal use)";

  // ── 1. Canonical SSOT event (deterministic idempotency key) ──────────────
  // Keyed on the TOLL id (not the claim) so the same toll can never be charged
  // twice, even across resolution paths or a re-resolve that mints a new claim.
  const canonicalEvent = {
    idempotencyKey: `toll_charge:${p.tollId}`,
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
    },
  };

  let canonicalWritten = false;
  try {
    // Audit/aggregate events are not org-scoped (mirrors writeTollLedgerEntry).
    await appendCanonicalLedgerEvents([canonicalEvent], { get: () => undefined } as never);
    canonicalWritten = true;
  } catch (err) {
    console.error("[DriverTollCharge] canonical write failed:", err);
  }

  // ── 2. Compatibility projection txn (flag-gated, idempotent) ─────────────
  if (!(await isDriverTollChargeSyncEnabled())) {
    return { canonicalWritten, projectionTxId: null, alreadyProjected: false };
  }

  // One projection per toll (not per claim) — matches the canonical key so a
  // re-resolve that mints a new claim can never create a second driver debit.
  const markerKey = `${PROJECTION_MARKER_PREFIX}${p.tollId}`;
  const existing = (await kv.get(markerKey)) as { txId?: string } | null;
  if (existing?.txId) {
    return { canonicalWritten, projectionTxId: existing.txId, alreadyProjected: true };
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
      },
    } as Record<string, unknown>,
    c as never,
  );

  await kv.set(`transaction:${txId}`, projectionTx);
  await kv.set(markerKey, { txId, claimId: p.claimId, at: new Date().toISOString() });

  console.log(
    `[DriverTollCharge] Emitted projection txn ${txId} for claim ${p.claimId} (amount -${amountAbs}, source ${p.source})`,
  );
  return { canonicalWritten, projectionTxId: txId, alreadyProjected: false };
}
