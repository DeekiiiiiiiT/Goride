/**
 * Shared Verified-station attach stamp for bulk-assign, Silent Attach, and merchant auto-heal.
 * Money/liters/odo are never modified — only station + verification metadata.
 */

import * as kv from "./kv_store.tsx";
import * as fuelLogic from "./fuel_logic.ts";
import { auditLogic } from "./audit_logic.ts";
import { syncLinkedExpenseTransaction } from "./fuel_transaction_sync.ts";
import { findFuelEntryByTransactionId } from "./fuel_posted_guarantee.ts";
import { canReuseLinkedFuelEntry } from "./fuel_entry_link.ts";
import {
  resolveDriverVehicleAssignment,
} from "./driver_vehicle_assignment.ts";
import {
  resolveFuelPaymentSource,
} from "./fuel_payment_source.ts";
import { odometerSequenceHealthy } from "./odometer_health.ts";
import { matchUniqueVerifiedStationForRecord } from "./merchant_station_match.ts";
import type { StationAttachMethod, VerifiedStation } from "./station_attach_types.ts";
export type { StationAttachMethod, VerifiedStation };
import {
  isAttachProtected,
  applyMerchantHealMetadata,
  shouldOverwriteLocation,
} from "./station_attach_meta.ts";
export { isAttachProtected, applyMerchantHealMetadata };

export type StationAttachContext = {
  method: StationAttachMethod;
  actorId?: string;
  actorName?: string;
  reason?: string;
  attachedAt?: string;
  /** Extra metadata for auto-heal observability */
  autoHealScore?: number;
  autoHealMerchantText?: string;
  /** When true (default for ops/heal), dismiss linked learnt staging pins */
  dismissLearnt?: boolean;
};

export type StampResult = {
  ok: boolean;
  skipped?: "already_assigned" | "protected" | "not_fuel";
  reason?: string;
  storageKey?: string;
  entry?: Record<string, unknown>;
};

function isFuelTransaction(entry: Record<string, unknown>, storageKey: string): boolean {
  if (!storageKey.startsWith("transaction:")) return true;
  const cat = entry.category;
  return cat === "Fuel" || cat === "Fuel Reimbursement";
}

/**
 * Dismiss learnt_location rows linked to this fuel entry or transaction.
 * Drift pins become anomaly_location copies then deleted from staging.
 */
export async function dismissLearntForEntry(
  entry: Record<string, unknown>,
  storageKind: "fuel_entry" | "transaction",
  reason = "Dismissed after verified station attach (GPS drift / late log)",
): Promise<number> {
  let dismissed = 0;
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const recordId = String(entry.id || "");

  const dismissOne = async (learntId: string) => {
    const loc = await kv.get(`learnt_location:${learntId}`);
    if (!loc) return;
    const anomaly = {
      ...loc,
      status: "anomaly",
      rejectedAt: new Date().toISOString(),
      rejectReason: reason,
      dismissedByAttach: true,
    };
    await kv.set(`anomaly_location:${learntId}`, anomaly);
    await kv.del(`learnt_location:${learntId}`);
    dismissed++;
  };

  const lid = meta.learntLocationId;
  if (typeof lid === "string" && lid.length > 0) {
    await dismissOne(lid);
  }

  const learntAll = (await kv.getByPrefix("learnt_location:")) || [];
  for (const loc of learntAll) {
    if (!loc?.id) continue;
    if (storageKind === "fuel_entry" && loc.sourceEntryId === recordId) {
      await dismissOne(loc.id);
    }
    if (storageKind === "transaction" && loc.transactionId === recordId) {
      await dismissOne(loc.id);
    }
  }

  if (meta.learntLocationId) {
    delete meta.learntLocationId;
    entry.metadata = meta;
  }

  return dismissed;
}

/**
 * Ensure a fuel_entry exists for a stamped fuel transaction (ported from bulk-assign).
 */
export async function ensureFuelEntryLinkedToTransaction(
  tx: Record<string, unknown>,
  station: VerifiedStation,
  method: StationAttachMethod,
): Promise<void> {
  if (!tx?.id || !station?.id) return;
  const cat = tx.category;
  if (cat !== "Fuel" && cat !== "Fuel Reimbursement") return;

  const resolved = await resolveDriverVehicleAssignment(tx.driverId as string | undefined, {
    organizationId: tx.organizationId as string | undefined,
    hintVehicleId: tx.vehicleId as string | undefined,
  });
  if (resolved.vehicleId) {
    tx.vehicleId = resolved.vehicleId;
  }

  if (!tx.vehicleId) {
    console.log(
      `[StationAttach-FuelEntry] Skip fuel_entry: no vehicleId on transaction ${tx.id}`,
    );
    return;
  }

  let existing: any = null;
  const linkedId = (tx.metadata as any)?.fuelEntryId;
  if (linkedId) {
    existing = await kv.get(`fuel_entry:${linkedId}`);
    if (!canReuseLinkedFuelEntry(existing, String(tx.id))) {
      existing = null;
    }
  }
  if (!existing) {
    existing = await findFuelEntryByTransactionId(String(tx.id));
  }

  const stationName = station.name || "Verified Station";
  const attachedAt = new Date().toISOString();

  if (existing) {
    const updated: any = {
      ...existing,
      vendor: stationName,
      matchedStationId: station.id,
      location: shouldOverwriteLocation(existing.location) ? stationName : existing.location,
      stationAddress: station.address || existing.stationAddress || (tx.metadata as any)?.stationLocation || "",
      metadata: {
        ...existing.metadata,
        locationStatus: "verified",
        verificationMethod: method,
        matchedStationId: station.id,
        bulkAssignedAt: method === "manual_bulk_assign" ? attachedAt : existing.metadata?.bulkAssignedAt,
      },
    };
    delete updated.metadata?.ambiguityReason;
    delete updated.metadata?.stationGateHold;
    delete updated.metadata?.holdReason;

    const confidence = fuelLogic.calculateConfidenceScore(updated, station);
    updated.metadata = {
      ...updated.metadata,
      auditConfidenceScore: confidence.score,
      auditConfidenceBreakdown: confidence.breakdown,
      isHighlyTrusted: confidence.isHighlyTrusted,
    };

    updated.signature = await auditLogic.generateRecordHash(updated);
    await kv.set(`fuel_entry:${existing.id}`, updated);
    await syncLinkedExpenseTransaction(updated);

    if (!(tx.metadata as any)?.fuelEntryId || (tx.metadata as any).fuelEntryId !== existing.id) {
      tx.metadata = { ...(tx.metadata as object), fuelEntryId: existing.id };
      (tx as any).signature = await auditLogic.generateRecordHash(tx);
      (tx as any).signedAt = new Date().toISOString();
      await kv.set(`transaction:${tx.id}`, tx);
    }
    return;
  }

  const quantity = Number(tx.quantity) || Number((tx.metadata as any)?.fuelVolume) || 0;
  const amount = Math.abs(Number(tx.amount) || Number((tx.metadata as any)?.totalCost) || 0);
  const pricePerLiter =
    (tx.metadata as any)?.pricePerLiter || (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);

  const rawPaymentSource = (tx.metadata as any)?.paymentSource || tx.paymentMethod;
  const paySrc = resolveFuelPaymentSource(rawPaymentSource as string);
  const fuelEntryId = crypto.randomUUID();
  const fuelEntry: any = {
    id: fuelEntryId,
    date: tx.date && tx.time
      ? `${tx.date}T${tx.time}`
      : tx.date || new Date().toISOString().split("T")[0],
    type: "Reimbursement",
    amount,
    liters: quantity,
    pricePerLiter,
    odometer: Number(tx.odometer) || 0,
    vendor: stationName,
    location: stationName,
    stationAddress: station.address || (tx.metadata as any)?.stationLocation || "",
    vehicleId: tx.vehicleId,
    driverId: tx.driverId,
    transactionId: tx.id,
    receiptUrl: tx.receiptUrl || (tx.metadata as any)?.receiptUrl,
    odometerProofUrl: tx.odometerProofUrl || (tx.metadata as any)?.odometerProofUrl,
    isVerified: true,
    source: "Station Attach",
    matchedStationId: station.id,
    paymentSource: paySrc.enum,
    entryMode: "Floating",
    metadata: {
      ...(tx.metadata as object),
      locationStatus: "verified",
      verificationMethod: method,
      matchedStationId: station.id,
      originalTransactionId: tx.id,
      paymentSource: paySrc.meta,
      stationName,
    },
  };
  delete fuelEntry.metadata?.ambiguityReason;

  const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, station);
  fuelEntry.metadata = {
    ...fuelEntry.metadata,
    auditConfidenceScore: confidence.score,
    auditConfidenceBreakdown: confidence.breakdown,
    isHighlyTrusted: confidence.isHighlyTrusted,
  };

  fuelEntry.signature = await auditLogic.generateRecordHash(fuelEntry);
  await kv.set(`fuel_entry:${fuelEntryId}`, fuelEntry);

  tx.metadata = { ...(tx.metadata as object), fuelEntryId };
  (tx as any).signature = await auditLogic.generateRecordHash(tx);
  (tx as any).signedAt = new Date().toISOString();
  await kv.set(`transaction:${tx.id}`, tx);
  await syncLinkedExpenseTransaction(fuelEntry);
}

/**
 * Stamp a loaded entry/tx onto a Verified GOD station and persist.
 * Does not invent stations. Optionally dismisses learnt staging pins.
 */
export async function stampEntryToVerifiedStation(
  entry: Record<string, unknown>,
  storageKey: string,
  station: VerifiedStation,
  ctx: StationAttachContext,
): Promise<StampResult> {
  if (!station?.id) {
    return { ok: false, reason: "Missing station" };
  }
  if (station.status && station.status !== "verified") {
    return { ok: false, reason: "Station is not Verified GOD" };
  }
  if (!isFuelTransaction(entry, storageKey)) {
    return { ok: false, skipped: "not_fuel", reason: "Not a fuel transaction" };
  }

  const stationId = station.id;
  if (
    entry.matchedStationId === stationId ||
    (entry.metadata as any)?.matchedStationId === stationId
  ) {
    // Still dismiss learnt if requested (cleanup)
    if (ctx.dismissLearnt !== false) {
      const kind = storageKey.startsWith("transaction:") ? "transaction" : "fuel_entry";
      await dismissLearntForEntry(entry, kind, ctx.reason || "Already attached — dismiss staging pin");
    }
    return { ok: false, skipped: "already_assigned", reason: "Already assigned to this station" };
  }

  // Auto-heal must not clobber GPS verified / prior ops override
  if (
    (ctx.method === "merchant_name_autoheal" || ctx.method === "merchant_name_autoheal_batch") &&
    isAttachProtected(entry)
  ) {
    return { ok: false, skipped: "protected", reason: "Protected verification method" };
  }

  const attachedAt = ctx.attachedAt || new Date().toISOString();
  const stationName = station.name || "Verified Station";

  entry.matchedStationId = stationId;
  entry.vendor = stationName;
  if (shouldOverwriteLocation(entry.location)) {
    entry.location = stationName;
  }

  const meta: Record<string, unknown> = {
    ...(entry.metadata as object || {}),
    locationStatus: "verified",
    verificationMethod: ctx.method,
    matchedStationId: stationId,
  };
  delete meta.ambiguityReason;
  delete meta.stationGateHold;
  delete meta.holdReason;
  delete meta.gateReason;

  if (ctx.method === "manual_bulk_assign") {
    meta.bulkAssignedAt = attachedAt;
  }
  if (ctx.method === "platform_ops_override") {
    meta.platformOpsAttachedAt = attachedAt;
    if (ctx.actorId) meta.platformOpsAttachedBy = ctx.actorId;
    if (ctx.actorName) meta.platformOpsAttachedByName = ctx.actorName;
    if (ctx.reason) meta.platformOpsReason = ctx.reason;
  }
  if (
    ctx.method === "merchant_name_autoheal" ||
    ctx.method === "merchant_name_autoheal_batch"
  ) {
    meta.autoHealedAt = attachedAt;
    if (ctx.autoHealScore != null) meta.autoHealScore = ctx.autoHealScore;
    if (ctx.autoHealMerchantText) meta.autoHealMerchantText = ctx.autoHealMerchantText;
  }

  entry.metadata = meta;

  if (ctx.dismissLearnt !== false) {
    const kind = storageKey.startsWith("transaction:") ? "transaction" : "fuel_entry";
    await dismissLearntForEntry(
      entry,
      kind,
      ctx.reason || `Attached via ${ctx.method}`,
    );
  }

  (entry as any).signature = await auditLogic.generateRecordHash(entry);
  (entry as any).signedAt = attachedAt;
  await kv.set(storageKey, entry);

  if (storageKey.startsWith("transaction:")) {
    await ensureFuelEntryLinkedToTransaction(entry, station, ctx.method);
  } else if (storageKey.startsWith("fuel_entry:")) {
    await syncLinkedExpenseTransaction(entry);
  }

  return { ok: true, storageKey, entry };
}

/**
 * Load fuel_entry or fuel transaction by id, stamp to station, persist.
 */
export async function attachRecordIdToStation(
  entryId: string,
  station: VerifiedStation,
  ctx: StationAttachContext,
): Promise<StampResult & { entryId: string }> {
  let entry: any = await kv.get(`fuel_entry:${entryId}`);
  let storageKey = `fuel_entry:${entryId}`;
  if (!entry) {
    entry = await kv.get(`transaction:${entryId}`);
    storageKey = `transaction:${entryId}`;
  }
  if (!entry) {
    return { ok: false, entryId, reason: "Entry not found" };
  }
  const result = await stampEntryToVerifiedStation(entry, storageKey, station, ctx);
  return { ...result, entryId };
}

/** Try merchant-name auto-heal on an in-memory record. Mutates record on success. */
export async function tryMerchantNameAutoHeal(
  record: Record<string, unknown>,
  stations: VerifiedStation[],
  opts?: { method?: StationAttachMethod },
): Promise<{ healed: boolean; score?: number; merchantText?: string; stationId?: string }> {
  const meta = (record.metadata || {}) as Record<string, unknown>;
  const status = String(meta.locationStatus || "");
  const methodNow = String(meta.verificationMethod || "");

  if (isAttachProtected(record)) {
    return { healed: false };
  }
  if (status === "verified" && methodNow && methodNow !== "jaa_issuer_statement") {
    return { healed: false };
  }

  const healable = new Set([
    "unknown",
    "review_required",
    "statement_vendor",
    "unverified",
    "",
  ]);
  if (status && !healable.has(status)) {
    return { healed: false };
  }

  const odo = await odometerSequenceHealthy({
    id: record.id as string | undefined,
    vehicleId: record.vehicleId as string | undefined,
    date: record.date as string | undefined,
    odometer: record.odometer as number | string | null | undefined,
  });

  const match = matchUniqueVerifiedStationForRecord(record, stations, {
    preferStrong: odo.isFirstFill,
  });
  if (!match) return { healed: false };
  if (!odo.healthy) return { healed: false };

  const method = opts?.method || "merchant_name_autoheal";
  applyMerchantHealMetadata(
    record,
    match.station as VerifiedStation,
    match.score,
    match.merchantText,
    method,
  );
  return {
    healed: true,
    score: match.score,
    merchantText: match.merchantText,
    stationId: match.station.id,
  };
}

