/**
 * Toll week seal (Close Program Pass 2).
 *
 * Publishes an immutable `toll` week_statement per active driver for an
 * org-week. Amounts MUST match Toll Reconciliation cards:
 *   Spend / Reimbursed / Charged to Drivers / Net Toll Loss
 * from the same plaza + trip engines the Toll Management wizard shows —
 * NOT the parallel events-netting path that inflated Reimbursed (e.g. $8,350
 * vs wizard $3,975 for Aug 24).
 */
import { getServiceClient } from "./service_client.ts";
import { publishWeekStatement, getLatestWeekStatement, RestatementDraftBlockedError } from "./week_statements.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import { isTollIncludedInSpend } from "../../../packages/finance-core/src/tollLedgerIntegrity.ts";
import { loadTollLedgerWithTrips } from "./toll_controller.tsx";
import { resolveTollCloseAmounts } from "./toll_close_amounts.ts";

function sb() {
  return getServiceClient();
}

const WEEK_KEY = (v: unknown): string => String(v ?? "").slice(0, 10);
const round2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
const cents = (n: number): number => Math.round((Number(n) || 0) * 100);

function ymdInWeek(dateStr: unknown, weekKey: string, weekEnd: string): boolean {
  const d = String(dateStr || "").slice(0, 10);
  return Boolean(d) && d >= weekKey && d <= weekEnd;
}

/**
 * Same plaza Spend / trip Reimbursed math Toll Management cards use
 * (toll_period_controller legacy loop + wizard computeReimbursedTotals).
 */
export async function loadPlazaTollCardsForDriverWeek(
  driverId: string,
  weekKey: string,
): Promise<{
  tollSpend: number;
  reimbursed: number;
  cashWashSpend: number;
  tagSpend: number;
  source: "plaza";
} | null> {
  const weekEnd = periodEndForAnchor(weekKey);
  const [y, m, d] = weekEnd.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const nextMondayYmd = next.toISOString().slice(0, 10);

  const { tollTx, trips } = await loadTollLedgerWithTrips(weekKey, nextMondayYmd);
  const driver = String(driverId || "");
  const tolls = (tollTx || []).filter((tx: Record<string, unknown>) => {
    if (!tx || !isTollIncludedInSpend(tx as never)) return false;
    if (String(tx.driverId || tx.driver_id || "") !== driver) return false;
    return ymdInWeek(tx.date, weekKey, weekEnd);
  });

  let tagSpend = 0;
  const linkedTripIds = new Set<string>();
  for (const tx of tolls) {
    const amt = Number(tx.amount) < 0 ? Math.abs(Number(tx.amount)) : 0;
    if (amt > 0) tagSpend += amt;
    const tripId = String(tx.tripId || tx.trip_id || "");
    if (tripId) linkedTripIds.add(tripId);
    const pre = String((tx as { preUnlinkedTripId?: string }).preUnlinkedTripId || "");
    if (pre) linkedTripIds.add(pre);
  }

  let reimbursed = 0;
  let cashWashSpend = 0;
  const seenTrips = new Set<string>();
  for (const t of trips || []) {
    if (String(t.driverId || t.driver_id || "") !== driver) continue;
    const id = String(t.id || "");
    if (!id || seenTrips.has(id)) continue;
    const anchor = t.dropoffTime || t.date || t.dropoff_time;
    if (!ymdInWeek(anchor, weekKey, weekEnd) && !ymdInWeek(t.date, weekKey, weekEnd)) continue;
    const tc = Math.abs(Number(t.tollCharges ?? t.toll_charges) || 0);
    if (tc <= 0) continue;
    const status = String(
      t.tollRefundResolution?.status ||
        t.toll_refund_resolution?.status ||
        "",
    );
    if (status === "phantom") continue;
    seenTrips.add(id);
    reimbursed += tc;
    if (status === "cash_wash" && !linkedTripIds.has(id)) {
      cashWashSpend += tc;
    }
  }

  // Matched dispute refunds count on the Reimbursed card (wizard parity).
  try {
    const { getByPrefix } = await import("./kv_store.tsx");
    const raw = (await getByPrefix("dispute-refund:")) || [];
    for (const r of raw as Record<string, unknown>[]) {
      if (!r || typeof r !== "object" || !r.id || !r.supportCaseId) continue;
      if (String(r.driverId || r.driver_id || "") !== driver) continue;
      const st = String(r.status || "");
      if (st !== "matched" && st !== "auto_resolved") continue;
      if (!ymdInWeek(r.date, weekKey, weekEnd)) continue;
      reimbursed += Math.abs(Number(r.amount) || 0);
    }
  } catch (e) {
    console.warn("[sealTollWeek] dispute refund load failed", driverId, e);
  }

  const tollSpend = round2(tagSpend + cashWashSpend);
  if (tollSpend < 0.005 && reimbursed < 0.005) return null;
  return {
    tollSpend,
    reimbursed: round2(reimbursed),
    cashWashSpend: round2(cashWashSpend),
    tagSpend: round2(tagSpend),
    source: "plaza",
  };
}

export async function loadCanonicalTollEventsForDriverWeek(
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
  /** H-6: shared prepare as_of — stamped on close_reason / source rows for audit. */
  asOf?: string;
}): Promise<{ published: number }> {
  const organizationId = String(opts.organizationId || "").trim();
  const weekKey = WEEK_KEY(opts.weekKey);
  if (!organizationId || !/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
    throw new Error("sealTollWeek requires organizationId and weekKey (YYYY-MM-DD)");
  }

  const { data: periods, error } = await sb()
    .from("driver_financial_periods")
    .select(
      "driver_id, toll_spend, toll_charged_to_driver, toll_reimbursed, toll_cash_spend, toll_tag_spend, metadata",
    )
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

    const meta = (p.metadata as Record<string, unknown> | null) || {};
    const fc = (meta.financeCore as Record<string, unknown> | undefined) || {};
    const periodFrozen =
      meta.periodFrozen === true ||
      meta.signedWeek === true ||
      fc.periodFrozen === true ||
      Boolean(fc.signedAt);

    try {
      // Shared preference with probeTollEngineAmounts (toll_close_amounts).
      const amounts = await resolveTollCloseAmounts({
        organizationId,
        weekKey,
        driverId,
        period: p,
      });
      tollSpend = amounts.totalSpend;
      reimbursed = amounts.reimbursed;
      cashWashSpend = amounts.cashWashSpend;
      tagSpend = amounts.tagSpend;
      chargedToDriver = amounts.chargedToDriver;
      source = amounts.source;
    } catch (e) {
      console.warn("[sealTollWeek] resolveTollCloseAmounts failed — period columns", driverId, e);
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

    const latest = await getLatestWeekStatement(organizationId, driverId, weekKey, "toll");
    const staleZeroNa =
      latest?.status === "closed" &&
      String(latest.closeReason || "") === "zero_activity_na" &&
      hasActivity;

    // Frozen weeks: late activity after N/A → intentional restatement draft (Sign restatements).
    const independent =
      source === "plaza" || source === "events" || source === "financial_events";
    let status: "draft" | "closed" = !hasActivity
      ? "closed"
      : independent
        ? "closed"
        : "draft";
    let allowRestatementDraft = false;
    if (periodFrozen && hasActivity && (staleZeroNa || opts.force)) {
      status = "draft";
      allowRestatementDraft = true;
    }

    const amountsMinor = {
      totalSpend: cents(tollSpend),
      chargedToDriver: cents(chargedToDriver),
      reimbursed: cents(reimbursed),
      netLoss: cents(netLoss),
      cashWashSpend: cents(cashWashSpend),
      tagSpend: cents(tagSpend),
    };

    const forcePublish = Boolean(opts.force) || staleZeroNa;
    if (!forcePublish) {
      const unchanged =
        latest &&
        latest.status === status &&
        JSON.stringify(latest.amountsMinor) === JSON.stringify(amountsMinor);
      if (unchanged) continue;
    }

    // Open-week unverified: never draft over a standing closed seal.
    if (status === "draft" && !allowRestatementDraft) {
      if (latest?.status === "closed" || latest?.supersedes) {
        console.warn(
          "[sealTollWeek] keeping standing closed / skip restatement draft",
          driverId,
          weekKey,
        );
        continue;
      }
    }

    const closeReason =
      status === "closed"
        ? !hasActivity
          ? "zero_activity_na"
          : source === "plaza"
            ? "toll_week_seal_plaza"
            : source === "events"
              ? "toll_week_seal_events"
              : "toll_week_seal_financial_events"
        : staleZeroNa
          ? "toll_stale_zero_na_restatement"
          : "toll_week_seal_unverified_period_columns";
    const asOfTag = opts.asOf ? `;as_of=${opts.asOf}` : "";

    try {
      await publishWeekStatement({
        kind: "toll",
        organizationId,
        driverId,
        weekKey,
        amountsMinor,
        sourceRowIds: opts.asOf ? [`as_of:${opts.asOf}`] : undefined,
        status,
        closedBy: status === "closed" ? (opts.actorId ?? "toll_week_seal") : null,
        closeReason: status === "closed" || staleZeroNa ? `${closeReason}${asOfTag}` : closeReason,
        allowRestatementDraft: allowRestatementDraft || undefined,
      });
      published += 1;
    } catch (e) {
      if (e instanceof RestatementDraftBlockedError) {
        console.warn("[sealTollWeek]", e.message);
        continue;
      }
      throw e;
    }
  }

  return { published };
}
