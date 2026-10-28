/**
 * Shared TollPeriodReadiness builder (Phase 4b / enforce flip).
 * Used by GET readiness, POST finish, and driver_financial_periods close gate.
 *
 * Week-scopes step counts + card identity the same way the wizard does —
 * match-pad trips / global dispute lists must not block Finish for a clean week.
 */
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  incrementDisputeRefundCount,
  incrementLandingUnclaimedTollCount,
  incrementUnderpaidClaimCount,
  incrementUnlinkedRefundCount,
} from "../../../packages/toll-core/src/tollPeriodCounts.ts";
import { isDisputeRefundMatched } from "../../../packages/toll-core/src/tollPeriodDisputeHelpers.ts";
import {
  cashWashTripSpendAmount,
  ledgerDebitSpendAmount,
} from "../../../packages/toll-core/src/tollSpend.ts";
import {
  computeTollPeriodReadiness,
  type TollPeriodReadiness,
} from "../../../packages/toll-core/src/tollPeriodReadiness.ts";
import { scopeTollReadinessWeekInputs } from "../../../packages/toll-core/src/tollPeriodReadinessScope.ts";
import type { StepCounts, StepId } from "../../../packages/toll-core/src/tollPeriodStepTypes.ts";
import { sumActiveTollChargedToDriverMajor } from "./toll_charged_from_financial_events.ts";
import { resolvePeriodBucket } from "./toll_period_bucket.ts";
import {
  loadTollLedgerWithTrips,
  isUnresolvedRefund,
  collectLinkedTripIds,
  loadDisputeRefundRecords,
  filterByDriver,
  loadAllByPrefix,
  isReconcilableTollExpense,
} from "./toll_period_inputs.ts";
import { buildUnresolvedRefundSuggestionStatuses } from "./toll_refund_classify.ts";
import { getFleetTimezone } from "./timezone_helper.tsx";

const STEP_IDS: StepId[] = [
  "needs-review",
  "personal-use",
  "deadhead",
  "unlinked-refunds",
  "dispute-refunds",
  "underpaid-claims",
];

function zeroCounts(): Record<StepId, StepCounts> {
  const counts = {} as Record<StepId, StepCounts>;
  for (const id of STEP_IDS) counts[id] = { actionable: 0, informational: 0 };
  return counts;
}

/** In-request memo so period rebuilds for many drivers don't re-scan the week N times. */
const readinessMemo = new Map<string, Promise<{ readiness: TollPeriodReadiness; counts: Record<StepId, StepCounts> }>>();

export function clearTollReadinessMemo(): void {
  readinessMemo.clear();
}

export async function buildWeekReadiness(opts: {
  weekKey: string;
  orgId: string | null | undefined;
  driverId?: string;
}): Promise<{ readiness: TollPeriodReadiness; counts: Record<StepId, StepCounts> }> {
  const weekKey = String(opts.weekKey).slice(0, 10);
  const driverId = opts.driverId ? String(opts.driverId) : "";
  const memoKey = `${opts.orgId || ""}|${weekKey}|${driverId}`;
  const hit = readinessMemo.get(memoKey);
  if (hit) return hit;

  const pending = (async () => {
    const weekEnd = periodEndForAnchor(weekKey);
    const [y, m, d] = weekEnd.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    const nextMondayYmd = next.toISOString().slice(0, 10);
    const fleetTz = await getFleetTimezone();

    // Pad load kept for hard-link detection across week edges; counts use week slice.
    const loaded = await loadTollLedgerWithTrips(weekKey, nextMondayYmd);
    let tollTx = loaded.tollTx || [];
    let trips = loaded.trips || [];
    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId);
      trips = filterByDriver(trips, driverId);
    }

    const linkedTripIds = collectLinkedTripIds(tollTx);
    const disputeRefundsAll = await loadDisputeRefundRecords();
    const disputeRefunds = driverId
      ? filterByDriver(disputeRefundsAll, driverId)
      : disputeRefundsAll;

    let claimsAll: any[] = [];
    try {
      claimsAll = ((await loadAllByPrefix("claim:")) || []) as any[];
      if (driverId) claimsAll = filterByDriver(claimsAll, driverId);
    } catch (e) {
      console.warn("[toll-readiness] claim load skipped", e);
    }

    const {
      weekTolls,
      weekTrips,
      weekDisputes,
      weekClaims,
    } = scopeTollReadinessWeekInputs({
      weekKey,
      fleetTz,
      tollTx,
      trips,
      disputeRefunds,
      claims: claimsAll,
    });

    // Unlinked: only trips whose calendar week is this period (not ±2d pad).
    const unclaimedRefundTrips = weekTrips.filter((t: any) =>
      isUnresolvedRefund(t, linkedTripIds),
    );

    const counts = zeroCounts();
    for (const tx of weekTolls) {
      if (!isReconcilableTollExpense(tx)) continue;
      if (tx.isReconciled && tx.tripId) continue;
      const bucket = resolvePeriodBucket(tx);
      incrementLandingUnclaimedTollCount(counts, tx, bucket);
    }

    for (const claim of weekClaims) {
      const toll = claim.transactionId
        ? tollTx.find((t: any) => String(t.id) === String(claim.transactionId))
        : undefined;
      incrementUnderpaidClaimCount(counts, claim, toll, disputeRefunds);
    }

    for (const r of weekDisputes) {
      incrementDisputeRefundCount(counts, r);
    }

    const unlinkedSuggestionByTripId = await buildUnresolvedRefundSuggestionStatuses(
      unclaimedRefundTrips,
    );
    for (const t of unclaimedRefundTrips) {
      incrementUnlinkedRefundCount(counts, t, {
        suggestionStatus: unlinkedSuggestionByTripId.get(String(t.id)) ?? null,
      });
    }

    // Card identity: same week slice as step counts (pad must not skew residual).
    let tollSpend = 0;
    let reimbursed = 0;
    let charged = 0;
    for (const tx of weekTolls) {
      tollSpend += ledgerDebitSpendAmount(tx);
    }
    for (const t of weekTrips) {
      tollSpend += cashWashTripSpendAmount(t, linkedTripIds);
      const status = t.tollRefundResolution?.status;
      if (status === "phantom") continue;
      const tc = Math.abs(Number(t.tollCharges) || 0);
      if (tc > 0) reimbursed += tc;
    }
    for (const r of weekDisputes) {
      if (!isDisputeRefundMatched(r)) continue;
      reimbursed += Math.abs(Number(r.amount) || 0);
    }
    try {
      const w = await sumActiveTollChargedToDriverMajor({
        weekKey,
        driverId: driverId || undefined,
        organizationId: opts.orgId || undefined,
      });
      if (w.hasEvents) charged = w.charged;
    } catch {
      /* ignore */
    }
    const cardsNetLoss = Math.round((tollSpend - reimbursed - charged) * 100) / 100;

    let eventsNetLoss = cardsNetLoss;
    try {
      const orgId = String(opts.orgId || "").trim();
      if (!orgId) throw new Error("org required for toll readiness ledger totals");
      // Totals-only: week_summary for toll entry types (no row scan).
      const { weekSummary, sumWeekSummaryMajor } = await import("../_shared/unifiedLedger/readApi.ts");
      const tollTypes = [
        "toll_charge",
        "toll_refund",
        "toll_charge_offset",
        "toll_reimbursement",
        "toll_charged_to_driver",
        "toll_charge_reversed",
      ];
      const summary = await weekSummary({
        organizationId: orgId,
        from: `${String(weekKey).slice(0, 10)}T00:00:00.000Z`,
        to: `${String(weekEnd).slice(0, 10)}T23:59:59.999Z`,
        entryTypes: tollTypes,
        products: ["roam_driver", "roam_fleet"],
        ...(driverId ? { driverIds: [driverId] } : {}),
      });
      const charge = sumWeekSummaryMajor(
        summary.filter((r) => r.entry_type === "toll_charge"),
        "abs_sum_minor",
      );
      const refund = sumWeekSummaryMajor(
        summary.filter((r) =>
          r.entry_type === "toll_refund" ||
          r.entry_type === "toll_reimbursement" ||
          r.entry_type === "toll_charge_offset"
        ),
        "abs_sum_minor",
      );
      const charged = sumWeekSummaryMajor(
        summary.filter((r) =>
          r.entry_type === "toll_charged_to_driver" || r.entry_type === "toll_charge_reversed"
        ),
        "abs_sum_minor",
      );
      eventsNetLoss = Math.round((charge - refund - charged) * 100) / 100;
    } catch (e) {
      console.warn("[toll-readiness] events netting skipped", e);
    }

    const readiness = computeTollPeriodReadiness({
      weekKey,
      steps: counts,
      cardsNetLoss,
      eventsNetLoss,
    });
    return { readiness, counts };
  })();

  readinessMemo.set(memoKey, pending);
  try {
    return await pending;
  } catch (e) {
    readinessMemo.delete(memoKey);
    throw e;
  }
}
