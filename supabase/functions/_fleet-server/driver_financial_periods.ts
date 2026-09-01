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
  collectLinkedTripIds,
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
import {
  STATUS_CASH_HELD_EPS,
} from "../../../packages/finance-core/src/money.ts";
import { derivePeriodStatus } from "./period_projector.ts";
import { persistPeriodRowWithVersion, updatePeriodCashWithVersion } from "./period_persist.ts";
import { getServiceClientWithSchema } from "./service_client.ts";
import { isPlatformReimbursedPlazaToll } from "./toll_platform_reimbursed.ts";
import {
  isTollIncludedInSpend,
  isTollLedgerVoided,
} from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import {
  isTripCashWashSpend,
  isTripTollActionable,
} from "../../../packages/finance-core/src/periodTollTrip.ts";
import { sumExcludedCashFromWeek } from "../../../packages/finance-core/src/periodTollCashSpend.ts";
import {
  loadMirroredDriverTransactions,
  settlementTxTableReadEnabled,
} from "./settlement_transactions.ts";
import {
  buildCashSettlementPersistFields,
  buildPeriodMetadata,
} from "../../../packages/finance-core/src/periodPersistBody.ts";
import {
  projectionAllowsFuelSnapshotFallback,
  projectionReadsEventsForFares,
  projectionReadsEventsForFuel,
  projectionReadsEventsForTolls,
} from "./period_projection_flags.ts";

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
  // Voided duplicates must not keep Expenses / Settlement "Unmatched".
  if (isTollLedgerVoided(tx)) return true;
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
  // Receipt is documentation only — payment method controls cash wash.
  return pm.includes("cash");
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
  tipsPaidToDriver: number;
  tipsWithheld: number;
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
  /** Reconcilable tolls for the driver including spend-excluded (quarantine) rows. */
  allScopedTolls: any[];
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
  /** Ops force-release: unlock money statuses without tolls clear. */
  forceRelease?: boolean;
  /** Preloaded period metadata (force-release flags) keyed by period_anchor. */
  periodMetaByAnchor?: Map<string, Record<string, unknown>>;
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

async function loadDriverTransactionsForSettlement(
  driverId: string,
  aliasIdSet: Set<string>,
): Promise<any[]> {
  if (settlementTxTableReadEnabled()) {
    const mirrored = await loadMirroredDriverTransactions(driverId);
    return mirrored.filter((t) => aliasIdSet.has(String(t.driverId || "")));
  }
  const allTx = await kv.getByPrefix("transaction:");
  return (allTx || []).filter((t: any) => t && aliasIdSet.has(String(t.driverId || "")));
}

async function loadRebuildContext(driverId: string): Promise<RebuildContext> {
  const timezone = await getFleetTimezone();
  const driverIds = await resolveDriverAliasIds(driverId);
  const idSet = new Set(driverIds.map(String));

  const [
    { tollTx, trips },
    disputesAll,
    fuelAll,
    claimsAll,
    ledgerEvents,
    prefsEH,
    policyItemsRaw,
  ] = await Promise.all([
    loadAllTollLedgerWithTrips(),
    loadDisputeRefundRecords(),
    loadAllByPrefix("finalized_report:"),
    loadAllByPrefix("claim:"),
    loadLedgerEventsForDriverIds(driverIds),
    kv.get("preferences:general"),
    kv.getByPrefix("earnings_policy:"),
  ]);

  // Same spend gate as Toll Recon: voided + true Audit 1.1 quarantine out.
  // Keep allScopedTolls so periods can report excludedCash* for Expenses UI.
  const allScopedTolls = filterByDriver(tollTx, driverId).filter(
    (tx: any) => isReconcilableTollExpense(tx) && !isTopUpLike(tx),
  );
  const scopedTolls = allScopedTolls.filter((tx: any) => isTollIncludedInSpend(tx));
  const scopedTrips = filterByDriver(trips, driverId);
  const driverTxAll = await loadDriverTransactionsForSettlement(driverId, idSet);
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

  // Batch-load force-release metadata once (avoid per-week select in rebuild).
  const periodMetaByAnchor = new Map<string, Record<string, unknown>>();
  const { data: metaRows } = await sb()
    .from("driver_financial_periods")
    .select("period_anchor, metadata")
    .eq("driver_id", driverId);
  for (const r of metaRows || []) {
    const a = String(r.period_anchor || "").slice(0, 10);
    if (!a) continue;
    periodMetaByAnchor.set(
      a,
      r.metadata && typeof r.metadata === "object" ? (r.metadata as Record<string, unknown>) : {},
    );
  }

  return {
    timezone,
    scopedTolls,
    allScopedTolls,
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
    periodMetaByAnchor,
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
  const allWeekTolls = (context.allScopedTolls || scopedTolls).filter((tx: any) => {
    const d = fleetCalendarDay(String(tx.date || ""), timezone);
    return d >= periodAnchor && d <= periodEnd;
  });
  const { excludedCashSpend, excludedCashCount } = sumExcludedCashFromWeek(
    allWeekTolls,
    (t) => isTollIncludedInSpend(t as any),
  );

  const lines: DriverFinancialPeriodRow["lines"] = [];
  let tollSpend = 0;
  let tollCashSpend = 0;
  let tollTagSpend = 0;
  let tollCashWashEligible = 0;
  let tollReconciledCount = 0;
  let tollUnmatchedCount = 0;
  let tollWorkflowActionable = 0;
  let plazaReimbursed = 0;

  const useTollEvents = projectionReadsEventsForTolls();

  for (const tx of weekTolls) {
    const amt = Math.abs(Number(tx.amount) || 0);
    const handled = isHandledToll(tx);
    const cash = isCashPaid(tx);
    // Spend from ledger unless PROJECTION_EVENTS_TOLLS (events aggregated after finEvents load).
    if (!useTollEvents) {
      tollSpend += amt;
      if (cash) tollCashSpend += amt;
      else tollTagSpend += amt;
      if (cash && handled) tollCashWashEligible += amt;
    }
    if (isPlatformReimbursedPlazaToll(tx)) plazaReimbursed += amt;
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

  // Cash-wash trips with no linked tag = extra plaza cash (same as Toll Recon).
  // Pending unlinked trips block finalization without crediting wash.
  const linkedTripIds = collectLinkedTripIds(weekTolls);
  for (const trip of context.scopedTrips || []) {
    const anchorDate = fleetCalendarDay(String(trip.dropoffTime || trip.date || ""), timezone);
    if (!anchorDate || anchorDate < periodAnchor || anchorDate > periodEnd) continue;

    if (isTripCashWashSpend(trip, linkedTripIds)) {
      const amt = Math.abs(Number(trip.tollCharges) || 0);
      tollSpend += amt;
      tollCashSpend += amt;
      tollCashWashEligible += amt;
      tollReconciledCount++;
      if (persistLines) {
        lines.push({
          lineType: "toll_handled",
          domain: "toll",
          sourceSystem: "trip_cash_wash",
          sourceId: String(trip.id),
          description: `Cash wash · ${trip.platform || "trip"} toll`,
          amount: -amt,
          occurredAt: trip.dropoffTime || trip.date,
          metadata: {
            resolution: "cash_wash",
            platform: trip.platform,
            tollCharges: trip.tollCharges,
          },
        });
      }
      continue;
    }

    if (isTripTollActionable(trip, linkedTripIds)) {
      tollUnmatchedCount++;
      tollWorkflowActionable++;
      if (persistLines) {
        const amt = Math.abs(Number(trip.tollCharges) || 0);
        lines.push({
          lineType: "toll_unmatched",
          domain: "toll",
          sourceSystem: "trip_pending",
          sourceId: String(trip.id),
          description: `Pending trip toll · ${trip.platform || "trip"}`,
          amount: -amt,
          occurredAt: trip.dropoffTime || trip.date,
          metadata: {
            resolution: trip?.tollRefundResolution?.status || "pending",
            platform: trip.platform,
            tollCharges: trip.tollCharges,
          },
        });
      }
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
  let fuelSource: "events" | "snapshot" = "events";

  if (useTollEvents) {
    for (const ev of activeFinEvents) {
      if (String(ev.event_type || "") !== "toll_usage") continue;
      const amt = Math.abs(minorToMajor(Number(ev.amount_minor) || 0));
      if (amt < 0.005) continue;
      const payload = (ev.payload && typeof ev.payload === "object"
        ? ev.payload
        : {}) as Record<string, unknown>;
      const pm = String(payload.paymentMethod || "").toLowerCase();
      const cash = pm.includes("cash");
      const stage = String(payload.workflowStage || "");
      const handled =
        isTerminalStage(stage) ||
        !!payload.isReconciled ||
        !!payload.tripId ||
        !!payload.resolution;
      tollSpend = round2(tollSpend + amt);
      if (cash) tollCashSpend = round2(tollCashSpend + amt);
      else tollTagSpend = round2(tollTagSpend + amt);
      if (cash && handled) tollCashWashEligible = round2(tollCashWashEligible + amt);
    }
  }

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

  // Fallback: finalized fuel reports when events path empty AND snapshot opt-in.
  // Prod had zero snapshot periods (2026-09-01) — do not silently reintroduce.
  if (!fuelFinalized && (!projectionReadsEventsForFuel() || projectionAllowsFuelSnapshotFallback())) {
    fuelSource = "snapshot";
    const seenFuelKeys = new Set<string>();
    for (const r of context.fuelReports) {
      const start = String(r.weekStart || r.periodStart || r.startDate || "").slice(0, 10);
      if (!(start >= periodAnchor && start <= periodEnd)) continue;
      const key = String(r.id || r.reportId || `${start}:${r.driverId || ""}`);
      if (seenFuelKeys.has(key)) continue;
      seenFuelKeys.add(key);
      fuelDeduction = round2(fuelDeduction + Math.abs(Number(r.driverShare) || 0));
      fuelFleetShare = round2(fuelFleetShare + Math.abs(Number(r.companyShare) || 0));
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
    timezone,
  });
  let earningsGross = share.earningsGross;
  let driverShare = share.driverShare;
  let fleetShare = share.fleetShare;
  let driverSharePercent = share.driverSharePercent;
  let tripCount = share.tripCount;
  let tierId: string | null = share.tierId;
  let tierName: string | null = share.tierName;

  // Trip fallback when no ledger fare_earning rows yet — off when fares-events flag is on.
  if (!projectionReadsEventsForFares() && earningsGross < 0.005 && tripCount === 0) {
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
    timezone,
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
    tollCashWash: tollCashWashEligible,
    tollPersonal: Math.max(0, tollChargedToDriver),
    fuelCredits: fuelFleetShare,
    cashWrittenOff,
    settlementPaid: settlementPaidRaw,
    tipsPaidToDriver: share.tipsPaidToDriver || 0,
  });
  // Pocket cash cannot go negative (DB cash_nonneg). Over-return vs collected
  // is fleet-owes on settlement_amount, not a negative held balance.
  const payoutNet = settled.netPayout;
  const settlementPaid = settled.settlementPaid;
  const overpaidAmount = settled.overpaidAmount;
  const settlementAmount = settled.settlement;

  const priorMeta =
    context.periodMetaByAnchor?.get(periodAnchor) ||
    ({} as Record<string, unknown>);
  const forceMeta = (priorMeta.forceRelease || {}) as Record<string, unknown>;
  const forceRelease =
    !!(context as any).forceRelease ||
    !!forceMeta.at ||
    !!priorMeta.forceReleasedAt;

  const tollStatus =
    weekTolls.length === 0 && tollReconciledCount === 0 && tollUnmatchedCount === 0
      ? "n/a"
      : tollUnmatchedCount > 0
        ? "unmatched"
        : tollWorkflowActionable > 0
          ? "in_progress"
          : "reconciled";

  const derived = derivePeriodStatus({
    fuelFinalized,
    forceRelease,
    settled,
    tolls: { tollStatus, tollWorkflowActionable, tollUnmatchedCount },
  });
  const cashStillHeld = derived.cashStillHeld;
  const settlementStatus = derived.settlementStatus;
  const payoutStatus = derived.payoutStatus;
  const periodStatus = derived.periodStatus;

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

  const { data: existing } = await sb()
    .from("driver_financial_periods")
    .select("id, projection_version, status, settlement_paid, closed_at")
    .eq("driver_id", driverId)
    .eq("period_anchor", periodAnchor)
    .maybeSingle();

  const periodMetadata = buildPeriodMetadata({
    priorMeta,
    prevSettlementPaid: Number(existing?.settlement_paid) || 0,
    settled,
    derived,
    excludedCashSpend,
    excludedCashCount,
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
      overpaidAmount,
      tollCashWashEligible,
      tollsClear: derived.tollsClear,
      moneyUnlocked: derived.moneyUnlocked,
      cashHeldClamped: settled.adjCashBalance < -0.005,
      unclampedCashHeld: round2(settled.adjCashBalance),
      projectionSources: {
        fuel: fuelSource,
        cash: settlementTxTableReadEnabled() ? "table" : "kv",
        tolls: useTollEvents ? "events" : "ledger",
        fares: projectionReadsEventsForFares() ? "events" : "events_or_trips",
      },
    },
    forceRelease: forceRelease
      ? {
          at: forceMeta.at || priorMeta.forceReleasedAt || new Date().toISOString(),
          by: (forceMeta.by || priorMeta.forceReleasedBy || null) as string | null,
          reason: (forceMeta.reason || priorMeta.forceReleaseReason || null) as string | null,
        }
      : undefined,
  });

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
    tipsPaidToDriver: round2(share.tipsPaidToDriver || 0),
    tipsWithheld: round2(share.tipsWithheld || 0),
    settlementStatus,
    payoutStatus,
    tollStatus,
    sourceEventHash,
    projectionVersion: 1,
    projectedAt: new Date().toISOString(),
    lines,
    metadata: periodMetadata,
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
  const cashPersist = buildCashSettlementPersistFields({
    cashReturned: row.cashReturned,
    cashWrittenOff: row.cashWrittenOff,
    settled,
    derived: {
      settlementStatus: row.settlementStatus,
      payoutStatus: row.payoutStatus,
      periodStatus: row.status as "open" | "closed" | "reopened",
      cashStillHeld: row.cashStillHeld,
      tollsClear: derived.tollsClear,
      moneyUnlocked: derived.moneyUnlocked,
    },
    metadata: periodMetadata,
    existingClosedAt: existing?.closed_at as string | null | undefined,
    now: row.projectedAt,
  });

  const upsertBody: Record<string, unknown> = {
    driver_id: driverId,
    period_anchor: periodAnchor,
    period_end: periodEnd,
    timezone,
    organization_id: context.organizationId,
    status: cashPersist.status,
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
    cash_returned: cashPersist.cash_returned,
    cash_written_off: cashPersist.cash_written_off,
    settlement_paid: cashPersist.settlement_paid,
    cash_still_held: cashPersist.cash_still_held,
    tips_paid_to_driver: round2(Math.max(0, Number(share.tipsPaidToDriver) || 0)),
    tips_withheld: round2(Math.max(0, Number(share.tipsWithheld) || 0)),
    settlement_amount: cashPersist.settlement_amount,
    payout_net: cashPersist.payout_net,
    settlement_amount_minor: cashPersist.settlement_amount_minor,
    payout_net_minor: cashPersist.payout_net_minor,
    cash_still_held_minor: cashPersist.cash_still_held_minor,
    settlement_status: cashPersist.settlement_status,
    payout_status: cashPersist.payout_status,
    toll_status: row.tollStatus,
    source_event_hash: sourceEventHash,
    projected_at: row.projectedAt,
    updated_at: cashPersist.updated_at,
    reopened_at:
      existing?.status === "closed" && periodStatus !== "closed"
        ? row.projectedAt
        : null,
    closed_at: cashPersist.closed_at,
    metadata: cashPersist.metadata,
  };

  const { data: saved, error } = await (async () => {
    try {
      const result = await persistPeriodRowWithVersion(driverId, periodAnchor, upsertBody);
      row.projectionVersion = result.projectionVersion;
      return { data: { id: result.id }, error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e : new Error(String(e)) };
    }
  })();

  if (error) {
    console.error("[DriverFinancialPeriods] upsert failed:", error.message);
    throw new Error(`driver_financial_periods upsert failed: ${error.message}`);
  }

  const periodId = saved?.id as string;
  row.id = periodId;

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
    // Signed weeks are money-immutable to outbox unless payload.force is set.
    const { data: signedRows } = await sb()
      .from("driver_financial_periods")
      .select(
        "period_anchor, payout_status, settlement_status, toll_status, toll_workflow_actionable, toll_unmatched_count",
      )
      .eq("driver_id", driverId);
    const signedAnchors = new Set<string>();
    for (const r of signedRows || []) {
      if (isSignedWeekRow(r)) signedAnchors.add(String(r.period_anchor || "").slice(0, 10));
    }

    for (const job of driverJobs) {
      await sb()
        .from("financial_outbox")
        .update({ status: "processing", attempts: (job.attempts || 0) + 1 })
        .eq("id", job.id);
      try {
        const anchor = String(job.payload?.period_anchor || "");
        const forceJob = !!job.payload?.force;
        if (anchor && !anchorsDone.has(anchor)) {
          if (signedAnchors.has(anchor) && !forceJob) {
            // Skip silent rewrite of a signed week.
          } else {
            await rebuildDriverFinancialPeriod(driverId, anchor, ctx);
          }
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
  const fromMinor = (minor: unknown, major: unknown): number => {
    if (minor != null && Number.isFinite(Number(minor))) {
      return round2(Number(minor) / 100);
    }
    return Number(major) || 0;
  };
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
    cashStillHeld: fromMinor(r.cash_still_held_minor, r.cash_still_held),
    settlementAmount: fromMinor(r.settlement_amount_minor, r.settlement_amount),
    payoutNet: fromMinor(r.payout_net_minor, r.payout_net),
    tipsPaidToDriver:
      Number(r.tips_paid_to_driver) ||
      Number(r.metadata?.financeCore?.tipsPaidToDriver) ||
      0,
    tipsWithheld:
      Number(r.tips_withheld) || Number(r.metadata?.financeCore?.tipsWithheld) || 0,
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

function isSignedWeekRow(r: {
  fuel_finalized?: unknown;
  status?: unknown;
  payout_status?: unknown;
  settlement_status?: unknown;
  toll_status?: unknown;
  toll_workflow_actionable?: unknown;
  toll_unmatched_count?: unknown;
}): boolean {
  // True money lock: payout finalized, or settled/overpaid with tolls clear — not mere fuel_finalized.
  const payoutDone = String(r.payout_status || "").toLowerCase() === "finalized";
  if (payoutDone) return true;
  const st = String(r.settlement_status || "").toLowerCase();
  if (st !== "settled" && st !== "overpaid") return false;
  const tollStatus = String(r.toll_status || "").toLowerCase();
  const tollsClear =
    (tollStatus === "reconciled" || tollStatus === "n/a") &&
    Number(r.toll_workflow_actionable || 0) === 0 &&
    Number(r.toll_unmatched_count || 0) === 0;
  return tollsClear;
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
      .select(
        "period_anchor, fuel_finalized, status, payout_status, settlement_status, toll_status, toll_workflow_actionable, toll_unmatched_count",
      )
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
      "id, period_end, cash_collected, driver_share, fuel_deduction, fuel_fleet_share, toll_cash_spend, toll_charged_to_driver, fuel_finalized, settlement_status, payout_status, toll_status, toll_workflow_actionable, toll_unmatched_count, tips_paid_to_driver, tips_withheld, metadata, status, closed_at",
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

  const aliasIds = await resolveDriverAliasIds(driverId);
  const idSet = new Set(aliasIds.map(String));
  const driverTxAll = await loadDriverTransactionsForSettlement(driverId, idSet);
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

  const meta = (existing.metadata || {}) as Record<string, unknown>;
  const fc = (meta.financeCore || {}) as Record<string, unknown>;
  const tipsPaidToDriver = round2(
    Math.max(
      0,
      Number(existing.tips_paid_to_driver) ||
        Number(fc.tipsPaidToDriver) ||
        0,
    ),
  );

  // Prefer explicit wash metadata; legacy rows stored wash in toll_cash_spend.
  const hasWashMeta =
    fc.tollCashWashEligible != null && Number.isFinite(Number(fc.tollCashWashEligible));
  const tollCashWash = round2(
    Math.max(
      0,
      hasWashMeta ? Number(fc.tollCashWashEligible) : Number(existing.toll_cash_spend) || 0,
    ),
  );

  const settled = computePeriodSettlement({
    driverShare: Number(existing.driver_share) || 0,
    fuelDeduction: Number(existing.fuel_deduction) || 0,
    baseCashOwed: Number(existing.cash_collected) || 0,
    baseCashPaid: cashReturned,
    tollCashWash,
    tollPersonal: Math.max(0, Number(existing.toll_charged_to_driver) || 0),
    fuelCredits: Number(existing.fuel_fleet_share) || 0,
    cashWrittenOff,
    settlementPaid: settlementPaidRaw,
    tipsPaidToDriver,
  });

  const fuelFinalized = !!existing.fuel_finalized;
  const tollStatus = String(existing.toll_status || "n/a");
  const tollWorkflowActionable = Number(existing.toll_workflow_actionable || 0);
  const tollUnmatchedCount = Number(existing.toll_unmatched_count || 0);
  const forceMeta = (meta.forceRelease || {}) as Record<string, unknown>;
  const forceRelease = !!forceMeta.at || !!meta.forceReleasedAt;

  const derived = derivePeriodStatus({
    fuelFinalized,
    forceRelease,
    settled,
    tolls: { tollStatus, tollWorkflowActionable, tollUnmatchedCount },
  });
  const cashStillHeld = derived.cashStillHeld;
  const settlementStatus = derived.settlementStatus;
  const payoutStatus = derived.payoutStatus;
  const periodStatus = derived.periodStatus;
  const tollsClear = derived.tollsClear;
  const moneyUnlocked = derived.moneyUnlocked;

  const prevPaid = Number(existing.settlement_paid) || 0;
  const periodMetadata = buildPeriodMetadata({
    priorMeta: meta,
    prevSettlementPaid: prevPaid,
    settled,
    derived,
    financeCore: {
      tipsPaidToDriver,
      overpaidAmount: settled.overpaidAmount,
      tollCashWashEligible: tollCashWash,
      tollsClear,
      moneyUnlocked,
      cashHeldClamped: settled.adjCashBalance < -0.005,
      unclampedCashHeld: round2(settled.adjCashBalance),
    },
  });

  const cashPersist = buildCashSettlementPersistFields({
    cashReturned,
    cashWrittenOff,
    settled,
    derived: {
      settlementStatus,
      payoutStatus,
      periodStatus: periodStatus as "open" | "closed" | "reopened",
      cashStillHeld,
      tollsClear,
      moneyUnlocked,
    },
    metadata: periodMetadata,
    existingClosedAt: existing.closed_at as string | null | undefined,
  });

  await updatePeriodCashWithVersion(driverId, periodAnchor, cashPersist);
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
  /** Reporting flag — badge on desk; does not change queue routing. */
  overpaidAmount?: number;
  cashSourceMismatch?: number;
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
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count, metadata",
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
  return (data || []).map((r: any) => {
    const oa = Number(r.metadata?.financeCore?.overpaidAmount);
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
      overpaidAmount: Number.isFinite(oa) && oa > 0 ? oa : 0,
    };
  });
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
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count, metadata",
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
  return (data || []).map((r: any) => {
    const oa = Number(r.metadata?.financeCore?.overpaidAmount);
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
      overpaidAmount: Number.isFinite(oa) && oa > 0 ? oa : 0,
    };
  });
}

/** Closed weeks (residual ≈ 0) — Driver Settlements → Reconciled tab. */
export type ReconciledPeriodRow = CompanyOwesPeriodRow & {
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  tollChargedToDriver: number;
  tollCashSpend: number;
  cashWrittenOff: number;
  tipsPaidToDriver: number;
  tipsWithheld: number;
  cashSourceMismatch: number;
};

/**
 * Settled weeks only — Driver Settlements → Reconciled tab.
 * Overpaid recovery weeks stay on Collect via driver_owes residual.
 */
export async function listReconciledSettlementPeriods(opts?: {
  periodStart?: string;
  periodEnd?: string;
  minAmount?: number;
  limit?: number;
  organizationId?: string | null;
}): Promise<ReconciledPeriodRow[]> {
  const limit = Math.min(Math.max(Number(opts?.limit) || 500, 1), 2000);
  let q = sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, cash_written_off, payout_net, settlement_status, fuel_finalized, trip_count, earnings_gross, driver_share, fleet_share, driver_share_percent, fuel_deduction, fuel_fleet_share, toll_charged_to_driver, toll_cash_spend, tips_paid_to_driver, tips_withheld, metadata",
    )
    .eq("settlement_status", "settled")
    .order("period_anchor", { ascending: false })
    .order("driver_id", { ascending: true })
    .limit(limit);

  if (opts?.organizationId) {
    q = q.eq("organization_id", opts.organizationId);
  }
  if (opts?.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodStart)) {
    q = q.gte("period_anchor", opts.periodStart);
  }
  if (opts?.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(opts.periodEnd)) {
    q = q.lte("period_anchor", opts.periodEnd);
  }
  // Activity floor — residual is ~0 on reconciled weeks, so use gross earnings.
  if (opts?.minAmount != null && Number(opts.minAmount) > 0) {
    q = q.gte("earnings_gross", Number(opts.minAmount));
  }

  const { data, error } = await q;
  if (error) {
    console.error("[DriverFinancialPeriods] reconciled list:", error.message);
    throw new Error(error.message);
  }
  return (data || []).map((r: any) => ({
    ...mapPeriodListRow(r),
    earningsGross: Number(r.earnings_gross) || 0,
    driverShare: Number(r.driver_share) || 0,
    fleetShare: Number(r.fleet_share) || 0,
    driverSharePercent: Number(r.driver_share_percent) || 0,
    fuelDeduction: Number(r.fuel_deduction) || 0,
    fuelFleetShare: Number(r.fuel_fleet_share) || 0,
    tollChargedToDriver: Number(r.toll_charged_to_driver) || 0,
    tollCashSpend: Number(r.toll_cash_spend) || 0,
    cashWrittenOff: Number(r.cash_written_off) || 0,
    tipsPaidToDriver:
      Number(r.tips_paid_to_driver) ||
      Number(r.metadata?.financeCore?.tipsPaidToDriver) ||
      0,
    tipsWithheld:
      Number(r.tips_withheld) || Number(r.metadata?.financeCore?.tipsWithheld) || 0,
    cashSourceMismatch: Number(r.metadata?.financeCore?.cashSourceMismatch) || 0,
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
  const mismatch = Number(r.metadata?.financeCore?.cashSourceMismatch);
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
    cashSourceMismatch: Number.isFinite(mismatch) ? mismatch : 0,
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
      "driver_id, period_anchor, period_end, settlement_amount, settlement_paid, cash_collected, cash_returned, cash_still_held, payout_net, settlement_status, fuel_finalized, trip_count, metadata",
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
    const oa = Number(r.metadata?.financeCore?.overpaidAmount);
    return {
      ...row,
      amountOwed: Math.abs(row.settlementAmount),
      overpaidAmount: Number.isFinite(oa) && oa > 0 ? oa : 0,
    };
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
    .gt("cash_still_held", STATUS_CASH_HELD_EPS)
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
    .select(
      "driver_id, period_anchor, fuel_finalized, status, payout_status, settlement_status, toll_status, toll_workflow_actionable, toll_unmatched_count",
    )
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

/**
 * Ops override: unlock Pay / settlement statuses before tolls are clear.
 * Requires a non-empty reason; audited in period metadata.forceRelease.
 */
export async function forceReleaseDriverPeriod(params: {
  driverId: string;
  periodAnchor: string;
  reason: string;
  releasedBy?: string | null;
}): Promise<DriverFinancialPeriodRow> {
  const reason = String(params.reason || "").trim();
  if (!params.driverId || !/^\d{4}-\d{2}-\d{2}$/.test(params.periodAnchor)) {
    throw new Error("driverId and periodAnchor required");
  }
  if (!reason) throw new Error("Force release requires a reason");

  const { data: existing, error } = await sb()
    .from("driver_financial_periods")
    .select("metadata")
    .eq("driver_id", params.driverId)
    .eq("period_anchor", params.periodAnchor)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) throw new Error("Period not found");

  const meta = (existing.metadata || {}) as Record<string, unknown>;
  const nextMeta = {
    ...meta,
    forceRelease: {
      at: new Date().toISOString(),
      by: params.releasedBy || null,
      reason,
    },
    forceReleasedAt: new Date().toISOString(),
    forceReleasedBy: params.releasedBy || null,
    forceReleaseReason: reason,
  };
  const { error: updErr } = await sb()
    .from("driver_financial_periods")
    .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
    .eq("driver_id", params.driverId)
    .eq("period_anchor", params.periodAnchor);
  if (updErr) throw new Error(updErr.message);

  const ctx = await loadRebuildContext(params.driverId);
  ctx.periodMetaByAnchor?.set(params.periodAnchor, nextMeta);
  return rebuildDriverFinancialPeriod(params.driverId, params.periodAnchor, {
    ...ctx,
    forceRelease: true,
    persistLines: true,
  } as RebuildContext);
}
