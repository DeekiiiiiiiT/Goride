/**
 * Shared TollPeriodReadiness builder (Phase 4b / enforce flip).
 * Used by GET readiness, POST finish, and driver_financial_periods close gate.
 */
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  filterTollEventsInDateRange,
  type TollLedgerLikeEvent,
} from "../../../packages/toll-core/src/tollFleetLossNetting.ts";
import { computeTollWeekNetting } from "../../../packages/toll-core/src/tollWeekNetting.ts";
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
  buildUnresolvedRefundSuggestionStatuses,
} from "./toll_controller.tsx";

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

    const loaded = await loadTollLedgerWithTrips(weekKey, nextMondayYmd);
    let tollTx = loaded.tollTx || [];
    let trips = loaded.trips || [];
    if (driverId) {
      tollTx = filterByDriver(tollTx, driverId);
      trips = filterByDriver(trips, driverId);
    }

    const linkedTripIds = collectLinkedTripIds(tollTx);
    const disputeRefunds = await loadDisputeRefundRecords();
    const unclaimedRefundTrips = trips.filter((t: any) => isUnresolvedRefund(t, linkedTripIds));

    const counts = zeroCounts();
    for (const tx of tollTx) {
      if (!isReconcilableTollExpense(tx)) continue;
      if (tx.isReconciled && tx.tripId) continue;
      const bucket = resolvePeriodBucket(tx);
      incrementLandingUnclaimedTollCount(counts, tx, bucket);
    }

    try {
      const claims = (await loadAllByPrefix("claim:")) || [];
      for (const claim of claims as any[]) {
        if (!claim || claim.type !== "Toll_Refund") continue;
        const toll = claim.transactionId
          ? tollTx.find((t: any) => t.id === claim.transactionId)
          : undefined;
        incrementUnderpaidClaimCount(counts, claim, toll, disputeRefunds);
      }
    } catch (e) {
      console.warn("[toll-readiness] claim load skipped", e);
    }

    for (const r of disputeRefunds) {
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

    let tollSpend = 0;
    let reimbursed = 0;
    let charged = 0;
    for (const tx of tollTx) {
      tollSpend += ledgerDebitSpendAmount(tx);
    }
    for (const t of trips) {
      tollSpend += cashWashTripSpendAmount(t, linkedTripIds);
      const status = t.tollRefundResolution?.status;
      if (status === "phantom") continue;
      const tc = Math.abs(Number(t.tollCharges) || 0);
      if (tc > 0) reimbursed += tc;
    }
    for (const r of disputeRefunds) {
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
      const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
      const events = await listAllUnifiedCanonicalEvents({
        products: ["roam_driver", "roam_fleet"],
        entryTypes: [
          "toll_charge",
          "toll_refund",
          "toll_charge_offset",
          "toll_reimbursement",
          "toll_charged_to_driver",
          "toll_charge_reversed",
        ],
        from: weekKey,
        to: weekEnd,
        maxRows: 50_000,
        ...(driverId ? { driverId } : {}),
      });
      const weekEvents = filterTollEventsInDateRange(events as TollLedgerLikeEvent[], weekKey, weekEnd);
      eventsNetLoss = computeTollWeekNetting(weekEvents).netLoss;
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
