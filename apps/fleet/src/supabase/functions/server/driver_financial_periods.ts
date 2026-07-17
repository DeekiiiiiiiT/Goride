/**
 * Shared weekly driver financial period projection.
 * One rebuild path feeds Expenses / Settlement / Payout / Reconciliation.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { format, addDays } from "npm:date-fns";
import * as kv from "./kv_store.tsx";
import { getFleetTimezone } from "./timezone_helper.tsx";
import {
  loadAllTollLedgerWithTrips,
  isReconcilableTollExpense,
  filterByDriver,
  loadDisputeRefundRecords,
  loadAllByPrefix,
} from "./toll_controller.tsx";
import { periodAnchorFor, periodEndForAnchor, minorToMajor } from "./financial_ledger.ts";
import {
  resolveActiveEarningsBundleForDriverWeek,
} from "./earnings_policy_runtime.ts";
import { computePeriodSettlement } from "./driver_period_settlement.ts";
import {
  computeWeekCommissionShare,
  computeWeekCashBase,
} from "./period_share_cash.ts";

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isTerminalStage(stage: string | null | undefined): boolean {
  return [
    "matched",
    "claim_filed",
    "claim_resolved",
    "personal_use_resolved",
    "deadhead_resolved",
  ].includes(String(stage || ""));
}

function isHandledToll(tx: any): boolean {
  if (isTerminalStage(tx?.workflowStage)) return true;
  const status = String(tx?.status || "").toLowerCase();
  return !!(
    tx?.isReconciled ||
    status === "reconciled" ||
    status === "resolved" ||
    status === "approved" ||
    status === "rejected" ||
    tx?.resolution ||
    tx?.tripId
  );
}

function isCashPaid(tx: any): boolean {
  const pm = String(tx?.paymentMethod || "").toLowerCase();
  return pm.includes("cash") || !!tx?.receiptUrl;
}

function isTopUpLike(tx: any): boolean {
  const type = String(tx?.type || "").toLowerCase().replace("-", "_");
  const cat = String(tx?.category || "").toLowerCase();
  return (
    type === "top_up" ||
    type === "refund" ||
    type === "adjustment" ||
    type === "balance_transfer" ||
    cat === "toll top-up" ||
    cat === "toll refund"
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type DriverFinancialPeriodRow = {
  id?: string;
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  timezone: string;
  status: "open" | "closed" | "reopened";
  tollSpend: number;
  tollCashSpend: number;
  tollTagSpend: number;
  tollReimbursed: number;
  tollChargedToDriver: number;
  tollUnmatchedCount: number;
  tollReconciledCount: number;
  tollWorkflowActionable: number;
  disputeRefundMatched: number;
  disputeRefundUnmatched: number;
  fuelDriverSpend: number;
  fuelGasCardSpend: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  fuelNetPay: number;
  fuelFinalized: boolean;
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  tripCount: number;
  tierId: string | null;
  tierName: string | null;
  cashCollected: number;
  cashReturned: number;
  cashStillHeld: number;
  settlementAmount: number;
  payoutNet: number;
  settlementStatus: string;
  payoutStatus: string;
  tollStatus: string;
  sourceEventHash: string;
  projectionVersion: number;
  projectedAt: string;
  lines: Array<{
    lineType: string;
    domain: string;
    sourceSystem?: string;
    sourceId?: string;
    financialEventId?: string;
    description?: string;
    amount: number;
    occurredAt?: string;
    metadata?: Record<string, unknown>;
  }>;
};

type RebuildContext = {
  timezone: string;
  scopedTolls: any[];
  scopedTrips: any[];
  chargeTxAll: any[];
  driverTxAll: any[];
  disputes: any[];
  fuelReports: any[];
  claims: any[];
  fareEntries: any[];
  tipEntries: any[];
  payoutCashByAnchor: Map<string, number>;
  earningsPolicies: any[];
  legacyEarnings: {
    tiers: any[];
    quotas: any;
    personalAllowance: any;
  };
  persistLines?: boolean;
};

const DEFAULT_TIERS_EH = [
  { id: "tier_1", name: "Bronze", minEarnings: 0, maxEarnings: 75000, sharePercentage: 25, color: "#CD7F32" },
  { id: "tier_2", name: "Silver", minEarnings: 75000, maxEarnings: 150000, sharePercentage: 27, color: "#C0C0C0" },
  { id: "tier_3", name: "Gold", minEarnings: 150000, maxEarnings: null, sharePercentage: 30, color: "#FFD700" },
];

async function resolveDriverAliasIds(driverId: string): Promise<string[]> {
  const ids = new Set<string>([String(driverId).trim()]);
  try {
    const dr: any = await kv.get(`driver:${driverId}`);
    if (dr?.uberDriverId) ids.add(String(dr.uberDriverId).trim());
    if (dr?.inDriveDriverId) ids.add(String(dr.inDriveDriverId).trim());
  } catch {
    /* ignore */
  }
  return Array.from(ids);
}

/** Paginate ledger_event:* for driver alias IDs (fare/tip/payout_cash). */
async function loadLedgerEventsForDriverIds(driverIds: string[]): Promise<any[]> {
  if (!driverIds.length) return [];
  const PAGE = 1000;
  const MAX_ROWS = 40000;
  const all: any[] = [];
  let offset = 0;
  const orFilter =
    driverIds.length === 1 ? null : driverIds.map((id) => `value->>driverId.eq.${id}`).join(",");
  while (offset < MAX_ROWS) {
    let q = sb().from("kv_store_37f42386").select("value").like("key", "ledger_event:%");
    if (orFilter) q = q.or(orFilter);
    else q = q.eq("value->>driverId", driverIds[0]);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) {
      console.error("[DriverFinancialPeriods] ledger_event load:", error.message);
      break;
    }
    const page = data || [];
    all.push(...page.map((d: any) => d.value).filter(Boolean));
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function loadRebuildContext(driverId: string): Promise<RebuildContext> {
  const timezone = await getFleetTimezone();
  const driverIds = await resolveDriverAliasIds(driverId);
  const idSet = new Set(driverIds.map(String));

  const [
    { tollTx, trips },
    disputesAll,
    allTx,
    fuelAll,
    claimsAll,
    ledgerEvents,
    prefsEH,
    policyItemsRaw,
  ] = await Promise.all([
    loadAllTollLedgerWithTrips(),
    loadDisputeRefundRecords(),
    kv.getByPrefix("transaction:"),
    loadAllByPrefix("finalized_report:"),
    loadAllByPrefix("claim:"),
    loadLedgerEventsForDriverIds(driverIds),
    kv.get("preferences:general"),
    kv.getByPrefix("earnings_policy:"),
  ]);

  const scopedTolls = filterByDriver(tollTx, driverId).filter(
    (tx: any) => isReconcilableTollExpense(tx) && !isTopUpLike(tx),
  );
  const scopedTrips = filterByDriver(trips, driverId);
  const driverTxAll = (allTx || []).filter(
    (t: any) => t && idSet.has(String(t.driverId)),
  );
  const chargeTxAll = driverTxAll.filter(
    (t: any) => String(t.category || "") === "Toll Charge",
  );
  const disputes = filterByDriver(disputesAll, driverId);
  const fuelReports = (fuelAll || []).filter(
    (r: any) => r?.status === "Finalized" && String(r.driverId) === String(driverId),
  );
  const claims = (claimsAll || []).filter(
    (cl: any) => cl && String(cl.driverId) === String(driverId),
  );

  const fareEntries = (ledgerEvents || []).filter(
    (e: any) => e && String(e.eventType || "") === "fare_earning",
  );
  const tipEntries = (ledgerEvents || []).filter(
    (e: any) => e && String(e.eventType || "") === "tip",
  );

  const payoutCashByAnchor = new Map<string, number>();
  for (const e of ledgerEvents || []) {
    if (!e || String(e.eventType || "") !== "payout_cash") continue;
    const d = String(e.date || "").slice(0, 10);
    if (!d) continue;
    const anchor = await periodAnchorFor(d, timezone);
    const amt = Math.abs(Number(e.netAmount) || Number(e.grossAmount) || 0);
    payoutCashByAnchor.set(anchor, round2((payoutCashByAnchor.get(anchor) || 0) + amt));
  }

  const prefs: any = prefsEH || {};
  const earningsPolicies = (Array.isArray(policyItemsRaw) ? policyItemsRaw : []).filter(
    (p: any) => p && typeof p === "object" && p.id,
  );
  const legacyEarnings = {
    tiers: prefs.tiers?.length ? prefs.tiers : DEFAULT_TIERS_EH,
    quotas: prefs.quotas || null,
    personalAllowance: prefs.personalAllowance || null,
  };

  return {
    timezone,
    scopedTolls,
    scopedTrips,
    chargeTxAll,
    driverTxAll,
    disputes,
    fuelReports,
    claims,
    fareEntries,
    tipEntries,
    payoutCashByAnchor,
    earningsPolicies,
    legacyEarnings,
    persistLines: false,
  };
}

/**
 * Rebuild one driver-week projection from operational SSOT + financial_events.
 * Always reopens if unmatched toll usage remains.
 */
export async function rebuildDriverFinancialPeriod(
  driverId: string,
  periodAnchor: string,
  ctx?: RebuildContext,
): Promise<DriverFinancialPeriodRow> {
  const context = ctx || { ...(await loadRebuildContext(driverId)), persistLines: true };
  const timezone = context.timezone;
  const periodEnd = periodEndForAnchor(periodAnchor);
  const persistLines = !!context.persistLines;
  const scopedTolls = context.scopedTolls;
  const weekTolls = scopedTolls.filter((tx: any) => {
    const d = String(tx.date || "").slice(0, 10);
    return d >= periodAnchor && d <= periodEnd;
  });

  const lines: DriverFinancialPeriodRow["lines"] = [];
  let tollSpend = 0;
  let tollCashSpend = 0;
  let tollTagSpend = 0;
  let tollReconciledCount = 0;
  let tollUnmatchedCount = 0;
  let tollWorkflowActionable = 0;

  for (const tx of weekTolls) {
    const amt = Math.abs(Number(tx.amount) || 0);
    tollSpend += amt;
    if (isCashPaid(tx)) tollCashSpend += amt;
    else tollTagSpend += amt;
    const handled = isHandledToll(tx);
    if (handled) tollReconciledCount++;
    else {
      tollUnmatchedCount++;
      tollWorkflowActionable++;
    }
    if (persistLines) {
      lines.push({
        lineType: handled ? "toll_handled" : "toll_unmatched",
        domain: "toll",
        sourceSystem: "toll_ledger",
        sourceId: String(tx.id),
        description: tx.description || tx.vendor || "Toll usage",
        amount: -amt,
        occurredAt: tx.date,
        metadata: {
          workflowStage: tx.workflowStage,
          isReconciled: !!tx.isReconciled,
          resolution: tx.resolution,
          tripId: tx.tripId,
          paymentMethod: tx.paymentMethod,
        },
      });
    }
  }

  const chargeTx = context.chargeTxAll.filter((t: any) => {
    const d = String(t.date || "").slice(0, 10);
    return d >= periodAnchor && d <= periodEnd;
  });
  let tollChargedToDriver = 0;
  for (const t of chargeTx) {
    const amt = Number(t.amount) || 0;
    tollChargedToDriver = round2(tollChargedToDriver + (-amt)); // negative charge increases owed
    if (persistLines) {
      lines.push({
        lineType: amt < 0 ? "driver_charge" : "driver_charge_reversal",
        domain: "toll",
        sourceSystem: "transaction",
        sourceId: String(t.id),
        description: t.description || "Toll Charge",
        amount: amt,
        occurredAt: t.date,
      });
    }
  }

  let disputeRefundMatched = 0;
  let disputeRefundUnmatched = 0;
  for (const r of context.disputes) {
    const d = String(r.date || r.matchedAt || "").slice(0, 10);
    let weekDate = d;
    if (r.matchedTollId) {
      const toll =
        weekTolls.find((t: any) => String(t.id) === String(r.matchedTollId)) ||
        scopedTolls.find((t: any) => String(t.id) === String(r.matchedTollId));
      if (toll?.date) weekDate = String(toll.date).slice(0, 10);
    }
    if (!(weekDate >= periodAnchor && weekDate <= periodEnd)) continue;
    const amt = Math.abs(Number(r.amount) || 0);
    const matched = r.status === "matched" || r.status === "auto_resolved";
    if (matched) disputeRefundMatched += amt;
    else {
      disputeRefundUnmatched += amt;
      tollWorkflowActionable++;
    }
    if (persistLines) {
      lines.push({
        lineType: matched ? "dispute_matched" : "dispute_unmatched",
        domain: "toll",
        sourceSystem: "dispute_refund",
        sourceId: String(r.id),
        description: `Dispute refund ${r.supportCaseId || ""}`.trim(),
        amount: amt,
        occurredAt: weekDate,
      });
    }
  }

  // Open claims keep the week actionable even when every toll row is "handled"
  // (claim_filed is terminal per-toll, but the claim itself may still be Open).
  let tollOpenClaimCount = 0;
  for (const cl of context.claims) {
    if (String(cl?.status || "") !== "Open") continue;
    const tollId = String(cl.transactionId || "");
    const toll = tollId ? scopedTolls.find((t: any) => String(t.id) === tollId) : null;
    const d = toll?.date
      ? String(toll.date).slice(0, 10)
      : String(cl.date || cl.createdAt || "").slice(0, 10);
    if (d >= periodAnchor && d <= periodEnd) {
      tollOpenClaimCount++;
      tollWorkflowActionable++;
      if (persistLines) {
        lines.push({
          lineType: "claim_open",
          domain: "toll",
          sourceSystem: "claim",
          sourceId: String(cl.id),
          description: `Open claim${toll ? ` on toll ${tollId}` : ""}`,
          amount: -(Math.abs(Number(cl.amount) || 0)),
          occurredAt: d,
        });
      }
    }
  }

  const { data: finEvents } = await sb()
    .from("financial_events")
    .select("id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload")
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor);

  let tollReimbursed = 0;
  let fuelDeduction = 0;
  let fuelFleetShare = 0;
  let fuelDriverSpend = 0;
  let fuelGasCardSpend = 0;
  let fuelFinalized = false;

  for (const ev of finEvents || []) {
    const major = minorToMajor(Number(ev.amount_minor) || 0);
    const et = String(ev.event_type || "");
    if (et === "toll_reimbursed" || et === "trip_refund" || et === "unlinked_trip" || et === "dispute_refund") {
      tollReimbursed = round2(tollReimbursed + Math.abs(major));
    }
    if (et === "fuel_deduction") {
      fuelDeduction = round2(fuelDeduction + Math.abs(major));
      fuelFinalized = true;
    }
    if (et === "fuel_fleet_share") fuelFleetShare = round2(fuelFleetShare + Math.abs(major));
    if (et === "fuel_driver_spend") fuelDriverSpend = round2(fuelDriverSpend + Math.abs(major));
    if (et === "fuel_gas_card_spend") fuelGasCardSpend = round2(fuelGasCardSpend + Math.abs(major));
    if (et === "fuel_finalized") fuelFinalized = true;
  }

  // Fallback: finalized fuel reports when no fuel events yet
  if (!fuelFinalized) {
    for (const r of context.fuelReports) {
      const start = String(r.periodStart || r.startDate || "").slice(0, 10);
      if (!(start >= periodAnchor && start <= periodEnd)) continue;
      fuelDeduction = round2(fuelDeduction + Math.abs(Number(r.driverShare) || 0));
      fuelFleetShare = round2(fuelFleetShare + Math.abs(Number(r.companyShare) || 0));
      fuelDriverSpend = round2(fuelDriverSpend + Math.abs(Number(r.driverCashSpend) || Number(r.cashSpend) || 0));
      fuelGasCardSpend = round2(fuelGasCardSpend + Math.abs(Number(r.gasCardSpend) || 0));
      fuelFinalized = true;
    }
  }

  // Commission Driver Share — same tier math as /ledger/driver-earnings-history
  const bundleEH = resolveActiveEarningsBundleForDriverWeek({
    policies: context.earningsPolicies || [],
    driverId,
    weekStartYmd: periodAnchor,
    legacy: context.legacyEarnings,
  });
  const share = computeWeekCommissionShare({
    fareEntries: context.fareEntries || [],
    tipEntries: context.tipEntries || [],
    periodAnchor,
    periodEnd,
    tiers: bundleEH.tiers || context.legacyEarnings.tiers,
  });
  let earningsGross = share.earningsGross;
  let driverShare = share.driverShare;
  let fleetShare = share.fleetShare;
  let driverSharePercent = share.driverSharePercent;
  let tripCount = share.tripCount;
  let tierId: string | null = share.tierId;
  let tierName: string | null = share.tierName;

  // Trip fallback when no ledger fare_earning rows yet
  if (earningsGross < 0.005 && tripCount === 0) {
    let tripGross = 0;
    let nTrips = 0;
    for (const t of context.scopedTrips) {
      const d = String(t.date || "").slice(0, 10);
      if (!(d >= periodAnchor && d <= periodEnd)) continue;
      const status = String(t.status || "").toLowerCase();
      if (status.includes("cancel")) continue;
      tripGross += Math.abs(Number(t.amount) || 0);
      nTrips++;
    }
    if (tripGross > 0.005) {
      earningsGross = round2(tripGross);
      tripCount = nTrips;
      const tier = (bundleEH.tiers || context.legacyEarnings.tiers || [])[0];
      const pct = Number(tier?.sharePercentage) || 25;
      driverSharePercent = pct;
      driverShare = round2(tripGross * (pct / 100));
      fleetShare = round2(tripGross - driverShare);
      tierId = String(tier?.id || "tier_fallback");
      tierName = String(tier?.name || "Default");
    }
  }

  // Settlement cash base — passenger cash + Settlement-Week Log Cash
  const cashBase = computeWeekCashBase({
    periodAnchor,
    periodEnd,
    trips: context.scopedTrips || [],
    transactions: context.driverTxAll || [],
    uberPayoutCash: context.payoutCashByAnchor?.get(periodAnchor) || 0,
  });
  const cashCollected = cashBase.passengerCash;
  const cashReturned = cashBase.cashReturned;

  const fuelNetPay = round2(fuelDriverSpend - fuelDeduction);
  const settled = computePeriodSettlement({
    driverShare,
    fuelDeduction,
    baseCashOwed: cashCollected,
    baseCashPaid: cashReturned,
    tollCashWash: tollCashSpend,
    tollPersonal: Math.max(0, tollChargedToDriver),
    fuelCredits: fuelFleetShare,
  });
  const cashStillHeld = settled.adjCashBalance;
  const payoutNet = settled.netPayout;
  const settlementAmount = settled.settlement;

  const tollStatus =
    weekTolls.length === 0
      ? "n/a"
      : tollUnmatchedCount > 0
        ? "unmatched"
        : tollWorkflowActionable > 0
          ? "in_progress" // rows handled but open claims / unmatched disputes remain
          : "reconciled";

  let settlementStatus = "pending";
  if (fuelFinalized) {
    if (Math.abs(settlementAmount) < 1) settlementStatus = "settled";
    else if (settlementAmount > 0) settlementStatus = "company_owes";
    else settlementStatus = "driver_owes";
  }

  let payoutStatus = "pending";
  if (fuelFinalized) {
    payoutStatus = cashStillHeld > 0.5 ? "awaiting_cash" : "finalized";
  }

  const periodStatus: "open" | "closed" | "reopened" =
    tollWorkflowActionable > 0 || tollUnmatchedCount > 0
      ? "open"
      : fuelFinalized && (tollStatus === "reconciled" || tollStatus === "n/a")
        ? "closed"
        : "open";

  const hashPayload = JSON.stringify({
    tollSpend,
    tollUnmatchedCount,
    tollChargedToDriver,
    fuelDeduction,
    fuelFinalized,
    disputeRefundUnmatched,
    driverShare,
    cashCollected,
    cashReturned,
    lineCount: lines.length,
  });
  const sourceEventHash = await sha256Hex(hashPayload);

  const row: DriverFinancialPeriodRow = {
    driverId,
    periodAnchor,
    periodEnd,
    timezone,
    status: periodStatus,
    tollSpend: round2(tollSpend),
    tollCashSpend: round2(tollCashSpend),
    tollTagSpend: round2(tollTagSpend),
    tollReimbursed: round2(tollReimbursed),
    tollChargedToDriver: round2(Math.max(0, tollChargedToDriver)),
    tollUnmatchedCount,
    tollReconciledCount,
    tollWorkflowActionable,
    disputeRefundMatched: round2(disputeRefundMatched),
    disputeRefundUnmatched: round2(disputeRefundUnmatched),
    fuelDriverSpend: round2(fuelDriverSpend),
    fuelGasCardSpend: round2(fuelGasCardSpend),
    fuelDeduction: round2(fuelDeduction),
    fuelFleetShare: round2(fuelFleetShare),
    fuelNetPay,
    fuelFinalized,
    earningsGross: round2(earningsGross),
    driverShare: round2(driverShare),
    fleetShare: round2(fleetShare),
    driverSharePercent,
    tripCount,
    tierId,
    tierName,
    cashCollected: round2(cashCollected),
    cashReturned: round2(cashReturned),
    cashStillHeld: round2(cashStillHeld),
    settlementAmount: round2(settlementAmount),
    payoutNet: round2(payoutNet),
    settlementStatus,
    payoutStatus,
    tollStatus,
    sourceEventHash,
    projectionVersion: 1,
    projectedAt: new Date().toISOString(),
    lines,
  };

  // Keep weeks with settlement activity (earnings/cash/fuel/tolls); drop empty phantoms.
  const hasSettlementActivity =
    weekTolls.length > 0 ||
    chargeTx.length > 0 ||
    fuelFinalized ||
    disputeRefundMatched > 0 ||
    disputeRefundUnmatched > 0 ||
    driverShare > 0.005 ||
    cashCollected > 0.005 ||
    cashReturned > 0.005 ||
    tripCount > 0;
  if (!hasSettlementActivity) {
    const { data: phantom } = await sb()
      .from("driver_financial_periods")
      .select("id")
      .eq("driver_id", driverId)
      .eq("period_anchor", periodAnchor)
      .maybeSingle();
    if (phantom?.id) {
      await sb().from("driver_financial_period_lines").delete().eq("period_id", phantom.id);
      await sb().from("driver_financial_periods").delete().eq("id", phantom.id);
    }
    return row;
  }

  // Upsert projection
  const { data: existing } = await sb()
    .from("driver_financial_periods")
    .select("id, projection_version, status")
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor)
    .maybeSingle();

  const nextVersion = (existing?.projection_version || 0) + 1;
  const upsertBody: Record<string, unknown> = {
    driver_id: driverId,
    period_anchor: periodAnchor,
    period_end: periodEnd,
    timezone,
    status: periodStatus,
    toll_spend: row.tollSpend,
    toll_cash_spend: row.tollCashSpend,
    toll_tag_spend: row.tollTagSpend,
    toll_reimbursed: row.tollReimbursed,
    toll_charged_to_driver: row.tollChargedToDriver,
    toll_unmatched_count: row.tollUnmatchedCount,
    toll_reconciled_count: row.tollReconciledCount,
    toll_workflow_actionable: row.tollWorkflowActionable,
    dispute_refund_matched: row.disputeRefundMatched,
    dispute_refund_unmatched: row.disputeRefundUnmatched,
    fuel_driver_spend: row.fuelDriverSpend,
    fuel_gas_card_spend: row.fuelGasCardSpend,
    fuel_deduction: row.fuelDeduction,
    fuel_fleet_share: row.fuelFleetShare,
    fuel_net_pay: row.fuelNetPay,
    fuel_finalized: row.fuelFinalized,
    earnings_gross: row.earningsGross,
    driver_share: row.driverShare,
    fleet_share: row.fleetShare,
    driver_share_percent: row.driverSharePercent,
    trip_count: row.tripCount,
    tier_id: row.tierId,
    tier_name: row.tierName,
    cash_collected: row.cashCollected,
    cash_returned: row.cashReturned,
    cash_still_held: row.cashStillHeld,
    settlement_amount: row.settlementAmount,
    payout_net: row.payoutNet,
    settlement_status: row.settlementStatus,
    payout_status: row.payoutStatus,
    toll_status: row.tollStatus,
    source_event_hash: sourceEventHash,
    projection_version: nextVersion,
    projected_at: row.projectedAt,
    updated_at: row.projectedAt,
    reopened_at:
      existing?.status === "closed" && periodStatus !== "closed"
        ? row.projectedAt
        : null,
    closed_at: periodStatus === "closed" ? row.projectedAt : null,
  };

  const { data: saved, error } = await sb()
    .from("driver_financial_periods")
    .upsert(upsertBody, { onConflict: "driver_id,period_anchor" })
    .select("id")
    .single();

  if (error) {
    console.error("[DriverFinancialPeriods] upsert failed:", error.message, error.details || "");
    throw new Error(`driver_financial_periods upsert failed: ${error.message}`);
  }

  const periodId = saved?.id as string;
  row.id = periodId;
  row.projectionVersion = nextVersion;

  // Line drilldown only on single-period rebuild (bulk skips to stay under CPU limits).
  if (persistLines && periodId) {
    await sb().from("driver_financial_period_lines").delete().eq("period_id", periodId);
    if (lines.length > 0) {
      const lineRows = lines.map((l) => ({
        period_id: periodId,
        line_type: l.lineType,
        domain: l.domain,
        source_system: l.sourceSystem || null,
        source_id: l.sourceId || null,
        financial_event_id: l.financialEventId || null,
        description: l.description || null,
        amount: l.amount,
        currency: "JMD",
        occurred_at: l.occurredAt || null,
        metadata: l.metadata || {},
      }));
      for (let i = 0; i < lineRows.length; i += 100) {
        const { error: lineErr } = await sb()
          .from("driver_financial_period_lines")
          .insert(lineRows.slice(i, i + 100));
        if (lineErr) console.error("[DriverFinancialPeriods] lines insert:", lineErr.message);
      }
    }
  }

  return row;
}

/** Drain pending outbox jobs (period_projection_refresh) — one context load per driver. */
export async function processFinancialOutbox(limit = 50): Promise<{ processed: number; errors: string[] }> {
  const { data: jobs } = await sb()
    .from("financial_outbox")
    .select("*")
    .eq("status", "pending")
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(Math.min(limit, 40));

  let processed = 0;
  const errors: string[] = [];
  if (!jobs?.length) return { processed, errors };

  // Group by driver so we don't reload the full toll ledger per job.
  const byDriver = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const driverId = String(job.payload?.driver_id || "");
    if (!driverId) {
      await sb()
        .from("financial_outbox")
        .update({ status: "dead", last_error: "missing driver_id", processed_at: new Date().toISOString() })
        .eq("id", job.id);
      continue;
    }
    const list = byDriver.get(driverId) || [];
    list.push(job);
    byDriver.set(driverId, list);
  }

  for (const [driverId, driverJobs] of byDriver) {
    let ctx: RebuildContext | null = null;
    try {
      ctx = await loadRebuildContext(driverId);
    } catch (e: any) {
      const msg = e?.message || String(e);
      errors.push(`context ${driverId}: ${msg}`);
      for (const job of driverJobs) {
        const attempts = (job.attempts || 0) + 1;
        await sb()
          .from("financial_outbox")
          .update({
            status: attempts >= 8 ? "dead" : "pending",
            attempts,
            last_error: msg,
            available_at: new Date(Date.now() + Math.min(attempts, 6) * 30_000).toISOString(),
          })
          .eq("id", job.id);
      }
      continue;
    }

    const anchorsDone = new Set<string>();
    for (const job of driverJobs) {
      await sb()
        .from("financial_outbox")
        .update({ status: "processing", attempts: (job.attempts || 0) + 1 })
        .eq("id", job.id);
      try {
        const anchor = String(job.payload?.period_anchor || "");
        if (anchor && !anchorsDone.has(anchor)) {
          await rebuildDriverFinancialPeriod(driverId, anchor, ctx);
          anchorsDone.add(anchor);
        }
        await sb()
          .from("financial_outbox")
          .update({ status: "done", processed_at: new Date().toISOString(), last_error: null })
          .eq("id", job.id);
        processed++;
      } catch (e: any) {
        const msg = e?.message || String(e);
        errors.push(msg);
        const attempts = (job.attempts || 0) + 1;
        await sb()
          .from("financial_outbox")
          .update({
            status: attempts >= 8 ? "dead" : "pending",
            last_error: msg,
            available_at: new Date(Date.now() + Math.min(attempts, 6) * 30_000).toISOString(),
          })
          .eq("id", job.id);
      }
    }
  }
  return { processed, errors };
}

export async function listDriverFinancialPeriods(
  driverId: string,
): Promise<DriverFinancialPeriodRow[]> {
  const { data } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("driver_id", driverId)
    .order("period_anchor", { ascending: false });

  return (data || []).map(mapDbPeriod);
}

function mapDbPeriod(r: any): DriverFinancialPeriodRow {
  return {
    id: r.id,
    driverId: r.driver_id,
    periodAnchor: r.period_anchor,
    periodEnd: r.period_end,
    timezone: r.timezone,
    status: r.status,
    tollSpend: Number(r.toll_spend) || 0,
    tollCashSpend: Number(r.toll_cash_spend) || 0,
    tollTagSpend: Number(r.toll_tag_spend) || 0,
    tollReimbursed: Number(r.toll_reimbursed) || 0,
    tollChargedToDriver: Number(r.toll_charged_to_driver) || 0,
    tollUnmatchedCount: Number(r.toll_unmatched_count) || 0,
    tollReconciledCount: Number(r.toll_reconciled_count) || 0,
    tollWorkflowActionable: Number(r.toll_workflow_actionable) || 0,
    disputeRefundMatched: Number(r.dispute_refund_matched) || 0,
    disputeRefundUnmatched: Number(r.dispute_refund_unmatched) || 0,
    fuelDriverSpend: Number(r.fuel_driver_spend) || 0,
    fuelGasCardSpend: Number(r.fuel_gas_card_spend) || 0,
    fuelDeduction: Number(r.fuel_deduction) || 0,
    fuelFleetShare: Number(r.fuel_fleet_share) || 0,
    fuelNetPay: Number(r.fuel_net_pay) || 0,
    fuelFinalized: !!r.fuel_finalized,
    earningsGross: Number(r.earnings_gross) || 0,
    driverShare: Number(r.driver_share) || 0,
    fleetShare: Number(r.fleet_share) || 0,
    driverSharePercent: Number(r.driver_share_percent) || 0,
    tripCount: Number(r.trip_count) || 0,
    tierId: r.tier_id ?? null,
    tierName: r.tier_name ?? null,
    cashCollected: Number(r.cash_collected) || 0,
    cashReturned: Number(r.cash_returned) || 0,
    cashStillHeld: Number(r.cash_still_held) || 0,
    settlementAmount: Number(r.settlement_amount) || 0,
    payoutNet: Number(r.payout_net) || 0,
    settlementStatus: r.settlement_status,
    payoutStatus: r.payout_status,
    tollStatus: r.toll_status,
    sourceEventHash: r.source_event_hash,
    projectionVersion: r.projection_version,
    projectedAt: r.projected_at,
    lines: [],
  };
}

export async function getDriverFinancialPeriodDetail(
  driverId: string,
  periodAnchor: string,
): Promise<DriverFinancialPeriodRow | null> {
  const { data } = await sb()
    .from("driver_financial_periods")
    .select("*")
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor)
    .maybeSingle();
  if (!data) return null;
  const row = mapDbPeriod(data);
  const { data: lines } = await sb()
    .from("driver_financial_period_lines")
    .select("*")
    .eq("period_id", data.id)
    .order("occurred_at", { ascending: false });
  row.lines = (lines || []).map((l: any) => ({
    lineType: l.line_type,
    domain: l.domain,
    sourceSystem: l.source_system,
    sourceId: l.source_id,
    financialEventId: l.financial_event_id,
    description: l.description,
    amount: Number(l.amount) || 0,
    occurredAt: l.occurred_at,
    metadata: l.metadata,
  }));
  return row;
}

/** Discover period anchors for a driver (tolls, charges, fuel, earnings, cash). */
export async function rebuildAllPeriodsForDriver(driverId: string): Promise<number> {
  const ctx = await loadRebuildContext(driverId);
  const anchors = new Set<string>();
  for (const tx of ctx.scopedTolls) {
    if (!tx?.date) continue;
    anchors.add(await periodAnchorFor(tx.date, ctx.timezone));
  }
  for (const t of ctx.chargeTxAll) {
    if (!t?.date) continue;
    anchors.add(await periodAnchorFor(t.date, ctx.timezone));
  }
  for (const r of ctx.fuelReports) {
    const start = String(r.periodStart || r.startDate || "").slice(0, 10);
    if (start) anchors.add(await periodAnchorFor(start, ctx.timezone));
  }
  for (const e of ctx.fareEntries) {
    if (!e?.date) continue;
    anchors.add(await periodAnchorFor(e.date, ctx.timezone));
  }
  for (const e of ctx.tipEntries) {
    if (!e?.date) continue;
    anchors.add(await periodAnchorFor(e.date, ctx.timezone));
  }
  for (const anchor of ctx.payoutCashByAnchor.keys()) {
    anchors.add(anchor);
  }
  for (const t of ctx.driverTxAll) {
    const weekKey = t?.metadata?.workPeriodStart
      ? String(t.metadata.workPeriodStart).slice(0, 10)
      : null;
    if (weekKey && /^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
      anchors.add(weekKey);
    }
  }

  let n = 0;
  for (const anchor of [...anchors].sort()) {
    await rebuildDriverFinancialPeriod(driverId, anchor, ctx);
    n++;
  }
  return n;
}

/** Rebuild a small set of anchors with one shared context load (parity / repair). */
export async function rebuildPeriodsForAnchors(
  driverId: string,
  anchors: string[],
  persistLines = false,
): Promise<number> {
  const ctx = { ...(await loadRebuildContext(driverId)), persistLines };
  let n = 0;
  for (const anchor of anchors) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) continue;
    await rebuildDriverFinancialPeriod(driverId, anchor, ctx);
    n++;
  }
  return n;
}
