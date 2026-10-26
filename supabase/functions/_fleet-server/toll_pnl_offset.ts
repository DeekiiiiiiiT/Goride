/**
 * Toll P&L Offset — single consolidated, reversible, versioned compensating
 * entry for tolls that Toll Reconciliation determined are NOT a real,
 * unrecovered business loss (cash_wash / phantom / superseded_by_expense_logged
 * / personal / platform_reimbursed), so the Business Finance P&L's Tolls line
 * stops counting them.
 *
 * The canonical ledger (`ledger_event:*`) is insert-only — there is no way to
 * update or void a previously-written `toll_charge` event. This module never
 * tries to; it appends a compensating `toll_charge_offset` event instead,
 * mirroring the exact append-only, versioned-marker idiom already used by
 * `driver_toll_charge.ts` for `toll_charged_to_driver` / `toll_charge_reversed`.
 *
 * A per-source marker (`toll_pnl_offset_marker:{sourceType}:{sourceId}`) tracks
 * whether an offset is currently active, its reason, and a monotonic version,
 * so a toll can cycle offset -> reinstate -> offset indefinitely (e.g. a
 * dispute match resolves a trip as expense_logged, then an unmatch reverts it
 * to pending, then a later match resolves it again) without collision.
 *
 * Always enabled — Finalize / Resolve always sync Business Finance P&L.
 * Call sites keep `isTollPnlOffsetEnabled()` for readability.
 */

import * as kv from "./kv_store.tsx";
import {
  appendCanonicalLedgerEvents,
  canonicalEventExistsByIdemKey,
  getCanonicalEventByIdemKey,
} from "./ledger_canonical.ts";
import {
  isFleetAbsorbingTollResolution,
  isPersonalTollResolution,
  isPlatformReimbursedPlazaToll,
} from "./toll_platform_reimbursed.ts";

const MARKER_PREFIX = "toll_pnl_offset_marker:";

export type TollPnlOffsetSourceType = "trip" | "toll_ledger";

export type TollPnlOffsetReason =
  | "cash_wash"
  | "phantom"
  | "superseded_by_expense_logged"
  | "personal"
  | "platform_reimbursed";

interface TollPnlOffsetMarker {
  active: boolean;
  version: number;
  reason: TollPnlOffsetReason;
  offsetIdempotencyKey?: string;
  reinstateIdempotencyKey?: string;
  at?: string;
}

function markerKeyFor(sourceType: TollPnlOffsetSourceType, sourceId: string): string {
  return `${MARKER_PREFIX}${sourceType}:${sourceId}`;
}

function originalChargeKeyFor(sourceType: TollPnlOffsetSourceType, sourceId: string): string {
  return `${sourceType}:${sourceId}|toll_charge`;
}

export interface EmitTollChargeOffsetParams {
  sourceType: TollPnlOffsetSourceType;
  sourceId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  /** ISO date/datetime of the ORIGINAL toll (not the resolution date) — matching-principle dating. */
  date: string;
  /** Positive magnitude of the toll amount being offset. */
  amount: number;
  reason: TollPnlOffsetReason;
  organizationId?: string | null;
}

export interface EmitTollChargeOffsetResult {
  /** True when a new offset event was written this call. False = idempotent no-op (already active) or skipped. */
  written: boolean;
  idempotencyKey: string;
  version: number;
  /**
   * True when nothing was written because the original `toll_charge` event
   * this would offset was never itself written to the ledger — e.g. trip-level
   * toll_charge events only exist for Uber trips. Offsetting a charge that was
   * never counted would inflate "recovered" with nothing to net against.
   */
  skippedNoOriginalCharge?: boolean;
}

function buildOffsetEvent(
  p: EmitTollChargeOffsetParams,
  version: number,
  amountAbs: number,
  dateOnly: string,
) {
  const idempotencyKey = `${p.sourceType}:${p.sourceId}|toll_charge_offset:v${version}`;
  return {
    idempotencyKey,
    date: dateOnly,
    driverId: p.driverId || "unknown",
    eventType: "toll_charge_offset",
    direction: "inflow" as const,
    netAmount: amountAbs,
    grossAmount: amountAbs,
    currency: "JMD",
    sourceType: p.sourceType === "trip" ? "trip" : "transaction",
    sourceId: p.sourceId,
    vehicleId: p.vehicleId || undefined,
    platform: "Roam",
    description: `Toll not a fleet loss (${p.reason})`,
    metadata: {
      category: "Toll Reconciliation",
      reason: p.reason,
      offsetsIdempotencyKey: originalChargeKeyFor(p.sourceType, p.sourceId),
      version,
    },
    ...(p.organizationId ? { organizationId: p.organizationId } : {}),
  };
}

/**
 * Offset a toll's canonical charge because reconciliation determined it is
 * not a real, unrecovered business loss. Safe to call repeatedly — if an
 * offset is already active for this source, this is a no-op (re-posts the
 * same idempotencyKey, which appendCanonicalLedgerEvents dedups).
 */
export async function emitTollChargeOffset(
  p: EmitTollChargeOffsetParams,
  c: unknown,
): Promise<EmitTollChargeOffsetResult> {
  const amountAbs = Math.abs(Number(p.amount) || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const markerKey = markerKeyFor(p.sourceType, p.sourceId);
  const marker = (await kv.get(markerKey)) as TollPnlOffsetMarker | null;

  let markerIsLive = !!(marker && marker.active);
  if (markerIsLive && marker) {
    const reinstateKey = `${p.sourceType}:${p.sourceId}|toll_charge_reinstate:v${marker.version}`;
    if (await canonicalEventExistsByIdemKey(reinstateKey)) {
      // Marker still says "on" but that version was already cancelled.
      markerIsLive = false;
    }
  }

  if (!markerIsLive) {
    // Only guard the FIRST emission — if a marker is already active we're
    // just re-posting the same idempotent event (see below), not creating a
    // new "recovered" dollar, so the existence check isn't needed there.
    const hasOriginalCharge = await canonicalEventExistsByIdemKey(originalChargeKeyFor(p.sourceType, p.sourceId));
    if (!hasOriginalCharge) {
      console.warn(
        `[TollPnlOffset] skipping offset for ${p.sourceType}:${p.sourceId} (reason ${p.reason}) — no original toll_charge event exists to offset`,
      );
      return { written: false, idempotencyKey: originalChargeKeyFor(p.sourceType, p.sourceId), version: marker?.version ?? 0, skippedNoOriginalCharge: true };
    }
  }

  if (markerIsLive && marker) {
    // Already offset — idempotent no-op. Re-write the SAME event key so a
    // redundant call is a safe no-op end-to-end (dedup by idempotencyKey).
    const event = buildOffsetEvent(p, marker.version, amountAbs, dateOnly);
    const result = await appendCanonicalLedgerEvents([event], c as never);
    if (!result?.success || (result.failed || 0) > 0) {
      console.error(
        `[TollPnlOffset] re-post of active offset ${event.idempotencyKey} failed:`,
        result?.details,
      );
      throw new Error(`Failed to re-post toll charge offset ${event.idempotencyKey}`);
    }
    return { written: false, idempotencyKey: event.idempotencyKey, version: marker.version };
  }

  const version = (marker?.version ?? 0) + 1;
  const event = buildOffsetEvent(p, version, amountAbs, dateOnly);
  const result = await appendCanonicalLedgerEvents([event], c as never);
  if (!result?.success || (result.failed || 0) > 0) {
    console.error(`[TollPnlOffset] emit offset ${event.idempotencyKey} failed:`, result?.details);
    throw new Error(`Failed to emit toll charge offset ${event.idempotencyKey}`);
  }

  await kv.set(markerKey, {
    active: true,
    version,
    reason: p.reason,
    offsetIdempotencyKey: event.idempotencyKey,
    at: new Date().toISOString(),
  } as TollPnlOffsetMarker);

  console.log(
    `[TollPnlOffset] Emitted offset ${event.idempotencyKey} for ${p.sourceType}:${p.sourceId} (reason ${p.reason}, amount ${amountAbs})`,
  );
  return { written: true, idempotencyKey: event.idempotencyKey, version };
}

export interface ReinstateTollChargeParams {
  sourceType: TollPnlOffsetSourceType;
  sourceId: string;
  driverId?: string | null;
  vehicleId?: string | null;
  /** ISO date/datetime of the ORIGINAL toll — same date used for the offset, so the period nets to zero then back. */
  date: string;
  /** Positive magnitude of the toll amount being reinstated. */
  amount: number;
  organizationId?: string | null;
}

export interface ReinstateTollChargeResult {
  /** True when an active offset was found and reinstated. False = safe no-op (nothing active). */
  reinstated: boolean;
  idempotencyKey: string | null;
}

/**
 * Highest platform_reimbursed inflow that does not already have a cancel.
 * Used when the marker was cleared but the recovery is still live.
 */
async function findLivePlatformOffsetVersion(
  sourceType: TollPnlOffsetSourceType,
  sourceId: string,
  hintVersion: number,
): Promise<number | null> {
  const ceiling = Math.max(hintVersion, 1) + 20;
  for (let version = ceiling; version >= 1; version--) {
    const offsetKey = `${sourceType}:${sourceId}|toll_charge_offset:v${version}`;
    const row = await getCanonicalEventByIdemKey(offsetKey);
    if (!row) continue;
    const meta = (row.metadata && typeof row.metadata === "object"
      ? row.metadata
      : {}) as { reason?: string; direction?: string };
    if (String(meta.reason || "") !== "platform_reimbursed") continue;
    if (String(meta.direction || "") === "outflow") continue;
    const reinstateKey = `${sourceType}:${sourceId}|toll_charge_reinstate:v${version}`;
    if (await canonicalEventExistsByIdemKey(reinstateKey)) continue;
    return version;
  }
  return null;
}

/**
 * Reinstate (undo) the currently-active offset for a toll, if any — e.g. a
 * resolution is reverted back to `pending`. Writes an OFFSETTING outflow
 * entry dated identically to the offset (never deletes/mutates it). Safe to
 * call when there is nothing to reinstate (no-op, `reinstated: false`).
 */
export async function reinstateTollCharge(
  p: ReinstateTollChargeParams,
  c: unknown,
): Promise<ReinstateTollChargeResult> {
  const markerKey = markerKeyFor(p.sourceType, p.sourceId);
  const marker = (await kv.get(markerKey)) as TollPnlOffsetMarker | null;

  let version = marker?.active ? marker.version : 0;
  let offsetIdempotencyKey = marker?.offsetIdempotencyKey;
  if (!marker?.active) {
    const live = await findLivePlatformOffsetVersion(
      p.sourceType,
      p.sourceId,
      marker?.version ?? 0,
    );
    if (live == null) return { reinstated: false, idempotencyKey: null };
    version = live;
    offsetIdempotencyKey = `${p.sourceType}:${p.sourceId}|toll_charge_offset:v${live}`;
  }

  const amountAbs = Math.abs(Number(p.amount) || 0);
  const dateOnly = (p.date || "").split("T")[0] || new Date().toISOString().split("T")[0];
  const idempotencyKey = `${p.sourceType}:${p.sourceId}|toll_charge_reinstate:v${version}`;

  const event = {
    idempotencyKey,
    date: dateOnly,
    driverId: p.driverId || "unknown",
    eventType: "toll_charge_offset",
    direction: "outflow" as const,
    netAmount: amountAbs,
    grossAmount: amountAbs,
    currency: "JMD",
    sourceType: p.sourceType === "trip" ? "trip" : "transaction",
    sourceId: p.sourceId,
    vehicleId: p.vehicleId || undefined,
    platform: "Roam",
    description: "Toll charge reinstated (resolution reverted)",
    metadata: {
      category: "Toll Reconciliation",
      reinstatesOffsetKey: offsetIdempotencyKey,
      version,
    },
    ...(p.organizationId ? { organizationId: p.organizationId } : {}),
  };

  const result = await appendCanonicalLedgerEvents([event], c as never);
  if (!result?.success || (result.failed || 0) > 0) {
    console.error(`[TollPnlOffset] reinstate ${idempotencyKey} failed:`, result?.details);
    throw new Error(`Failed to reinstate toll charge ${idempotencyKey}`);
  }

  await kv.set(markerKey, {
    active: false,
    version,
    reason: marker?.reason ?? "platform_reimbursed",
    offsetIdempotencyKey,
    reinstateIdempotencyKey: idempotencyKey,
    at: new Date().toISOString(),
  } as TollPnlOffsetMarker);

  console.log(
    `[TollPnlOffset] Reinstated ${p.sourceType}:${p.sourceId} v${version} via ${idempotencyKey}`,
  );
  return { reinstated: true, idempotencyKey };
}

/** Toll P&L offsets are always on. */
export async function isTollPnlOffsetEnabled(): Promise<boolean> {
  return true;
}

export type PlazaTollPnlSyncLike = {
  id?: string;
  amount?: number;
  date?: string;
  driverId?: string | null;
  vehicleId?: string | null;
  type?: string | null;
  resolution?: string | null;
  tripId?: string | null;
  isReconciled?: boolean;
  status?: string | null;
  organizationId?: string | null;
};

/**
 * Keep the plaza/tag canonical charge in sync with Toll Recon:
 * matched/refunded → offset (not a fleet cost); write-off/business → leave
 * (or reinstate) as fleet cost; unmatched → reinstate. Personal cancels a
 * leftover platform recovery and leaves a real personal offset alone.
 */
export async function syncPlazaTollPnlOffset(
  entry: PlazaTollPnlSyncLike,
  c: unknown,
): Promise<void> {
  const id = String(entry?.id || "").trim();
  if (!id) return;
  const kind = String(entry.type || "").toLowerCase().replace("-", "_");
  if (kind === "top_up" || kind === "refund" || kind === "adjustment") return;
  if (isPersonalTollResolution(entry.resolution)) {
    const marker = (await kv.get(markerKeyFor("toll_ledger", id))) as TollPnlOffsetMarker | null;
    // A personal charge must not also keep a platform recovery. Leave a real
    // personal offset alone.
    if (marker?.active && marker.reason !== "platform_reimbursed") return;
    const amount = Math.abs(Number(entry.amount) || 0);
    if (amount <= 0.005) return;
    await reinstateTollCharge(
      {
        sourceType: "toll_ledger",
        sourceId: id,
        driverId: entry.driverId,
        vehicleId: entry.vehicleId,
        date: String(entry.date || new Date().toISOString()),
        amount,
        organizationId: entry.organizationId,
      },
      c,
    );
    return;
  }

  const amount = Math.abs(Number(entry.amount) || 0);
  if (amount <= 0.005) return;
  const base = {
    sourceType: "toll_ledger" as const,
    sourceId: id,
    driverId: entry.driverId,
    vehicleId: entry.vehicleId,
    date: String(entry.date || new Date().toISOString()),
    amount,
    organizationId: entry.organizationId,
  };

  if (isFleetAbsorbingTollResolution(entry.resolution)) {
    await reinstateTollCharge(base, c);
    return;
  }
  if (isPlatformReimbursedPlazaToll(entry)) {
    await emitTollChargeOffset({ ...base, reason: "platform_reimbursed" }, c);
    return;
  }
  await reinstateTollCharge(base, c);
}
