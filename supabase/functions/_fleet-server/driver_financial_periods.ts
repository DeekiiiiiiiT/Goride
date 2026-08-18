/**
 * Shared weekly driver financial period projection.
 * One rebuild path feeds Expenses / Settlement / Payout / Reconciliation.
 */
import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import { format, addDays } from "npm:date-fns";
import * as kv from "./kv_store.tsx";
import { getFleetTimezone, fleetCalendarDay } from "./timezone_helper.tsx";
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
import { foldPayoutCashByWeek } from "../../../packages/finance-core/src/payoutCashDedupe.ts";
import { periodKeyFor } from "../../../packages/finance-core/src/periodKey.ts";
import { getServiceClientWithSchema } from "./service_client.ts";
import { isPlatformReimbursedPlazaToll } from "./toll_platform_reimbursed.ts";

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
  cashWrittenOff: number;
  settlementPaid: number;
  cashStillHeld: number;
  settlementAmount: number;
  payoutNet: number;
  settlementStatus: string;
  payoutStatus: string;
  tollStatus: string;
  sourceEventHash: string;
  projectionVersion: number;
  projectedAt: string;
  metadata?: Record<string, unknown>;
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
  organizationId: string | null;
  earningsPolicies: any[];
  legacyEarnings: {
    tiers: any[];
    quotas: any;
    personalAllowance: any;
  };
  persistLines?: boolean;
};

async function resolveDriverOrganizationId(driverId: string): Promise<string | null> {
  try {
    const dr: any = await kv.get(`driver:${driverId}`);
    if (dr?.organizationId) return String(dr.organizationId);
  } catch {
    /* ignore */
  }
  try {
    const { data } = await getServiceClientWithSchema("fleet")
      .from("drivers")
      .select("organization_id")
      .eq("id", driverId)
      .maybeSingle();
    if (data?.organization_id) return String(data.organization_id);
  } catch {
    /* ignore */
  }
  return null;
}

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

/** Load fare/tip/payout_cash for driver alias IDs from unified ledger.entries (BF SSOT). */
async function loadLedgerEventsForDriverIds(driverIds: string[]): Promise<any[]> {
  if (!driverIds.length) return [];
  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const aliasSet = new Set(driverIds.map((id) => String(id)));
  const merged = new Map<string, Record<string, unknown>>();
  // Dual-write may key accounts by Roam or platform external UUID — resolve each alias.
  for (const id of driverIds) {
    const chunk = await listAllUnifiedCanonicalEvents({
      driverId: id,
      products: ["roam_driver", "roam_fleet"],
      entryTypes: ["fare_earning", "tip", "payout_cash", "promotion", "prior_period_adjustment"],
      maxRows: 40_000,
    });
    for (const e of chunk) {
      const did = String(e.driverId || "");
      if (did && !aliasSet.has(did) && did !== String(id)) continue;
      const key = String(e.id || (String(e.eventType) + "|" + String(e.date) + "|" + String(e.driverId) + "|" + String(e.netAmount)));
      merged.set(key, e);
    }
  }
  return [...merged.values()];
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

  const payoutCashByAnchor = foldPayoutCashByWeek(
    (ledgerEvents || []).filter((e: any) => e && String(e.eventType || "") === "payout_cash"),
    timezone,
  );
  const organizationId = await resolveDriverOrganizationId(driverId);

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
    organizationId,
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
    const d = fleetCalendarDay(String(tx.date || ""), timezone);
    return d >= periodAnchor && d <= periodEnd;
  });

  const lines: DriverFinancialPeriodRow["lines"] = [];
  let tollSpend = 0;
  let tollCashSpend = 0;
  let tollTagSpend = 0;
  let tollReconciledCount = 0;
  let tollUnmatchedCount = 0;
  let tollWorkflowActionable = 0;
  let plazaReimbursed = 0;

  for (const tx of weekTolls) {
    const amt = Math.abs(Number(tx.amount) || 0);
    tollSpend += amt;
    if (isCashPaid(tx)) tollCashSpend += amt;
    else tollTagSpend += amt;
    if (isPlatformReimbursedPlazaToll(tx)) plazaReimbursed += amt;
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

  // Cash washes + open unlinked trip credits = cash plaza tolls with no tag row.
  // expense_logged creates a toll_ledger cash row; cash_wash/pending do not —
  // without this, Expenses stays blank for cash-heavy fleets.
  const linkedTripIds = new Set(
    weekTolls.map((tx: any) => tx?.tripId).filter(Boolean).map(String),
  );
  for (const trip of context.scopedTrips || []) {
    if (!trip?.id || linkedTripIds.has(String(trip.id))) continue;
    const amt = Math.abs(Number(trip.tollCharges) || 0);
    if (amt <= 0.005) continue;
    const status = trip?.tollRefundResolution?.status;
    // Linked to a tag toll elsewhere, or phantom (no real spend).
    if (status === "phantom") continue;
    // expense_logged already wrote a cash toll_ledger row — covered by weekTolls.
    if (status === "expense_logged") continue;
    const isCashWash = status === "cash_wash";
    const isOpenUnlinked = !status || status === "pending";
    if (!isCashWash && !isOpenUnlinked) continue;
    // Fleet calendar day — same week bucketing as Toll Recon / period reset.
    const anchorDate = fleetCalendarDay(String(trip.dropoffTime || trip.date || ""), timezone);
    if (!anchorDate || anchorDate < periodAnchor || anchorDate > periodEnd) continue;
    tollSpend += amt;
    tollCashSpend += amt;
    if (isCashWash) {
      tollReconciledCount++;
    } else {
      tollUnmatchedCount++;
      tollWorkflowActionable++;
    }
    if (persistLines) {
      lines.push({
        lineType: isCashWash ? "toll_handled" : "toll_unmatched",
        domain: "toll",
        sourceSystem: isCashWash ? "trip_cash_wash" : "trip_unlinked_refund",
        sourceId: String(trip.id),
        description: isCashWash
          ? `Cash wash · ${trip.platform || "trip"} toll`
          : `Unlinked ${trip.platform || "trip"} toll credit`,
        amount: -amt,
        occurredAt: trip.dropoffTime || trip.date,
        metadata: {
          resolution: status || "pending",
          platform: trip.platform,
          tollCharges: trip.tollCharges,
        },
      });
    }
  }

  const chargeTx = context.chargeTxAll.filter((t: any) => {
    const d = fleetCalendarDay(String(t.date || ""), timezone);
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
    const d = fleetCalendarDay(String(r.date || r.matchedAt || ""), timezone);
    let weekDate = d;
    if (r.matchedTollId) {
      const toll =
        weekTolls.find((t: any) => String(t.id) === String(r.matchedTollId)) ||
        scopedTolls.find((t: any) => String(t.id) === String(r.matchedTollId));
      if (toll?.date) weekDate = fleetCalendarDay(String(toll.date), timezone);
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

  // Open + Rejected claims keep the week actionable (matches Toll Recon wizard).
  // claim_filed is terminal per-toll, but the claim itself may still need work.
  let tollOpenClaimCount = 0;
  for (const cl of context.claims) {
    const claimStatus = String(cl?.status || "");
    if (claimStatus !== "Open" && claimStatus !== "Rejected") continue;
    const tollId = String(cl.transactionId || "");
    const toll = tollId ? scopedTolls.find((t: any) => String(t.id) === tollId) : null;
    const d = toll?.date
      ? fleetCalendarDay(String(toll.date), timezone)
      : fleetCalendarDay(String(cl.date || cl.createdAt || ""), timezone);
    if (d >= periodAnchor && d <= periodEnd) {
      tollOpenClaimCount++;
      tollWorkflowActionable++;
      if (persistLines) {
        lines.push({
          lineType: claimStatus === "Rejected" ? "claim_rejected" : "claim_open",
          domain: "toll",
          sourceSystem: "claim",
          sourceId: String(cl.id),
          description: `${claimStatus} claim${toll ? ` on toll ${tollId}` : ""}`,
          amount: -(Math.abs(Number(cl.amount) || 0)),
          occurredAt: d,
        });
      }
    }
  }

  const { data: finEvents } = await sb()
    .from("financial_events")
    .select(
      "id, event_type, domain, source_system, source_id, amount_minor, occurred_at, payload, reverses_event_id, reversed_at",
    )
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor);

  // Ignore reversed originals + reversal rows so period reset clears Fuel Status.
  const reversedIds = new Set<string>();
  for (const ev of finEvents || []) {
    if (ev?.reverses_event_id) reversedIds.add(String(ev.reverses_event_id));
  }
  const activeFinEvents = (finEvents || []).filter(
    (ev: any) =>
      ev?.id &&
      !ev.reverses_event_id &&
      !ev.reversed_at &&
      !reversedIds.has(String(ev.id)),
  );

  let tollReimbursed = round2(plazaReimbursed);
  let fuelDeduction = 0;
  let fuelFleetShare = 0;
  let fuelDriverSpend = 0;
  let fuelGasCardSpend = 0;
  let fuelFinalized = false;

  for (const ev of activeFinEvents) {
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

  // Fallback: finalized fuel reports when no fuel events yet (weekStart is SSOT)
  if (!fuelFinalized) {
    for (const r of context.fuelReports) {
      const start = String(r.weekStart || r.periodStart || r.startDate || "").slice(0, 10);
      if (!(start >= periodAnchor && start <= periodEnd)) continue;
      fuelDeduction = round2(fuelDeduction + Math.abs(Number(r.driverShare) || 0));
      fuelFleetShare = round2(fuelFleetShare + Math.abs(Number(r.companyShare) || 0));
      // Canonical snapshot field is driverSpend (legacy: driverCashSpend / cashSpend)
      fuelDriverSpend = round2(
        fuelDriverSpend +
          Math.abs(
            Number(r.driverSpend) || Number(r.driverCashSpend) || Number(r.cashSpend) || 0,
          ),
      );
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
    quotaConfig: bundleEH.quotas || context.legacyEarnings.quotas,
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
  const cashWrittenOff = cashBase.cashWrittenOff;
  const settlementPaidRaw = cashBase.settlementPaid;

  const fuelNetPay = round2(fuelDriverSpend - fuelDeduction);
  const settled = computePeriodSettlement({
    driverShare,
    fuelDeduction,
    baseCashOwed: cashCollected,
    baseCashPaid: cashReturned,
    tollCashWash: tollCashSpend,
    tollPersonal: Math.max(0, tollChargedToDriver),
    fuelCredits: fuelFleetShare,
    cashWrittenOff,
    settlementPaid: settlementPaidRaw,
    tipsPaidToDriver: share.tipsPaidToDriver || 0,
  });
  // Pocket cash cannot go negative (DB cash_nonneg). Over-return vs collected
  // is fleet-owes on settlement_amount, not a negative held balance.
  const cashStillHeld = round2(Math.max(0, settled.adjCashBalance));
  const payoutNet = settled.netPayout;
  const settlementPaid = settled.settlementPaid;
  // Persist outstanding after payouts so Driver Balances / chips stay correct.
  const settlementAmount = settled.settlement;

  const tollStatus =
    weekTolls.length === 0 && tollReconciledCount === 0 && tollUnmatchedCount === 0
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
    cashWrittenOff,
    settlementPaid,
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
    cashWrittenOff: round2(cashWrittenOff),
    settlementPaid: round2(settlementPaid),
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
    metadata: {
      financeCore: {
        tips: share.tips,
        tipsPaidToDriver: share.tipsPaidToDriver,
        tipsWithheld: share.tipsWithheld,
        quotaTarget: share.quotaTarget,
        quotaPercent: share.quotaPercent,
        quotaMet: share.quotaMet,
        uberCash: cashBase.uberCash,
        uberTripCash: cashBase.uberTripCash,
        nonUberTripCash: cashBase.nonUberTripCash,
        cashSourceMismatch: cashBase.cashSourceMismatch,
        cashHeldClamped: settled.adjCashBalance < -0.005,
        unclampedCashHeld: round2(settled.adjCashBalance),
      },
    },
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
    cashWrittenOff > 0.005 ||
    settlementPaid > 0.005 ||
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
    organization_id: context.organizationId,
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
    cash_collected: round2(Math.max(0, row.cashCollected)),
    cash_returned: round2(Math.max(0, row.cashReturned)),
    cash_written_off: round2(Math.max(0, row.cashWrittenOff)),
    settlement_paid: round2(Math.max(0, row.settlementPaid)),
    cash_still_held: round2(Math.max(0, row.cashStillHeld)),
    toll_cash_spend: round2(Math.max(0, row.tollCashSpend)),
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
    metadata: row.metadata || {},
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
    cashWrittenOff: Number(r.cash_written_off) || 0,
    settlementPaid: Number(r.settlement_paid) || 0,
    cashStillHeld: Number(r.cash_still_held) || 0,
    settlementAmount: Number(r.settlement_amount) || 0,
    payoutNet: Number(r.payout_net) || 0,
    settlementStatus: r.settlement_status,
    payoutStatus: r.payout_status,
    tollStatus: r.toll_status,
    sourceEventHash: r.source_event_hash,
    projectionVersion: r.projection_version,
    projectedAt: r.projected_at,
    metadata: r.metadata && typeof r.metadata === "object" ? r.metadata : {},
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

function isSignedWeekRow(r: { fuel_finalized?: unknown; status?: unknown; payout_status?: unknown }): boolean {
  const fuelDone = !!r.fuel_finalized;
  const closed = String(r.status || "") === "closed";
  const payoutDone = String(r.payout_status || "").toLowerCase() === "finalized";
  return fuelDone || closed || payoutDone;
}

export async function rebuildAllPeriodsForDriver(
  driverId: string,
  opts?: { force?: boolean },
): Promise<{ rebuilt: number; skippedSigned: number }> {
  const ctx = await loadRebuildContext(driverId);
  const anchors = new Set<string>();
  for (const tx of ctx.scopedTolls) {
    if (!tx?.date) continue;
    anchors.add(await periodAnchorFor(tx.date, ctx.timezone));
  }
  // Cash-wash / open unlinked trip credits (no toll_ledger row) still create Expenses weeks.
  for (const trip of ctx.scopedTrips || []) {
    const status = trip?.tollRefundResolution?.status;
    if (status === "phantom" || status === "expense_logged") continue;
    const amt = Math.abs(Number(trip.tollCharges) || 0);
    if (amt <= 0.005) continue;
    if (status && status !== "cash_wash" && status !== "pending") continue;
    const d = trip.dropoffTime || trip.date;
    if (!d) continue;
    anchors.add(await periodAnchorFor(String(d), ctx.timezone));
  }
  for (const t of ctx.chargeTxAll) {
    if (!t?.date) continue;
    anchors.add(await periodAnchorFor(t.date, ctx.timezone));
  }
  for (const r of ctx.fuelReports) {
    const start = String(r.weekStart || r.periodStart || r.startDate || "").slice(0, 10);
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
  const { data: savedWeeks } = await sb()
    .from("driver_financial_periods")
    .select("period_anchor")
    .eq("driver_id", driverId);
  for (const r of savedWeeks || []) {
    const a = String(r.period_anchor || "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(a)) anchors.add(a);
  }

  let n = 0;
  let skippedSigned = 0;
  const signedAnchors = new Set<string>();
  if (!opts?.force) {
    const { data: signedRows } = await sb()
      .from("driver_financial_periods")
      .select("period_anchor, fuel_finalized, status, payout_status")
      .eq("driver_id", driverId);
    for (const r of signedRows || []) {
      if (isSignedWeekRow(r)) signedAnchors.add(String(r.period_anchor || "").slice(0, 10));
    }
  }
  for (const anchor of [...anchors].sort()) {
    if (signedAnchors.has(anchor)) {
      skippedSigned++;
      continue;
    }
    try {
      await rebuildDriverFinancialPeriod(driverId, anchor, ctx);
      n++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[DriverFinancialPeriods] rebuild ${driverId} ${anchor}:`, msg);
    }
  }
  if (n === 0 && skippedSigned === 0) {
    throw new Error("rebuild wrote 0 weeks");
  }
  return { rebuilt: n, skippedSigned };
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

/**
 * Log Cash / Reverse / Write-off path: update ONLY cash returned / write-off / settlement paid
 * on an existing period row. Do NOT recompute passenger cash, fuel, tolls, or share.
 * Full rebuild was rewriting those inputs and making Driver owes jump on every collect action.
 */
export async function syncPeriodCashFromTransactions(
  driverId: string,
  periodAnchor: string,
): Promise<"synced" | "rebuilt"> {
  if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(periodAnchor)) {
    throw new Error("driverId and periodAnchor (yyyy-MM-dd) required");
  }

  const { data: existing, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "id, period_end, cash_collected, driver_share, fuel_deduction, fuel_fleet_share, toll_cash_spend, toll_charged_to_driver, fuel_finalized, settlement_status",
    )
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor)
    .maybeSingle();
  if (error) {
    console.error("[DriverFinancialPeriods] cash sync load:", error.message);
    throw new Error(error.message);
  }
  if (!existing) {
    await rebuildDriverFinancialPeriod(driverId, periodAnchor);
    return "rebuilt";
  }

  const allTx = await kv.getByPrefix("transaction:");
  const driverTxAll = (allTx || []).filter(
    (t: any) => String(t?.driverId || "") === driverId,
  );
  const periodEnd = String(existing.period_end || periodAnchor).slice(0, 10);
  const cashBase = computeWeekCashBase({
    periodAnchor,
    periodEnd,
    trips: [],
    transactions: driverTxAll,
    uberPayoutCash: 0,
  });
  const cashReturned = cashBase.cashReturned;
  const cashWrittenOff = cashBase.cashWrittenOff;
  const settlementPaidRaw = cashBase.settlementPaid;

  const settled = computePeriodSettlement({
    driverShare: Number(existing.driver_share) || 0,
    fuelDeduction: Number(existing.fuel_deduction) || 0,
    baseCashOwed: Number(existing.cash_collected) || 0,
    baseCashPaid: cashReturned,
    tollCashWash: Number(existing.toll_cash_spend) || 0,
    tollPersonal: Math.max(0, Number(existing.toll_charged_to_driver) || 0),
    fuelCredits: Number(existing.fuel_fleet_share) || 0,
    cashWrittenOff,
    settlementPaid: settlementPaidRaw,
  });

  const fuelFinalized = !!existing.fuel_finalized;
  let settlementStatus = String(existing.settlement_status || "pending");
  if (fuelFinalized) {
    if (Math.abs(settled.settlement) < 1) settlementStatus = "settled";
    else if (settled.settlement > 0) settlementStatus = "company_owes";
    else settlementStatus = "driver_owes";
  }

  const now = new Date().toISOString();
  const { error: updErr } = await sb()
    .from("driver_financial_periods")
    .update({
      cash_returned: round2(cashReturned),
      cash_written_off: round2(cashWrittenOff),
      settlement_paid: round2(settled.settlementPaid),
      cash_still_held: round2(settled.adjCashBalance),
      settlement_amount: round2(settled.settlement),
      payout_net: round2(settled.netPayout),
      settlement_status: settlementStatus,
      updated_at: now,
    })
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor);
  if (updErr) {
    console.error("[DriverFinancialPeriods] cash sync update:", updErr.message);
    throw new Error(updErr.message);
  }
  return "synced";
}

export type CompanyOwesPeriodRow = {
  driverId: string;
  periodAnchor: string;
  periodEnd: string;
  settlementAmount: number;
  settlementPaid: number;
  cashCollected: number;
  cashReturned: number;
  cashStillHeld: number;
  payoutNet: number;
  settlementStatus: string;
  fuelFinalized: boolean;
  tripCount: number;
};

/** Org-wide company_owes queue — single SQL query (not N+1 per driver). */
export async function listCompanyOwesPeriods(opts?: {
  periodAnchor?: string;
  periodStart?: string;
  periodEnd?: string;
  minAmount?: number;
  limit?: number;
  organizationId?: string | null;
}): Promise<CompanyOwesPeriodRow[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 500, 1), 2000);
  let q = sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count",
    )
    .eq("settlement_status", "company_owes")
    .gt("settlement_amount", 0.005)
    .order("period_anchor", { ascending: false })
    .order("driver_id", { ascending: true })
    .limit(limit);

  if (opts?.organizationId) {
    q = q.eq("organization_id", opts.organizationId);
  }

  if (opts?.periodAnchor && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodAnchor)) {
    q = q.eq("period_anchor", opts.periodAnchor);
  } else {
    if (opts?.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodStart)) {
      q = q.gte("period_anchor", opts.periodStart);
    }
    if (opts?.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodEnd)) {
      q = q.lte("period_anchor", opts.periodEnd);
    }
  }
  if (opts?.minAmount != null && Number(opts.minAmount) > 0) {
    q = q.gte("settlement_amount", Number(opts.minAmount));
  }

  const { data, error } = await q;
  if (error) {
    console.error("[DriverFinancialPeriods] company_owes list:", error.message);
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => ({
    driverId: String(r.driver_id),
    periodAnchor: String(r.period_anchor).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    settlementAmount: Number(r.settlement_amount) || 0,
    settlementPaid: Number(r.settlement_paid) || 0,
    cashCollected: Number(r.cash_collected) || 0,
    cashReturned: Number(r.cash_returned) || 0,
    cashStillHeld: Number(r.cash_still_held) || 0,
    payoutNet: Number(r.payout_net) || 0,
    settlementStatus: String(r.settlement_status || ""),
    fuelFinalized: !!r.fuel_finalized,
    tripCount: Number(r.trip_count) || 0,
  }));
}

/** Recently paid company-owes weeks (settled with settlement_paid > 0). */
export async function listRecentlyPaidSettlementPeriods(opts?: {
  periodStart?: string;
  periodEnd?: string;
  limit?: number;
}): Promise<CompanyOwesPeriodRow[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 300, 1), 1000);
  let q = sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count",
    )
    .eq("settlement_status", "settled")
    .gt("settlement_paid", 0.005)
    .order("period_anchor", { ascending: false })
    .order("driver_id", { ascending: true })
    .limit(limit);

  if (opts?.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodStart)) {
    q = q.gte("period_anchor", opts.periodStart);
  }
  if (opts?.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodEnd)) {
    q = q.lte("period_anchor", opts.periodEnd);
  }

  const { data, error } = await q;
  if (error) {
    console.error("[DriverFinancialPeriods] paid settlements list:", error.message);
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => ({
    driverId: String(r.driver_id),
    periodAnchor: String(r.period_anchor).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    settlementAmount: Number(r.settlement_amount) || 0,
    settlementPaid: Number(r.settlement_paid) || 0,
    cashCollected: Number(r.cash_collected) || 0,
    cashReturned: Number(r.cash_returned) || 0,
    cashStillHeld: Number(r.cash_still_held) || 0,
    payoutNet: Number(r.payout_net) || 0,
    settlementStatus: String(r.settlement_status || ""),
    fuelFinalized: !!r.fuel_finalized,
    tripCount: Number(r.trip_count) || 0,
  }));
}

export type DriverOwesPeriodRow = CompanyOwesPeriodRow & {
  /** Positive amount the driver owes the fleet (abs of negative settlement or cash held). */
  amountOwed: number;
};

function applyPeriodRangeFilters(
  q: any,
  opts?: { periodAnchor?: string; periodStart?: string; periodEnd?: string; organizationId?: string | null },
) {
  if (opts?.organizationId) {
    q = q.eq("organization_id", opts.organizationId);
  }
  if (opts?.periodAnchor && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodAnchor)) {
    return q.eq("period_anchor", opts.periodAnchor);
  }
  if (opts?.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodStart)) {
    q = q.gte("period_anchor", opts.periodStart);
  }
  if (opts?.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodEnd)) {
    q = q.lte("period_anchor", opts.periodEnd);
  }
  return q;
}

function mapPeriodListRow(r: any): CompanyOwesPeriodRow {
  return {
    driverId: String(r.driver_id),
    periodAnchor: String(r.period_anchor).slice(0, 10),
    periodEnd: String(r.period_end).slice(0, 10),
    settlementAmount: Number(r.settlement_amount) || 0,
    settlementPaid: Number(r.settlement_paid) || 0,
    cashCollected: Number(r.cash_collected) || 0,
    cashReturned: Number(r.cash_returned) || 0,
    cashStillHeld: Number(r.cash_still_held) || 0,
    payoutNet: Number(r.payout_net) || 0,
    settlementStatus: String(r.settlement_status || ""),
    fuelFinalized: !!r.fuel_finalized,
    tripCount: Number(r.trip_count) || 0,
  };
}

/** Org-wide driver_owes queue — collect cash drivers still owe after finalize. */
export async function listDriverOwesPeriods(opts?: {
  periodAnchor?: string;
  periodStart?: string;
  periodEnd?: string;
  minAmount?: number;
  limit?: number;
  organizationId?: string | null;
}): Promise<DriverOwesPeriodRow[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 500, 1), 2000);
  let q = sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count",
    )
    .eq("settlement_status", "driver_owes")
    .lt("settlement_amount", -0.005)
    .order("period_anchor", { ascending: false })
    .order("driver_id", { ascending: true })
    .limit(limit);

  q = applyPeriodRangeFilters(q, opts);
  if (opts?.minAmount != null && Number(opts.minAmount) > 0) {
    q = q.lte("settlement_amount", -Number(opts.minAmount));
  }

  const { data, error } = await q;
  if (error) {
    console.error("[DriverFinancialPeriods] driver_owes list:", error.message);
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => {
    const row = mapPeriodListRow(r);
    return { ...row, amountOwed: Math.abs(row.settlementAmount) };
  });
}

/**
 * Pre-finalize collect queue — cash still held on pending / not-fuel-finalized weeks.
 * Excludes company_owes / driver_owes / settled so those stay on their own lists.
 */
export async function listCashHeldPeriods(opts?: {
  periodAnchor?: string;
  periodStart?: string;
  periodEnd?: string;
  minAmount?: number;
  limit?: number;
  organizationId?: string | null;
}): Promise<DriverOwesPeriodRow[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 500, 1), 2000);
  let q = sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count",
    )
    .gt("cash_still_held", 0.5)
    .or("settlement_status.eq.pending,fuel_finalized.eq.false")
    .order("period_anchor", { ascending: false })
    .order("driver_id", { ascending: true })
    .limit(limit);

  q = applyPeriodRangeFilters(q, opts);
  if (opts?.minAmount != null && Number(opts.minAmount) > 0) {
    q = q.gte("cash_still_held", Number(opts.minAmount));
  }

  const { data, error } = await q;
  if (error) {
    console.error("[DriverFinancialPeriods] cash_held list:", error.message);
    throw new Error(error.message);
  }
  return (data || [])
    .map((r: any) => {
      const row = mapPeriodListRow(r);
      const status = String(row.settlementStatus || "").toLowerCase();
      if (status === "company_owes" || status === "driver_owes" || status === "settled") {
        return null;
      }
      return { ...row, amountOwed: Math.max(0, row.cashStillHeld) };
    })
    .filter(Boolean) as DriverOwesPeriodRow[];
}

export function isSingleFleetWeek(startDate: string, endDate: string): boolean {
  const key = periodKeyFor(startDate);
  if (!key || key !== startDate) return false;
  return endDate === periodEndForAnchor(key);
}

/** Overlay Engine C overview JSON with the persisted weekly projection (Phase 4). */
export function overlayOverviewFromPeriod(
  overview: Record<string, unknown>,
  period: DriverFinancialPeriodRow,
  prevPeriod?: DriverFinancialPeriodRow | null,
): Record<string, unknown> {
  const periodBlock = {
    ...((overview.period && typeof overview.period === "object"
      ? overview.period
      : {}) as Record<string, unknown>),
    earnings: period.earningsGross,
    cashCollected: period.cashCollected,
    tripCount: period.tripCount,
  };
  const prevBlock = {
    ...((overview.prevPeriod && typeof overview.prevPeriod === "object"
      ? overview.prevPeriod
      : {}) as Record<string, unknown>),
  };
  if (prevPeriod) {
    prevBlock.earnings = prevPeriod.earningsGross;
    prevBlock.cashCollected = prevPeriod.cashCollected;
  }
  const fc =
    period.metadata && typeof period.metadata.financeCore === "object"
      ? (period.metadata.financeCore as Record<string, unknown>)
      : {};
  const platformStats = {
    ...((overview.platformStats && typeof overview.platformStats === "object"
      ? overview.platformStats
      : {}) as Record<string, Record<string, number>>),
  };
  if (fc.uberCash != null) {
    platformStats.Uber = {
      ...(platformStats.Uber || {}),
      cashCollected: Number(fc.uberCash) || 0,
    };
  }
  const priorComplete = (overview.completeness || {}) as Record<string, unknown>;
  return {
    ...overview,
    period: periodBlock,
    prevPeriod: prevBlock,
    platformStats,
    completeness: {
      ...priorComplete,
      totalTrips: period.tripCount,
      ledgerTrips: Number(priorComplete.ledgerTrips) || period.tripCount,
      isComplete: Number(priorComplete.missingCount || 0) === 0,
    },
    source: "driver_financial_periods",
    readModelSource: "driver_financial_periods",
  };
}

export async function findSignedWeeksTouchedByEvents(
  events: Array<Record<string, unknown>>,
): Promise<Array<{ driverId: string; periodAnchor: string }>> {
  const pairs = new Map<string, { driverId: string; periodAnchor: string }>();
  for (const e of events) {
    const driverId = typeof e.driverId === "string" ? e.driverId.trim() : "";
    const key = periodKeyFor(
      typeof e.date === "string" ? e.date : typeof e.periodStart === "string" ? e.periodStart : "",
    );
    if (!driverId || !key) continue;
    pairs.set(`${driverId}|${key}`, { driverId, periodAnchor: key });
  }
  if (pairs.size === 0) return [];
  const driverIds = [...new Set([...pairs.values()].map((p) => p.driverId))];
  const anchors = [...new Set([...pairs.values()].map((p) => p.periodAnchor))];
  const { data, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id, period_anchor, fuel_finalized, status, payout_status")
    .in("driver_id", driverIds)
    .in("period_anchor", anchors);
  if (error) {
    console.warn("[DriverFinancialPeriods] signed-week lookup:", error.message);
    return [];
  }
  const signed: Array<{ driverId: string; periodAnchor: string }> = [];
  for (const r of data || []) {
    if (!isSignedWeekRow(r)) continue;
    const id = String(r.driver_id);
    const anchor = String(r.period_anchor).slice(0, 10);
    if (pairs.has(`${id}|${anchor}`)) signed.push({ driverId: id, periodAnchor: anchor });
  }
  return signed;
}
