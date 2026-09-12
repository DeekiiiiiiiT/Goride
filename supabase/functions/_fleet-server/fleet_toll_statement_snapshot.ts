/**
 * Fleet toll P&L snapshot for Statement Summary — same spend/credit/charge rules
 * as Toll Recon week cards (plaza tag spend + cash-wash extras + trip credits).
 * Statement must never invent these from platform earnings ledger fold.
 */
import { isTollIncludedInSpend } from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import type { FleetTollSnapshot } from "../../../packages/finance-core/src/statementTollNetting.ts";
import { sumActiveTollChargedToDriverMajor } from "./toll_charged_from_financial_events.ts";
import { getOrgId } from "./org_scope.ts";
import {
  loadTollLedgerWithTrips,
  collectLinkedTripIds,
  filterByDriver,
  isReconcilableTollExpense,
  loadAllByPrefix,
} from "./toll_controller.tsx";
import type { Context } from "npm:hono";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyByPlatform(): FleetTollSnapshot["tagSpendByPlatform"] {
  return { Uber: 0, Roam: 0, InDrive: 0, Unlinked: 0 };
}

function platformBucket(p?: string | null): keyof FleetTollSnapshot["tagSpendByPlatform"] {
  const n = String(p || "").trim().toLowerCase();
  if (n === "uber") return "Uber";
  if (n === "roam") return "Roam";
  if (n === "indrive" || n === "in drive") return "InDrive";
  return "Unlinked";
}

function ymdInRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return false;
  const d = String(dateStr).slice(0, 10);
  return d >= from && d <= to;
}

/**
 * Build Recon-aligned fleet toll snapshot for [startDate, endDate] inclusive.
 * chargedToDrivers prefers wallet financial_events for the Monday week key (= startDate when Monday-aligned).
 */
export async function buildFleetTollSnapshotForRange(
  c: Context,
  opts: { startDate: string; endDate: string; driverId?: string },
): Promise<FleetTollSnapshot> {
  const { startDate, endDate, driverId } = opts;
  const empty: FleetTollSnapshot = {
    tagSpend: 0,
    tagSpendByPlatform: emptyByPlatform(),
    platformCredits: 0,
    chargedToDrivers: 0,
    netTollLoss: 0,
    periodMatched: false,
  };

  try {
    const { tollTx, trips } = await loadTollLedgerWithTrips(startDate, endDate);
    const tolls = filterByDriver(tollTx || [], driverId)
      .filter(isReconcilableTollExpense)
      .filter((tx: any) => isTollIncludedInSpend(tx))
      .filter((tx: any) => ymdInRange(tx?.date, startDate, endDate));
    const tripsScoped = filterByDriver(trips || [], driverId).filter((t: any) => {
      const anchor = t?.dropoffTime || t?.date;
      return ymdInRange(anchor, startDate, endDate);
    });

    const tripById = new Map<string, any>();
    for (const t of trips || []) {
      if (t?.id) tripById.set(String(t.id), t);
    }

    const byPlatform = emptyByPlatform();
    let tagSpend = 0;
    for (const tx of tolls) {
      const amt = Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0;
      if (amt <= 0) continue;
      tagSpend += amt;
      const linked =
        (tx.tripId && tripById.get(String(tx.tripId))) ||
        (tx as any).linkedTrip ||
        null;
      const bucket = platformBucket(linked?.platform);
      byPlatform[bucket] += amt;
    }

    const linkedTripIds = collectLinkedTripIds(tolls);
    // Cash-wash trips with no tag debit — same as Recon spend card.
    for (const t of tripsScoped) {
      if (linkedTripIds.has(String(t.id))) continue;
      if (t?.tollRefundResolution?.status !== "cash_wash") continue;
      const tc = Math.abs(Number(t.tollCharges) || 0);
      if (tc <= 0) continue;
      tagSpend += tc;
      byPlatform[platformBucket(t.platform)] += tc;
    }

    let platformCredits = 0;
    for (const t of tripsScoped) {
      if (t?.tollRefundResolution?.status === "phantom") continue;
      const tc = Math.abs(Number(t.tollCharges) || 0);
      if (tc <= 0) continue;
      platformCredits += tc;
    }

    // Prefer wallet charged-to-driver for the Monday week key (Statement weeks are Mon–Sun).
    let chargedToDrivers = 0;
    try {
      const orgId = getOrgId(c) || undefined;
      const w = await sumActiveTollChargedToDriverMajor({
        weekKey: startDate,
        driverId,
        organizationId: orgId,
      });
      if (w.hasEvents) {
        chargedToDrivers = w.charged;
      }
    } catch {
      // fall through to claims
    }

    if (!(chargedToDrivers > 0)) {
      const claims = filterByDriver((await loadAllByPrefix("claim:")) as any[], driverId);
      const tollDateById = new Map<string, string>();
      for (const tx of tolls) {
        if (tx?.id && tx?.date) tollDateById.set(String(tx.id), String(tx.date).slice(0, 10));
      }
      for (const claim of claims) {
        if (claim.status !== "Resolved" || claim.resolutionReason !== "Charge Driver") continue;
        const dateStr = claim.transactionId
          ? tollDateById.get(String(claim.transactionId))
          : String(claim.date || "").slice(0, 10);
        if (!ymdInRange(dateStr, startDate, endDate)) continue;
        chargedToDrivers += Math.abs(Number(claim.amount) || 0);
      }
    }

    const netTollLoss = round2(tagSpend - platformCredits - chargedToDrivers);
    return {
      tagSpend: round2(tagSpend),
      tagSpendByPlatform: {
        Uber: round2(byPlatform.Uber),
        Roam: round2(byPlatform.Roam),
        InDrive: round2(byPlatform.InDrive),
        Unlinked: round2(byPlatform.Unlinked),
      },
      platformCredits: round2(platformCredits),
      chargedToDrivers: round2(chargedToDrivers),
      netTollLoss,
      periodMatched: true,
    };
  } catch (e) {
    console.warn("[statement-summary] fleetTollSnapshot failed", e);
    return empty;
  }
}
