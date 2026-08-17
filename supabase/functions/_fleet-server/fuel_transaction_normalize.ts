/**
 * Admin manual cash fuel must book as Expense (negative) — parity with driver portal.
 * Fuel_Manual_Entry + positive amount is credit-only and breaks ledger health.
 */
import * as kv from "./kv_store.tsx";
import { queryFleet } from "./repos/baseRepo.ts";
import { isCashStyleFuelPaymentSource } from "./fuel_payment_source.ts";

function txMetadata(tx: Record<string, unknown>): Record<string, unknown> {
  const m = tx.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

function isAdminManualCashFuelTx(tx: Record<string, unknown>): boolean {
  const cat = tx.category;
  if (cat !== "Fuel" && cat !== "Fuel Reimbursement") return false;

  const m = txMetadata(tx);
  const payRaw = m.paymentSource ?? tx.paymentSource ?? tx.paymentMethod;
  if (!isCashStyleFuelPaymentSource(payRaw as string | null | undefined)) return false;

  const entrySrc = m.entrySource ?? tx.entrySource;
  const src = m.source;
  const type = String(tx.type || "");

  return (
    entrySrc === "admin-manual" ||
    entrySrc === "bulk-import" ||
    src === "Manual" ||
    src === "Bulk Manual" ||
    src === "Bulk Log" ||
    type === "Fuel_Manual_Entry"
  );
}

/** Mutates tx in place. Returns true when normalized. */
export function normalizeAdminCashFuelTransaction(tx: Record<string, unknown>): boolean {
  if (!isAdminManualCashFuelTx(tx)) return false;

  const m = txMetadata(tx);
  const type = String(tx.type || "");
  const amount = Number(tx.amount) || Number(m.totalCost) || 0;
  if (!Number.isFinite(amount) || amount === 0) return false;

  if (type === "Expense" && amount < 0) return false;

  const abs = Math.abs(amount);
  tx.type = "Expense";
  tx.amount = -abs;
  tx.metadata = {
    ...m,
    portal_type: m.portal_type || "Manual_Entry",
    isManual: m.isManual ?? true,
    totalCost: abs,
    ledgerDebitNormalizedAt: new Date().toISOString(),
    priorLedgerType: m.priorLedgerType || type,
  };
  return true;
}

/** One-time heal: flip legacy positive Fuel_Manual_Entry cash rows to Expense debits. */
export async function healAdminCashFuelLedgerDebits(
  limit = 100,
  stamp?: (record: Record<string, unknown>) => Record<string, unknown>,
): Promise<{ healed: number; scanned: number }> {
  const res = await queryFleet("transactions", {
    eq: { type: "Fuel_Manual_Entry" },
    filters: [{ op: "in", col: "category", value: ["Fuel", "Fuel Reimbursement"] }],
    order: { col: "date", ascending: false },
    limit: Math.min(limit * 3, 300),
  });
  if (res.error) throw res.error;

  let healed = 0;
  let scanned = 0;

  for (const row of res.data) {
    if (healed >= limit) break;
    const tx = row as Record<string, unknown>;
    if (!tx?.id) continue;

    const amount = Number(tx.amount) || 0;
    if (amount <= 0) continue;

    scanned++;
    if (!normalizeAdminCashFuelTransaction(tx)) continue;

    const toSave = stamp ? stamp(tx) : tx;
    await kv.set(`transaction:${tx.id}`, toSave);
    healed++;
    console.log(
      `[HealCashFuelDebit] ${tx.id} → Expense ${toSave.amount} (${tx.date})`,
    );
  }

  return { healed, scanned };
}
