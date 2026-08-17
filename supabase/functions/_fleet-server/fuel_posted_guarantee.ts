/**
 * Posted = Approved fuel transaction + linked fuel_entry (inseparable).
 * Shared by auto-approve, admin approve, station release, and heal-on-refresh.
 */
import * as kv from "./kv_store.tsx";
import { fromKvStore } from "./fleet_sql_bridge.ts";
import {
  enrichRecordWithDriverVehicle,
  resolveDriverVehicleAssignment,
} from "./driver_vehicle_assignment.ts";
import { resolveFuelPaymentSource } from "./fuel_payment_source.ts";
import { syncLinkedExpenseTransaction } from "./fuel_transaction_sync.ts";
import * as fuelLogic from "./fuel_logic.ts";
import { stampEntryCycleMetadata } from "./fuel_cycle_stamp.ts";
import { auditLogic } from "./audit_logic.ts";
import { projectFromFuelEntry } from "./odometer_ledger.ts";
import { canReuseLinkedFuelEntry, fuelEntryBelongsToTransaction } from "./fuel_entry_link.ts";
import { queryFleet } from "./repos/baseRepo.ts";

export type FuelDecisionReason =
  | "AUTO_AI_STATION"
  | "HOLD_STATION"
  | "REVIEW_ODO"
  | "BLOCKED_NO_VEHICLE"
  | "ADMIN_APPROVED"
  | "STATION_GATE_RELEASED";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyUuid(id: unknown): boolean {
  return typeof id === "string" && UUID_RE.test(id.trim());
}

/** Resolve plate or UUID hint to canonical vehicle UUID + display fields. */
export async function resolveCanonicalVehicleForFuel(
  hintVehicleId: string | null | undefined,
  driverId: string | null | undefined,
  organizationId?: string | null,
): Promise<{
  vehicleId: string | null;
  vehiclePlate?: string;
  vehicleName?: string;
  vehicle?: Record<string, unknown> | null;
}> {
  const hint = hintVehicleId != null ? String(hintVehicleId).trim() : "";

  if (hint && isLikelyUuid(hint)) {
    const vehicle = await kv.get(`vehicle:${hint}`);
    if (vehicle && typeof vehicle === "object") {
      const plate = vehicle.plateNumber || vehicle.licensePlate;
      const vehicleName =
        vehicle.vehicleName ||
        `${vehicle.make || ""} ${vehicle.model || ""}`.trim();
      return {
        vehicleId: hint,
        vehiclePlate: plate ? String(plate) : undefined,
        vehicleName: vehicleName || undefined,
        vehicle,
      };
    }
  }

  // Plate-like hint (e.g. 5179KZ) — find unique vehicle by plate
  if (hint && !isLikelyUuid(hint)) {
    const plateNorm = hint.replace(/\s+/g, "").toUpperCase();
    const { data } = await fromKvStore()
      .select("key, value")
      .like("key", "vehicle:%")
      .limit(500);
    const matches = (data || []).filter((row: any) => {
      const v = row.value || {};
      const p = String(v.plateNumber || v.licensePlate || "")
        .replace(/\s+/g, "")
        .toUpperCase();
      return p === plateNorm;
    });
    if (matches.length === 1) {
      const vehicle = matches[0].value;
      const id = vehicle.id || String(matches[0].key).replace(/^vehicle:/, "");
      const plate = vehicle.plateNumber || vehicle.licensePlate;
      const vehicleName =
        vehicle.vehicleName ||
        `${vehicle.make || ""} ${vehicle.model || ""}`.trim();
      return {
        vehicleId: String(id),
        vehiclePlate: plate ? String(plate) : hint,
        vehicleName: vehicleName || undefined,
        vehicle,
      };
    }
  }

  if (driverId) {
    const resolved = await resolveDriverVehicleAssignment(driverId, {
      organizationId,
      hintVehicleId: hint || undefined,
    });
    if (resolved.vehicleId) {
      const vehicle = resolved.vehicle;
      const plate = vehicle?.plateNumber || vehicle?.licensePlate;
      const vehicleName = vehicle
        ? vehicle.vehicleName ||
          `${vehicle.make || ""} ${vehicle.model || ""}`.trim()
        : undefined;
      return {
        vehicleId: resolved.vehicleId,
        vehiclePlate: plate ? String(plate) : hint || undefined,
        vehicleName: vehicleName || undefined,
        vehicle,
      };
    }
  }

  return { vehicleId: null, vehiclePlate: hint || undefined };
}

export async function findFuelEntryByTransactionId(txId: string): Promise<any | null> {
  const id = String(txId || "").trim();
  if (!id) return null;

  const pickOwned = (rows: unknown[]): any | null => {
    for (const row of rows) {
      if (row && typeof row === "object" && fuelEntryBelongsToTransaction(row as Record<string, unknown>, id)) {
        return row;
      }
    }
    return null;
  };

  const byCol = await queryFleet("fuel_entries", {
    eq: { transaction_id: id },
    limit: 10,
  });
  if (byCol.error) {
    console.warn("[findFuelEntryByTransactionId] transaction_id lookup failed:", byCol.error.message);
  } else {
    const owned = pickOwned(byCol.data);
    if (owned) return owned;
  }

  const byMeta = await queryFleet("fuel_entries", {
    filters: [{ op: "eq", col: "value->metadata->>originalTransactionId", value: id }],
    limit: 10,
  });
  if (byMeta.error) {
    console.warn("[findFuelEntryByTransactionId] metadata lookup failed:", byMeta.error.message);
    return null;
  }
  return pickOwned(byMeta.data);
}

async function resolveDriverName(
  driverId: string | null | undefined,
  fallback?: string | null,
): Promise<string | undefined> {
  if (fallback && String(fallback).trim()) return String(fallback).trim();
  if (!driverId) return undefined;
  const driver = await kv.get(`driver:${driverId}`);
  if (driver && typeof driver === "object") {
    const name =
      driver.driverName || driver.name || driver.fullName || driver.displayName;
    if (name) return String(name);
  }
  return undefined;
}

export type PersistFuelEntryOptions = {
  source: string;
  stationName?: string | null;
  matchedStation?: any | null;
  decisionReason: FuelDecisionReason;
  stamp?: (record: any) => any;
  /** Optional canonical ledger append (auto-approve path). */
  afterPersist?: (fuelEntry: any) => Promise<void>;
};

const TERMINAL_RECON_STATUSES = new Set(["Verified", "Archived"]);

/** Finalize only posts Pending fills — null/blank must become Pending unless week is closed. */
export function stampPendingReconciliationStatus(entry: Record<string, unknown>): boolean {
  const status = entry.reconciliationStatus;
  if (status && TERMINAL_RECON_STATUSES.has(String(status))) return false;
  const meta =
    entry.metadata && typeof entry.metadata === "object"
      ? (entry.metadata as Record<string, unknown>)
      : {};
  if (meta.finalizedByReport) return false;
  if (status === "Pending") return false;
  entry.reconciliationStatus = "Pending";
  return true;
}

const AUTH_SOURCES = new Set([
  "driver-portal",
  "admin-manual",
  "admin-edit",
  "bulk-import",
  "fuel-card",
]);

/** Who authored the fill-up — not cash/payment style (isManual). */
function resolveAuthorshipFromApprovedTx(tx: any): string {
  const m = tx?.metadata || {};
  const explicit = tx?.entrySource || m.entrySource;
  if (typeof explicit === "string" && AUTH_SOURCES.has(explicit)) return explicit;

  const src = m.source;
  if (src === "Bulk Manual" || src === "Bulk Log") return "bulk-import";
  if (src === "Manual") return "admin-manual";
  if (tx?.type === "Fuel_Manual_Entry" && src === "Fuel Log") return "admin-manual";

  // Driver expense approved / station hold released → Portal authorship
  return "driver-portal";
}

/**
 * Create or reuse fuel_entry for an Approved fuel transaction.
 * Mutates tx in place (vehicleId, metadata.fuelEntryId, decisionReason).
 * Returns null if vehicle cannot be resolved (caller must not leave Approved).
 */
export async function ensureFuelEntryForApprovedTx(
  tx: any,
  opts: PersistFuelEntryOptions,
): Promise<{ fuelEntry: any | null; created: boolean; blockedNoVehicle: boolean }> {
  const cat = tx?.category;
  if (cat !== "Fuel" && cat !== "Fuel Reimbursement") {
    return { fuelEntry: null, created: false, blockedNoVehicle: false };
  }

  const enriched = await enrichRecordWithDriverVehicle(tx, tx.organizationId);
  Object.assign(tx, enriched);

  const canonical = await resolveCanonicalVehicleForFuel(
    tx.vehicleId,
    tx.driverId,
    tx.organizationId,
  );
  if (canonical.vehicleId) {
    tx.vehicleId = canonical.vehicleId;
    if (canonical.vehiclePlate) tx.vehiclePlate = canonical.vehiclePlate;
    if (canonical.vehicleName) tx.vehicleName = canonical.vehicleName;
  }

  if (!tx.vehicleId) {
    tx.metadata = {
      ...(tx.metadata || {}),
      decisionReason: "BLOCKED_NO_VEHICLE" as FuelDecisionReason,
    };
    return { fuelEntry: null, created: false, blockedNoVehicle: true };
  }

  // Idempotent: existing link — only if that log line belongs to this expense
  const linkedId = tx.metadata?.fuelEntryId;
  if (linkedId) {
    const existing = await kv.get(`fuel_entry:${linkedId}`);
    if (canReuseLinkedFuelEntry(existing, tx.id)) {
      const patched = { ...existing };
      if (stampPendingReconciliationStatus(patched)) {
        const toSave = opts.stamp ? opts.stamp(patched) : patched;
        await kv.set(`fuel_entry:${patched.id}`, toSave);
      }
      tx.metadata = {
        ...(tx.metadata || {}),
        fuelEntryId: patched.id,
        decisionReason: opts.decisionReason,
      };
      return { fuelEntry: patched, created: false, blockedNoVehicle: false };
    }
    if (existing) {
      console.warn(
        `[ensureFuelEntryForApprovedTx] stale fuelEntryId ${linkedId} on tx ${tx.id} (owned by ${existing.transactionId || "none"}) — creating a new log line`,
      );
      const nextMeta = { ...(tx.metadata || {}) };
      delete nextMeta.fuelEntryId;
      tx.metadata = nextMeta;
    }
  }

  const byTx = await findFuelEntryByTransactionId(tx.id);
  if (byTx) {
    tx.metadata = {
      ...(tx.metadata || {}),
      fuelEntryId: byTx.id,
      decisionReason: opts.decisionReason,
    };
    // Patch identity on existing entry if thin
    const patched = { ...byTx };
    let dirty = false;
    if (canonical.vehicleId && patched.vehicleId !== canonical.vehicleId) {
      patched.vehicleId = canonical.vehicleId;
      dirty = true;
    }
    if (canonical.vehiclePlate && !patched.vehiclePlate) {
      patched.vehiclePlate = canonical.vehiclePlate;
      dirty = true;
    }
    const dName = await resolveDriverName(tx.driverId, tx.driverName);
    if (dName && !patched.driverName) {
      patched.driverName = dName;
      dirty = true;
    }
    if (stampPendingReconciliationStatus(patched)) dirty = true;
    if (dirty) {
      const toSave = opts.stamp ? opts.stamp(patched) : patched;
      await kv.set(`fuel_entry:${patched.id}`, toSave);
      try {
        await projectFromFuelEntry(toSave as Record<string, unknown>, (toSave as any).organizationId);
      } catch (e) {
        console.error("[ensureFuelEntryForApprovedTx] odometer ledger projection failed (existing):", e);
      }
    }
    return { fuelEntry: patched, created: false, blockedNoVehicle: false };
  }

  const amount = Math.abs(Number(tx.amount) || Number(tx.metadata?.totalCost) || 0);
  let quantity = Number(tx.quantity) || Number(tx.metadata?.fuelVolume) || 0;
  if (!quantity || quantity <= 0) {
    const ppl = Number(tx.metadata?.pricePerLiter);
    if (amount > 0 && ppl > 0) quantity = Number((amount / ppl).toFixed(2));
  }
  const pricePerLiter =
    Number(tx.metadata?.pricePerLiter) ||
    (quantity > 0 ? Number((amount / quantity).toFixed(3)) : 0);
  if (quantity > 0) {
    tx.quantity = quantity;
    tx.metadata = { ...tx.metadata, fuelVolume: quantity };
  }

  const resolvedVendor =
    opts.stationName ||
    opts.matchedStation?.name ||
    tx.vendor ||
    tx.merchant ||
    tx.description ||
    "Reimbursement";

  const paySrc = resolveFuelPaymentSource(
    tx.metadata?.paymentSource || tx.paymentSource || tx.paymentMethod,
  );

  const driverName = await resolveDriverName(tx.driverId, tx.driverName);
  if (driverName) tx.driverName = driverName;

  // Authorship (who created the line) — not cash/payment style. isManual stays cash-style only.
  const entrySource = resolveAuthorshipFromApprovedTx(tx);

  const fuelEntry: any = {
    id: crypto.randomUUID(),
    date:
      tx.date && tx.time
        ? `${tx.date}T${tx.time}`
        : tx.date || new Date().toISOString().split("T")[0],
    type: "Reimbursement",
    amount,
    liters: quantity,
    pricePerLiter,
    odometer: Number(tx.odometer) || 0,
    location: resolvedVendor,
    vendor: resolvedVendor,
    stationAddress: tx.metadata?.stationLocation || tx.location || "",
    vehicleId: tx.vehicleId,
    vehiclePlate: tx.vehiclePlate || canonical.vehiclePlate,
    vehicleName: tx.vehicleName || canonical.vehicleName,
    driverId: tx.driverId,
    driverName: driverName || undefined,
    transactionId: tx.id,
    matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
    receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
    odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
    isVerified: true,
    source: opts.source,
    entrySource,
    paymentSource: paySrc.enum,
    reconciliationStatus: "Pending",
    metadata: {
      ...(tx.metadata || {}),
      portal_type: tx.metadata?.portal_type || "Manual_Entry",
      // Cash-style flag only — UI must not treat this as Admin Entry authorship
      isManual:
        tx.metadata?.isManual ??
        (tx.paymentMethod === "Cash" || tx.metadata?.portal_type === "Manual_Entry"),
      entrySource,
      sourceId: tx.id,
      originalTransactionId: tx.id,
      source: opts.source,
      receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
      odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
      locationStatus:
        tx.metadata?.locationStatus ||
        (tx.matchedStationId || tx.metadata?.matchedStationId ? "verified" : "unknown"),
      matchedStationId: tx.matchedStationId || tx.metadata?.matchedStationId,
      verificationMethod: tx.metadata?.verificationMethod,
      matchDistance: tx.metadata?.matchDistance,
      matchConfidence: tx.metadata?.matchConfidence,
      paymentSource: paySrc.meta,
      decisionReason: opts.decisionReason,
      locationMetadata: tx.metadata?.locationMetadata,
      parentCompany: tx.metadata?.parentCompany,
    },
  };
  delete fuelEntry.metadata.fuelEntryId;

  let matchedStation = opts.matchedStation || null;
  if (!matchedStation && fuelEntry.matchedStationId) {
    matchedStation = await kv.get(`station:${fuelEntry.matchedStationId}`);
  }

  // Capacity cycle spine: unified stamper (cycleId + close policy + integrity)
  try {
    const vehicle =
      canonical.vehicle ||
      (fuelEntry.vehicleId ? await kv.get(`vehicle:${fuelEntry.vehicleId}`) : null);
    if (vehicle) {
      await stampEntryCycleMetadata(fuelEntry, vehicle);
      delete fuelEntry.metadata.isHardAnchor;
    }
  } catch (cycleErr) {
    console.warn("[ensureFuelEntryForApprovedTx] cycle stamp failed:", cycleErr);
    if (fuelEntry.metadata) {
      delete fuelEntry.metadata.isHardAnchor;
      delete fuelEntry.metadata.isFullTank;
    }
  }

  // Verified station match → forensic seal (parity with GPS POST / manual override paths)
  const stationVerified = matchedStation?.status === "verified";
  if (stationVerified) {
    fuelEntry.signature = await auditLogic.generateRecordHash(fuelEntry);
    fuelEntry.signedAt = new Date().toISOString();
  }

  // Score after cycle stamp + optional signature so crypto/physical breakdown is accurate
  const confidence = fuelLogic.calculateConfidenceScore(fuelEntry, matchedStation);
  fuelEntry.metadata = {
    ...fuelEntry.metadata,
    auditConfidenceScore: confidence.score,
    auditConfidenceBreakdown: confidence.breakdown,
    isHighlyTrusted: confidence.isHighlyTrusted,
  };

  if (stationVerified && confidence.isHighlyTrusted && !fuelEntry.isLocked) {
    fuelEntry.isLocked = true;
    fuelEntry.lockedAt = new Date().toISOString();
    fuelEntry.auditStatus = "Auto-Locked";
    fuelEntry.signature = await auditLogic.generateRecordHash(fuelEntry);
    console.log(
      `[ensureFuelEntryForApprovedTx] Auto-locked ${fuelEntry.id} (score ${confidence.score})`,
    );
  }

  const toSave = opts.stamp ? opts.stamp(fuelEntry) : fuelEntry;
  await kv.set(`fuel_entry:${fuelEntry.id}`, toSave);
  await syncLinkedExpenseTransaction(fuelEntry);
  try {
    await projectFromFuelEntry(toSave as Record<string, unknown>, (toSave as any).organizationId);
  } catch (e) {
    console.error("[ensureFuelEntryForApprovedTx] odometer ledger projection failed:", e);
  }
  if (opts.afterPersist) await opts.afterPersist(fuelEntry);

  tx.metadata = {
    ...(tx.metadata || {}),
    fuelEntryId: fuelEntry.id,
    decisionReason: opts.decisionReason,
    receiptUrl: tx.receiptUrl || tx.metadata?.receiptUrl,
    odometerProofUrl: tx.odometerProofUrl || tx.metadata?.odometerProofUrl,
  };
  tx.receiptUrl = tx.receiptUrl || tx.metadata?.receiptUrl;

  return { fuelEntry, created: true, blockedNoVehicle: false };
}

/** Heal Approved fuel txs missing fuel_entry (idempotent). Returns count created. */
export async function healApprovedFuelEntriesMissingLog(
  limit = 50,
  stamp?: (record: any) => any,
): Promise<{ healed: number; blocked: number }> {
  const { data } = await fromKvStore()
    .select("key, value")
    .like("key", "transaction:%")
    .eq("value->>status", "Approved")
    .in("value->>category", ["Fuel", "Fuel Reimbursement"])
    .order("value->>date", { ascending: false })
    .limit(limit * 3);

  let healed = 0;
  let blocked = 0;
  for (const row of data || []) {
    const tx = row.value;
    if (!tx?.id) continue;
    if (tx.metadata?.fuelEntryId) {
      const exists = await kv.get(`fuel_entry:${tx.metadata.fuelEntryId}`);
      if (canReuseLinkedFuelEntry(exists, tx.id)) continue;
      if (exists) {
        const nextMeta = { ...(tx.metadata || {}) };
        delete nextMeta.fuelEntryId;
        tx.metadata = nextMeta;
      }
    }
    const existing = await findFuelEntryByTransactionId(tx.id);
    if (existing) {
      tx.metadata = { ...(tx.metadata || {}), fuelEntryId: existing.id };
      await kv.set(`transaction:${tx.id}`, stamp ? stamp(tx) : tx);
      continue;
    }
    const result = await ensureFuelEntryForApprovedTx(tx, {
      source: "Heal Ensure",
      decisionReason: "ADMIN_APPROVED",
      stamp,
    });
    if (result.blockedNoVehicle) {
      blocked++;
      continue;
    }
    if (result.created) {
      healed++;
      await kv.set(`transaction:${tx.id}`, stamp ? stamp(tx) : tx);
    } else if (result.fuelEntry) {
      await kv.set(`transaction:${tx.id}`, stamp ? stamp(tx) : tx);
    }
  }
  return { healed, blocked };
}

/** Heal fuel logs missing reconciliationStatus so Finalize can settle them. */
export async function healFuelEntriesMissingPendingStatus(
  limit = 100,
  stamp?: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<{ healed: number; scanned: number }> {
  const { data } = await fromKvStore()
    .select("key, value")
    .like("key", "fuel_entry:%")
    .is("value->reconciliationStatus", null)
    .limit(Math.min(limit * 5, 500));

  let healed = 0;
  let scanned = 0;

  for (const row of data || []) {
    if (healed >= limit) break;
    const entry = row.value as Record<string, unknown>;
    if (!entry?.id) continue;

    scanned++;
    const copy = { ...(entry as Record<string, unknown>) };
    if (!stampPendingReconciliationStatus(copy)) continue;

    const toSave = stamp ? stamp(copy) : copy;
    await kv.set(`fuel_entry:${entry.id}`, toSave);
    healed++;
    console.log(`[HealFuelPending] ${entry.id} → Pending (${entry.date})`);
  }

  return { healed, scanned };
}
