/**
 * Keep driver expense transactions and fuel_entry ledger rows in sync.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import * as kv from "./kv_store.tsx";
import {
  enrichRecordWithDriverVehicle,
  expandDriverIdVariants,
} from "./driver_vehicle_assignment.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function orgMatches(
  record: Record<string, unknown>,
  organizationId?: string | null,
): boolean {
  if (!organizationId) return true;
  const ro = record.organizationId;
  if (ro == null || ro === "") return true;
  return String(ro) === String(organizationId);
}

function isFuelCategory(category: unknown): boolean {
  const c = String(category || "");
  return c === "Fuel" || c === "Fuel Reimbursement";
}

function isVerifiedStation(meta: Record<string, unknown> | undefined): boolean {
  return meta?.locationStatus === "verified" || !!meta?.matchedStationId;
}

/**
 * After a fuel_entry is written, update the linked expense transaction
 * (vehicleId, approval when station is verified).
 */
export async function syncLinkedExpenseTransaction(
  fuelEntry: Record<string, unknown>,
): Promise<void> {
  const meta =
    fuelEntry.metadata && typeof fuelEntry.metadata === "object"
      ? (fuelEntry.metadata as Record<string, unknown>)
      : {};

  const txId =
    (fuelEntry.transactionId as string | undefined) ||
    (meta.originalTransactionId as string | undefined) ||
    (meta.transactionId as string | undefined);

  if (!txId) return;

  const tx = await kv.get(`transaction:${txId}`);
  if (!tx || typeof tx !== "object") return;

  let changed = false;

  if (fuelEntry.vehicleId && !tx.vehicleId) {
    tx.vehicleId = fuelEntry.vehicleId;
    changed = true;
  }

  const entryMeta = meta;
  const txMeta = { ...(tx.metadata || {}) } as Record<string, unknown>;

  if (fuelEntry.matchedStationId && !tx.matchedStationId) {
    tx.matchedStationId = fuelEntry.matchedStationId;
    txMeta.matchedStationId = fuelEntry.matchedStationId;
    changed = true;
  }

  if (entryMeta.locationStatus && !txMeta.locationStatus) {
    txMeta.locationStatus = entryMeta.locationStatus;
    changed = true;
  }

  if (fuelEntry.vendor && (!tx.vendor || String(tx.vendor).toLowerCase().includes("unspecified"))) {
    tx.vendor = fuelEntry.vendor;
    changed = true;
  }

  const verified = isVerifiedStation(entryMeta) || isVerifiedStation(txMeta);
  if (verified && isFuelCategory(tx.category) && tx.status === "Pending") {
    tx.status = "Approved";
    tx.isReconciled = true;
    txMeta.stationGateHold = false;
    txMeta.holdReason = undefined;
    txMeta.holdTimestamp = undefined;
    txMeta.approvedAt = txMeta.approvedAt || new Date().toISOString();
    txMeta.approvalReason =
      txMeta.approvalReason || "Synced from fuel_entry after vehicle/station resolution";
    txMeta.fuelEntryId = fuelEntry.id;
    changed = true;
  }

  if (changed) {
    tx.metadata = txMeta;
    await kv.set(`transaction:${txId}`, tx);
  }
}

/**
 * After bulk-assign / station release creates or updates a fuel_entry,
 * ensure the source transaction reflects the same vehicle + approval state.
 */
export async function syncFuelEntryAndTransaction(
  fuelEntry: Record<string, unknown>,
  tx?: Record<string, unknown> | null,
): Promise<Record<string, unknown>> {
  const orgId = fuelEntry.organizationId as string | undefined;
  const enriched = await enrichRecordWithDriverVehicle(fuelEntry, orgId);

  if (tx && typeof tx === "object") {
    if (enriched.vehicleId && !tx.vehicleId) {
      tx.vehicleId = enriched.vehicleId;
    }
    if (enriched.matchedStationId && !tx.matchedStationId) {
      tx.matchedStationId = enriched.matchedStationId;
    }
    const txMeta = { ...(tx.metadata || {}) } as Record<string, unknown>;
    const entryMeta = (enriched.metadata || {}) as Record<string, unknown>;
    if (isVerifiedStation(entryMeta) && isFuelCategory(tx.category) && tx.status === "Pending") {
      tx.status = "Approved";
      tx.isReconciled = true;
      txMeta.stationGateHold = false;
      txMeta.approvedAt = txMeta.approvedAt || new Date().toISOString();
      txMeta.fuelEntryId = enriched.id;
      tx.metadata = txMeta;
    }
    enriched.transactionId = enriched.transactionId || tx.id;
    tx.metadata = {
      ...(tx.metadata || {}),
      fuelEntryId: enriched.id,
    };
    await kv.set(`transaction:${tx.id}`, tx);
  }

  await syncLinkedExpenseTransaction(enriched);
  return enriched;
}

/** Backfill vehicleId on fuel_entry + fuel expense transactions for a driver. */
export async function backfillMissingVehicleOnDriverFuelRecords(
  driverId: string,
  vehicleId: string,
  organizationId?: string | null,
): Promise<{ fuelEntries: number; transactions: number }> {
  const variants = await expandDriverIdVariants(driverId);
  if (variants.length === 0) return { fuelEntries: 0, transactions: 0 };

  let fuelEntries = 0;
  let transactions = 0;

  const driverOr = variants.map((id) => `value->>driverId.eq.${id}`).join(",");

  const { data: fuelRows } = await supabase
    .from("kv_store_37f42386")
    .select("key, value")
    .like("key", "fuel_entry:%")
    .or(driverOr);

  for (const row of fuelRows || []) {
    const entry = row.value as Record<string, unknown>;
    if (!entry || entry.vehicleId) continue;
    if (!orgMatches(entry, organizationId)) continue;
    entry.vehicleId = vehicleId;
    await kv.set(row.key, entry);
    fuelEntries++;
    await syncLinkedExpenseTransaction(entry);
  }

  const { data: txRows } = await supabase
    .from("kv_store_37f42386")
    .select("key, value")
    .like("key", "transaction:%")
    .or(driverOr);

  for (const row of txRows || []) {
    const tx = row.value as Record<string, unknown>;
    if (!tx || tx.vehicleId) continue;
    const cat = String(tx.category || "");
    if (cat !== "Fuel" && cat !== "Fuel Reimbursement") continue;
    if (!orgMatches(tx, organizationId)) continue;
    tx.vehicleId = vehicleId;
    await kv.set(row.key, tx);
    transactions++;
  }

  return { fuelEntries, transactions };
}
