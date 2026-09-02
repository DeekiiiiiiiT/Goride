/**
 * Enterprise fuel wallet settlement for period finalize jobs (C4).
 * Ports client settlementService commit/reverse onto KV transaction:* + fuel_entry:*.
 */
import * as kv from "./kv_store.tsx";
import { blendedDriverShareRatioFromReport } from "./fuel_blended_ratio.ts";
import {
  fuelPaymentSourceToMeta,
  isCashStyleFuelPaymentSource,
  normalizeFuelPaymentSourceEnum,
} from "./fuel_payment_source.ts";

const EPS = 0.02;

function ymd(v: unknown): string {
  return String(v || "").split("T")[0];
}

function enterpriseFuelSyncIdempotencyKey(
  reportId: string,
  entryId: string,
  kind: "credit" | "deduction",
): string {
  return `enterprise_fuel_sync:${reportId}:${entryId}:${kind}:v1`;
}

function isGasCardEntry(entry: Record<string, any>): boolean {
  const ps = entry.paymentSource;
  if (ps === "Gas_Card") return true;
  if (ps === "RideShare_Cash" || ps === "Personal" || ps === "Petty_Cash") return false;
  return entry.type === "Card_Transaction";
}

function countsInGasCardSpend(entry: Record<string, any>): boolean {
  if (!isGasCardEntry(entry)) return false;
  const meta = entry.metadata || {};
  if (meta.jaaRowKind === "fee" || meta.jaaRowKind === "declined") return false;
  if (meta.countsInFuelSpend === false) return false;
  if (meta.awaitingCardStatement) return false;
  return (Number(entry.amount) || 0) > 0;
}

async function listDriverTransactions(driverId: string): Promise<any[]> {
  const all = ((await kv.getByPrefix("transaction:")) || []) as any[];
  return all.filter((t) => t && String(t.driverId || "") === String(driverId));
}

/** Reverse Enterprise_Fuel_Sync wallet rows + reset Verified entries for this driver-week. */
export async function reverseEnterpriseFuelSyncForSnapshot(
  report: Record<string, any>,
): Promise<number> {
  const driverId = String(report.driverId || "").trim();
  if (!driverId) return 0;
  const weekKey = ymd(report.weekStart);
  const weekEnd = ymd(report.weekEnd) || weekKey;
  const reportId = String(report.id || `${driverId}_${weekKey}`);
  const reportIdCandidates = new Set<string>([
    reportId,
    `${driverId}_${weekKey}`,
    ...(report.vehicleId ? [`${String(report.vehicleId)}_${weekKey}`] : []),
  ]);

  const txs = await listDriverTransactions(driverId);
  const toDelete: string[] = [];
  for (const tx of txs) {
    if (!tx?.id) continue;
    const rid = tx.metadata?.reportId ? String(tx.metadata.reportId) : "";
    if (rid && reportIdCandidates.has(rid)) {
      toDelete.push(String(tx.id));
      continue;
    }
    if (tx.metadata?.settlementType === "Enterprise_Fuel_Sync") {
      const wp = ymd(tx.metadata?.workPeriodStart);
      if (wp === weekKey) toDelete.push(String(tx.id));
    }
  }

  for (const id of toDelete) {
    try {
      await kv.del(`transaction:fuel-credit-${id}`);
    } catch {
      /* ignore */
    }
    try {
      await kv.del(`transaction:${id}`);
    } catch {
      /* ignore */
    }
  }

  const entries = ((await kv.getByPrefix("fuel_entry:")) || []) as any[];
  for (const entry of entries) {
    if (!entry?.id) continue;
    const entryDate = ymd(entry.date);
    if (entryDate < weekKey || entryDate > weekEnd) continue;
    const fbr = entry.metadata?.finalizedByReport
      ? String(entry.metadata.finalizedByReport)
      : "";
    const match =
      (fbr && reportIdCandidates.has(fbr)) ||
      (entry.reconciliationStatus === "Verified" &&
        String(entry.driverId || "") === driverId);
    if (!match) continue;
    const meta = { ...(entry.metadata || {}) };
    delete meta.finalizedAt;
    delete meta.finalizedByReport;
    delete meta.splitApplied;
    const updated = {
      ...entry,
      reconciliationStatus: "Pending",
      metadata: meta,
    };
    delete (updated as { transactionId?: string }).transactionId;
    await kv.set(`fuel_entry:${entry.id}`, updated);
  }

  return toDelete.length;
}

/**
 * Post wallet credit/deduction txs for settled fill stubs, mark entries Verified,
 * then sync P&L offsets (parity with POST /finalized-reports).
 */
export async function settleEnterpriseFuelFromSnapshot(
  report: Record<string, any>,
  orgId: string,
): Promise<{ posted: number }> {
  const driverId = String(report.driverId || "").trim();
  const weekKey = ymd(report.weekStart);
  const reportId = String(report.id || `${driverId}_${weekKey}`);
  if (!driverId || !weekKey) throw new Error("snapshot missing driverId/weekStart");

  const stubs = Array.isArray(report?.metadata?.settledEntries)
    ? (report.metadata.settledEntries as Array<Record<string, unknown>>)
    : [];
  if (stubs.length === 0) return { posted: 0 };

  const ratio = blendedDriverShareRatioFromReport(report);
  const existing = await listDriverTransactions(driverId);
  const byKey = new Map<string, any>();
  for (const tx of existing) {
    const k = tx?.metadata?.idempotencyKey ? String(tx.metadata.idempotencyKey) : "";
    if (k) byKey.set(k, tx);
  }

  let posted = 0;

  for (const stub of stubs) {
    const entryId = String(stub.id || "");
    if (!entryId) continue;
    const live = ((await kv.get(`fuel_entry:${entryId}`)) || stub) as Record<string, any>;
    const amount = Number(live.amount ?? stub.amount) || 0;
    if (amount <= 0) continue;

    const paymentSource = normalizeFuelPaymentSourceEnum(
      live.paymentSource || live.metadata?.paymentSource || stub.paymentSource,
    );
    const entryForSettle = { ...live, paymentSource, amount, id: entryId };
    const driverAmount = amount * ratio;
    const split = { company: amount - driverAmount, driver: driverAmount };

    let walletPayment: Record<string, any> | null = null;
    let payoutDeduction: Record<string, any> | null = null;

    if (isGasCardEntry(entryForSettle)) {
      if (!countsInGasCardSpend(entryForSettle)) continue;
      if (split.driver > EPS) {
        payoutDeduction = {
          type: "Expense",
          category: "Fuel Deduction",
          description: `Fuel Deduction: Driver Share of ${live.location || "Fuel"}`,
          amount: -Math.abs(split.driver),
          paymentMethod: "Cash",
        };
      }
    } else if (isCashStyleFuelPaymentSource(paymentSource)) {
      walletPayment = {
        type: "Payment_Received",
        category: "Fuel Reimbursement",
        description: `Fuel Credit: Spent cash on ${live.location || "Fuel"}`,
        amount: Math.abs(amount),
        paymentMethod: "Cash",
        metadata: { isFuelCredit: true },
      };
      if (split.driver > EPS) {
        payoutDeduction = {
          type: "Expense",
          category: "Fuel Deduction",
          description: `Fuel Deduction: Driver Share of ${live.location || "Fuel"}`,
          amount: -Math.abs(split.driver),
          paymentMethod: "Cash",
        };
      }
    } else {
      continue;
    }

    const writeTx = async (
      partial: Record<string, any>,
      kind: "credit" | "deduction",
    ) => {
      const idempotencyKey = enterpriseFuelSyncIdempotencyKey(reportId, entryId, kind);
      const existingTx = byKey.get(idempotencyKey);
      if (existingTx) return existingTx;
      const id = crypto.randomUUID();
      const full = {
        ...partial,
        id,
        date: ymd(live.date || stub.date) || weekKey,
        time: live.time || null,
        driverId: String(live.driverId || stub.driverId || driverId),
        vehicleId: live.vehicleId || stub.vehicleId || report.vehicleId || null,
        status: "Approved",
        isReconciled: true,
        orgId,
        org_id: orgId,
        metadata: {
          ...(partial.metadata || {}),
          sourceId: entryId,
          settlementType: "Enterprise_Fuel_Sync",
          totalCost: amount,
          companyShare: split.company,
          driverShare: split.driver,
          reportId,
          workPeriodStart: weekKey,
          workPeriodEnd: ymd(report.weekEnd) || weekKey,
          idempotencyKey,
        },
      };
      await kv.set(`transaction:${id}`, full);
      byKey.set(idempotencyKey, full);
      posted += 1;
      return full;
    };

    let savedTxId: string | undefined;
    if (walletPayment) {
      const saved = await writeTx(walletPayment, "credit");
      savedTxId = saved.id;
    }
    if (payoutDeduction) {
      await writeTx(payoutDeduction, "deduction");
    }

    const updatedEntry = {
      ...live,
      paymentSource,
      reconciliationStatus: "Verified",
      transactionId: savedTxId || live.transactionId,
      orgId: live.orgId || orgId,
      org_id: live.org_id || orgId,
      metadata: {
        ...(live.metadata || {}),
        paymentSource: fuelPaymentSourceToMeta(paymentSource),
        finalizedAt: new Date().toISOString(),
        finalizedByReport: reportId,
        splitApplied: split,
      },
    };
    await kv.set(`fuel_entry:${entryId}`, updatedEntry);
  }

  return { posted };
}
