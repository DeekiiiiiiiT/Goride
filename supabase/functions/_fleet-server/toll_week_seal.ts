/**
 * Toll week seal (Close Program Pass 2).
 *
 * Publishes an immutable `toll` week_statement per active driver for an
 * org-week. Amounts MUST match Toll Reconciliation cards (C-3):
 *   Spend / Reimbursed / Charged to Drivers / Net Toll Loss
 * from `computeTollWeekNetting` over the same quarantined canonical events
 * the Toll Recon period endpoint uses — NOT stale DFP columns.
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement } from "./week_statements.ts";
import { computeTollWeekNetting } from "../../../packages/toll-core/src/tollWeekNetting.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { isTollIncludedInSpend } from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import { loadTollLedgerWithTrips } from "./toll_controller.tsx";
import { sumActiveTollChargedToDriverMajor } from "./toll_charged_from_financial_events.ts";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);

async function loadCanonicalTollEventsForDriverWeek(
  driverId: string,
  weekKey: string,
): Promise<Record<string, unknown>[]> {
  const weekEnd = periodEndForAnchor(weekKey);
  // SQL lte(effective_at, Sunday YMD) truncates to midnight and drops Sunday
  // activity. Load through next Monday, then keep Jamaica Mon–Sun membership
  // with the same filter Toll Recon uses.
  const [y, m, d] = weekEnd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextMondayYmd = next.toISOString().slice(0, 10);

  const { listAllUnifiedCanonicalEvents } = await import("../_shared/unifiedLedger/queries.ts");
  const { filterTollEventsInDateRange } = await import(
    "../../../packages/toll-core/src/tollFleetLossNetting.ts"
  );
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
    driverId,
    from: weekKey,
    to: nextMondayYmd,
    maxRows: 50_000,
  });

  const inWeek = filterTollEventsInDateRange(events, weekKey, weekEnd);

  // Same quarantine as Toll Recon periods: synthetic cash rows must not inflate cards.
  let quarantinedTollIds = new Set<string>();
  try {
    const { tollTx } = await loadTollLedgerWithTrips(weekKey, nextMondayYmd);
    quarantinedTollIds = new Set(
      (tollTx || [])
        .filter((tx: { id?: string }) => tx && !isTollIncludedInSpend(tx as never))
        .map((tx: { id?: string }) => String(tx.id || ""))
        .filter(Boolean),
    );
  } catch (e) {
    console.warn("[sealTollWeek] quarantine load failed — sealing unfiltered events", driverId, e);
  }

  if (quarantinedTollIds.size === 0) return inWeek;
  return inWeek.filter((e) => {
    const sid = String(e.sourceId || "");
    return !sid || !quarantinedTollIds.has(sid);
  });
}

export async function sealTollWeek(opts: {
  organizationId: string;
  weekKey: string; // Monday YMD
  actorId?: string;
  /** Optional: map driverId → charged-to-driver amount (major) to override events. */
  chargedAmountsMajor?: Record<string, number>;
  /** Optional per-driver netting overrides (major units). */
  nettingByDriver?: Record<
    string,
    { reimbursed?: number; netLoss?: number; spend?: number }
  >;
  /** Re-seal drivers that already have a standing toll statement (default: skip unchanged). */
  force?: boolean;
}): Promise<{ published: number }> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error("sealTollWeek requires organizationId and weekKey (YYYY-MM-DD)");
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select("driver_id, toll_spend, toll_charged_to_driver, toll_reimbursed, toll_cash_spend, toll_tag_spend")
    .eq("organization_id", organizationId)
    .eq("period_anchor", weekKey);
  if (error) throw new Error(error.message);

  let published = 0;
  for (const p of periods ?? []) {
    const driverId = String(p.driver_id || "");
    if (!driverId) continue;

    let tollSpend = round2(Number(p.toll_spend) || 0);
    let reimbursed = round2(Number(p.toll_reimbursed) || 0);
    let cashWashSpend = round2(Number(p.toll_cash_spend) || 0);
    let tagSpend = round2(Number(p.toll_tag_spend) || 0);
    let chargedToDriver = round2(Number(p.toll_charged_to_driver) || 0);
    let source = "period_columns";

    try {
      const events = await loadCanonicalTollEventsForDriverWeek(driverId, weekKey);
      if (events.length > 0) {
        const net = computeTollWeekNetting(events);
        tollSpend = round2(net.tagSpend + net.cashWashSpend);
        reimbursed = round2(net.platformReimbursed + net.disputeRecovered);
        cashWashSpend = round2(net.cashWashSpend);
        tagSpend = round2(net.tagSpend);
        chargedToDriver = round2(net.chargedToDrivers);
        source = "events";
      }
      // H-9: wallet financial_events win when present (same SoT as Toll cards).
      const wallet = await sumActiveTollChargedToDriverMajor({
        weekKey,
        driverId,
        organizationId,
      });
      if (wallet.hasEvents) {
        chargedToDriver = wallet.charged;
        source = source === "events" ? "events" : "financial_events";
      }
    } catch (e) {
      console.warn("[sealTollWeek] event netting failed — falling back to period columns", driverId, e);
    }

    if (opts.chargedAmountsMajor?.[driverId] != null) {
      chargedToDriver = round2(Number(opts.chargedAmountsMajor[driverId]));
    }
    const netting = opts.nettingByDriver?.[driverId];
    if (netting?.reimbursed != null) reimbursed = round2(netting.reimbursed);
    if (netting?.spend != null) tollSpend = round2(netting.spend);

    // C-3 identity: Spend − Reimbursed − Charged = Net loss
    const netLoss = round2(
      netting?.netLoss != null
        ? netting.netLoss
        : tollSpend - reimbursed - chargedToDriver,
    );

    const hasActivity =
      Math.abs(tollSpend) > 0.005 ||
      Math.abs(chargedToDriver) > 0.005 ||
      Math.abs(reimbursed) > 0.005;
    if (!hasActivity) continue;

    const amountsMinor = {
      totalSpend: cents(tollSpend),
      chargedToDriver: cents(chargedToDriver),
      reimbursed: cents(reimbursed),
      netLoss: cents(netLoss),
      cashWashSpend: cents(cashWashSpend),
      tagSpend: cents(tagSpend),
    };

    if (!opts.force) {
      const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "toll");
      const unchanged =
        latest &&
        latest.status === "closed" &&
        JSON.stringify(latest.amountsMinor) === JSON.stringify(amountsMinor);
      if (unchanged) continue;
    }

    await publishWeekStatement({
      kind: "toll",
      organizationId,
      driverId,
      weekKey,
      amountsMinor,
      status: "closed",
      closedBy: opts.actorId ?? "toll_week_seal",
      closeReason: source === "events" ? "toll_week_seal_events" : "toll_week_seal",
    });
    published += 1;
  }

  return { published };
}
