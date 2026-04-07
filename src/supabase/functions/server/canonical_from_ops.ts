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

  const fareGross = coerceAmount(trip.amount);
  if (fareGross <= 0) return [];

  const platform = String(trip.platform || "Roam").trim();
  const platformLc = platform.toLowerCase();

  // Default: gross === net. InDrive with fee fields: gross = fare, net = driver profit so (gross − net) is the
  // wallet service fee (see computeIndriveWalletFeesFromLedgerEntries + DriverIndriveWalletTab).
  let netAmount = fareGross;
  let grossAmount = fareGross;

  if (platformLc === "indrive") {
    if (trip.indriveNetIncome != null) {
      const netIncome = coerceAmount(trip.indriveNetIncome);
      grossAmount = fareGross;
      netAmount = netIncome;
      if (netAmount > grossAmount) grossAmount = netAmount;
    } else if (trip.indriveServiceFee != null) {
      const fee = Math.max(0, coerceAmount(trip.indriveServiceFee));
      if (fee > 0) {
        grossAmount = fareGross;
        netAmount = Number((fareGross - fee).toFixed(2));
        if (netAmount < 0) netAmount = 0;
        if (netAmount > grossAmount) grossAmount = netAmount;
      }
    }
  }

  return [
    {
      idempotencyKey: `trip:${id}|fare_earning`,
      date,
      driverId,
      eventType: "fare_earning",
      direction: "inflow",
      netAmount,
      grossAmount,
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

/** Aggregate insert/skip/fail counts from canonical append (used by bulk rebuild). */
export async function appendCanonicalTripFaresIfEligibleWithStats(
  trips: Record<string, unknown>[],
  c: Context,
): Promise<{ inserted: number; skipped: number; failed: number }> {
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const batch: Record<string, unknown>[] = [];
  for (const trip of trips) {
    batch.push(...buildCanonicalTripFareEventsFromTrip(trip));
  }
  if (batch.length === 0) return { inserted, skipped, failed };
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    try {
      const r = await appendCanonicalLedgerEvents(chunk, c);
      inserted += r.inserted;
      skipped += r.skipped;
      failed += r.failed;
    } catch (e) {
      console.error("[CanonicalOps] trip fare append failed:", e);
      failed += chunk.length;
    }
  }
  return { inserted, skipped, failed };
}

export async function appendCanonicalTripFaresIfEligible(
  trips: Record<string, unknown>[],
  c: Context,
): Promise<void> {
  await appendCanonicalTripFaresIfEligibleWithStats(trips, c);
}

// ─── InDrive Wallet Credit ──────────────────────────────────────────────────

export function buildCanonicalWalletCreditEvent(
  transaction: Record<string, unknown>,
): Record<string, unknown> | null {
  const id = String(transaction.id ?? "").trim();
  const driverId = String(transaction.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const rawDate =
    typeof transaction.date === "string"
      ? transaction.date.trim()
      : typeof transaction.createdAt === "string"
      ? transaction.createdAt.trim()
      : "";
  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const amt = Math.abs(coerceAmount(transaction.amount));
  if (amt <= 1e-9) return null;

  return {
    idempotencyKey: `transaction:${id}|wallet_credit`,
    date,
    driverId,
    eventType: "wallet_credit",
    direction: "inflow",
    netAmount: amt,
    grossAmount: amt,
    currency: "JMD",
    sourceType: "transaction",
    sourceId: id,
    platform: "InDrive",
    description:
      typeof transaction.description === "string" && transaction.description.trim()
        ? transaction.description.trim()
        : "InDrive Wallet Credit",
    metadata: { transactionId: id },
  };
}

export async function appendCanonicalWalletCreditIfEligible(
  transaction: Record<string, unknown>,
  c: Context,
): Promise<void> {
  const ev = buildCanonicalWalletCreditEvent(transaction);
  if (!ev) return;
  try {
    await appendCanonicalLedgerEvents([ev], c);
  } catch (e) {
    console.error("[CanonicalOps] wallet_credit append failed:", e);
  }
}

// ─── Fuel Reimbursement Credit ──────────────────────────────────────────────

export function buildCanonicalFuelReimbursementEvent(
  walletCredit: Record<string, unknown>,
): Record<string, unknown> | null {
  const id = String(walletCredit.id ?? "").trim();
  const driverId = String(walletCredit.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const rawDate =
    typeof walletCredit.date === "string"
      ? walletCredit.date.trim()
      : typeof walletCredit.createdAt === "string"
      ? walletCredit.createdAt.trim()
      : "";
  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const amt = Math.abs(coerceAmount(walletCredit.amount));
  if (amt <= 1e-9) return null;

  return {
    idempotencyKey: `transaction:${id}|fuel_reimbursement`,
    date,
    driverId,
    eventType: "fuel_reimbursement",
    direction: "inflow",
    netAmount: amt,
    grossAmount: amt,
    currency: "JMD",
    sourceType: "transaction",
    sourceId: id,
    platform: "Roam",
    description:
      typeof walletCredit.description === "string" && walletCredit.description.trim()
        ? walletCredit.description.trim()
        : "Fuel Reimbursement",
    metadata: { transactionId: id },
  };
}

export async function appendCanonicalFuelReimbursementIfEligible(
  walletCredit: Record<string, unknown>,
  c: Context,
): Promise<void> {
  const ev = buildCanonicalFuelReimbursementEvent(walletCredit);
  if (!ev) return;
  try {
    await appendCanonicalLedgerEvents([ev], c);
  } catch (e) {
    console.error("[CanonicalOps] fuel_reimbursement append failed:", e);
  }
}

// ─── Toll Reimbursement Credit ──────────────────────────────────────────────

export function buildCanonicalTollReimbursementEvent(
  walletCredit: Record<string, unknown>,
): Record<string, unknown> | null {
  const id = String(walletCredit.id ?? "").trim();
  const driverId = String(walletCredit.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const rawDate =
    typeof walletCredit.date === "string"
      ? walletCredit.date.trim()
      : typeof walletCredit.createdAt === "string"
      ? walletCredit.createdAt.trim()
      : "";
  const date = rawDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const amt = Math.abs(coerceAmount(walletCredit.amount));
  if (amt <= 1e-9) return null;

  return {
    idempotencyKey: `transaction:${id}|toll_reimbursement`,
    date,
    driverId,
    eventType: "adjustment",
    direction: "inflow",
    netAmount: amt,
    grossAmount: amt,
    currency: "JMD",
    sourceType: "adjustment",
    sourceId: id,
    platform: "Roam",
    description:
      typeof walletCredit.description === "string" && walletCredit.description.trim()
        ? walletCredit.description.trim()
        : "Toll Reimbursement",
    metadata: { transactionId: id, adjustmentType: "toll_reimbursement" },
  };
}

export async function appendCanonicalTollReimbursementIfEligible(
  walletCredit: Record<string, unknown>,
  c: Context,
): Promise<void> {
  const ev = buildCanonicalTollReimbursementEvent(walletCredit);
  if (!ev) return;
  try {
    await appendCanonicalLedgerEvents([ev], c);
  } catch (e) {
    console.error("[CanonicalOps] toll_reimbursement append failed:", e);
  }
}

// ─── Toll Reconciled (bulk-reconcile audit) ─────────────────────────────────

export interface TollReconcileAuditEntry {
  id: string;
  date: string;
  driverId: string;
  amount: number;
  description?: string;
  vehicleId?: string;
  tollLedgerId?: string;
}

export function buildCanonicalTollReconciledEvent(
  entry: TollReconcileAuditEntry,
): Record<string, unknown> | null {
  const id = String(entry.id ?? "").trim();
  const driverId = String(entry.driverId ?? "").trim();
  if (!id || !driverId) return null;

  const date = String(entry.date ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const amt = Math.abs(Number(entry.amount) || 0);

  return {
    idempotencyKey: `toll_reconcile:${id}|toll_reconciled`,
    date,
    driverId,
    eventType: "toll_reconciled",
    direction: "neutral",
    netAmount: amt,
    grossAmount: amt,
    currency: "JMD",
    sourceType: "adjustment",
    sourceId: id,
    vehicleId: entry.vehicleId || undefined,
    platform: "Roam",
    description: entry.description?.trim() || "Toll reconciled",
    metadata: { tollReconcileId: id, tollLedgerId: entry.tollLedgerId },
  };
}

export async function appendCanonicalTollReconciledBatch(
  entries: TollReconcileAuditEntry[],
  c: Context,
): Promise<void> {
  const batch: Record<string, unknown>[] = [];
  for (const entry of entries) {
    const ev = buildCanonicalTollReconciledEvent(entry);
    if (ev) batch.push(ev);
  }
  if (batch.length === 0) return;
  const CHUNK = 200;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const chunk = batch.slice(i, i + CHUNK);
    try {
      await appendCanonicalLedgerEvents(chunk, c);
    } catch (e) {
      console.error("[CanonicalOps] toll_reconciled batch append failed:", e);
    }
  }
}
