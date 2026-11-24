/**
 * Tag account roll-forward for Week Reconciliation step 4, including starting-balance reset.
 */
import { getServiceClient, getServiceClientWithSchema } from "./service_client.ts";
import { periodEndForAnchor } from "../../../packages/finance-core/src/periodKey.ts";
import {
  buildTagAccountOpeningResetPayload,
  computeTagAccountRollForward,
  effectiveTagOpeningReset,
  tagAccountFirstWeekAfterReset,
  tagAccountOpeningFromWeeks,
  tagAccountRollAfterReset,
  tagAccountUseOldTollRecords,
  tagLedgerAmountToRollForwardParts,
  type ActiveTagAccountOpeningReset,
  type TagAccountOpeningResetEvent,
} from "../../../packages/finance-core/src/tagAccountRollForward.ts";
import { addDaysYmd } from "../../../packages/finance-core/src/ledgerMoneyAggregate.ts";

function reconDb() {
  return getServiceClientWithSchema("recon");
}

export type TagOpeningResetPublic = ActiveTagAccountOpeningReset & {
  undoable: boolean;
};

async function loadOpeningResetEventsForRun(runId: string): Promise<TagAccountOpeningResetEvent[]> {
  const { data, error } = await reconDb()
    .from("run_events")
    .select("id, kind, payload, actor, at, reason")
    .eq("run_id", runId)
    .in("kind", ["tag_account_opening_reset", "tag_account_opening_reset_undo"])
    .order("at", { ascending: true });
  if (error) throw new Error(`opening reset events read failed: ${error.message}`);
  return (data ?? []) as TagAccountOpeningResetEvent[];
}

export async function loadActiveOpeningResetForRun(
  runId: string,
): Promise<ActiveTagAccountOpeningReset | null> {
  const events = await loadOpeningResetEventsForRun(runId);
  return effectiveTagOpeningReset(events);
}

/** Newest org week before `beforeWeekKey` with an active reset (open or closed run). */
export async function loadOrgTagOpeningResetAnchor(
  orgId: string,
  beforeWeekKey: string,
): Promise<{ weekKey: string; reset: ActiveTagAccountOpeningReset } | null> {
  const recon = reconDb();
  const { data: runs, error } = await recon
    .from("week_runs")
    .select("id, week_key")
    .eq("organization_id", orgId)
    .lt("week_key", beforeWeekKey)
    .order("week_key", { ascending: false })
    .limit(20);
  if (error) throw new Error(`week runs read failed: ${error.message}`);
  for (const row of runs ?? []) {
    const weekKey = String(row.week_key).slice(0, 10);
    const runId = String(row.id);
    const reset = await loadActiveOpeningResetForRun(runId);
    if (reset) return { weekKey, reset };
  }
  return null;
}

type PriorTag = { openingMinor: number; priorWeekKey: string | null };

async function loadPriorTagClosingMinor(orgId: string, weekKey: string): Promise<PriorTag> {
  const recon = reconDb();
  const { data: priorRuns } = await recon
    .from("week_runs")
    .select("id, week_key, state")
    .eq("organization_id", orgId)
    .lt("week_key", weekKey)
    .eq("state", "closed")
    .order("week_key", { ascending: false })
    .limit(10);

  for (const row of priorRuns ?? []) {
    const runId = String(row.id);
    const priorWeekKey = String(row.week_key).slice(0, 10);
    const reset = await loadActiveOpeningResetForRun(runId);
    if (reset) {
      return { openingMinor: reset.statementClosingMinor, priorWeekKey };
    }
    const { data: events } = await recon
      .from("run_events")
      .select("payload")
      .eq("run_id", runId)
      .eq("kind", "tag_account_statement_closing")
      .order("at", { ascending: false })
      .limit(1);
    const payload = events?.[0]?.payload as { statementClosingMinor?: number } | undefined;
    const minor = payload?.statementClosingMinor;
    if (minor != null && Number.isFinite(Number(minor))) {
      return { openingMinor: Math.round(Number(minor)), priorWeekKey };
    }
  }
  return { openingMinor: 0, priorWeekKey: null };
}

export async function tagAccountWeeksFromTollSystem(
  orgId: string,
  fromWeek: string,
  toWeek: string,
): Promise<Array<{ weekKey: string; topUpsMinor: number; usageMinor: number }>> {
  if (fromWeek > toWeek) return [];
  const { data, error } = await getServiceClient().rpc("toll_sys_tag_account_weeks", {
    p_company: orgId,
    p_from: fromWeek,
    p_to: toWeek,
  });
  if (error) throw new Error(`tag account read failed: ${error.message}`);
  return ((data ?? []) as Array<{ weekKey: string; topUpsMinor: number; usageMinor: number }>).map((r) => ({
    weekKey: String(r.weekKey).slice(0, 10),
    topUpsMinor: Math.round(Number(r.topUpsMinor) || 0),
    usageMinor: Math.round(Number(r.usageMinor) || 0),
  }));
}

async function oldTollRecordsTagWeekMinor(
  orgId: string,
  weekKey: string,
): Promise<{ topUpsMinor: number; tagUsageMinor: number }> {
  const { data, error } = await getServiceClient()
    .from("fleet_toll_ledger")
    .select("amount, type, payment_method, status, metadata, payload_json")
    .eq("organization_id", orgId)
    .gte("date", weekKey)
    .lte("date", periodEndForAnchor(weekKey))
    .limit(100000);
  if (error) throw new Error(`old toll records read failed: ${error.message}`);
  let topUpsMinor = 0;
  let tagUsageMinor = 0;
  for (const row of data ?? []) {
    const payload = (row.payload_json as Record<string, unknown>) || {};
    const meta = {
      ...((row.metadata as Record<string, unknown>) || {}),
      ...((payload.metadata as Record<string, unknown>) || {}),
    };
    const parts = tagLedgerAmountToRollForwardParts({
      type: String(row.type || payload.type || ""),
      amount: Number(row.amount),
      paymentMethod: String(row.payment_method || payload.paymentMethod || ""),
      status: String(row.status || ""),
      metadata: meta as { voided?: boolean },
    });
    topUpsMinor += parts.topUpMinor;
    tagUsageMinor += parts.usageMinor;
  }
  return { topUpsMinor, tagUsageMinor };
}

async function loadStoredStatementClosing(runId: string): Promise<{
  minor: number;
  confirmedExpected: boolean;
} | null> {
  const reset = await loadActiveOpeningResetForRun(runId);
  if (reset) {
    return { minor: reset.statementClosingMinor, confirmedExpected: false };
  }
  const { data } = await reconDb()
    .from("run_events")
    .select("payload")
    .eq("run_id", runId)
    .eq("kind", "tag_account_statement_closing")
    .order("at", { ascending: false })
    .limit(1);
  const payload = data?.[0]?.payload as
    | { statementClosingMinor?: number; confirmedExpected?: boolean }
    | undefined;
  if (payload?.statementClosingMinor == null) return null;
  const n = Number(payload.statementClosingMinor);
  if (!Number.isFinite(n)) return null;
  return { minor: Math.round(n), confirmedExpected: payload.confirmedExpected === true };
}

export type TagAccountRollResponse = {
  priorWeekKey: string | null;
  carriedWeekKeys: string[];
  openingMinor: number;
  baselineOpeningMinor: number;
  openingFromStatement: boolean;
  topUpsMinor: number;
  tagUsageMinor: number;
  statementClosingMinor: number | null;
  statementConfirmedFromExpected: boolean;
  expectedClosingMinor: number;
  varianceMinor: number | null;
  ties: boolean;
  openingReset: TagOpeningResetPublic | null;
};

type RollOpts = {
  ignoreOpeningReset?: boolean;
  runState?: string | null;
};

/**
 * Baseline roll (old records + carry) or effective roll after an active opening reset on this week.
 */
export async function tagAccountRollFor(
  orgId: string,
  weekKey: string,
  runId: string | null,
  opts: RollOpts = {},
): Promise<TagAccountRollResponse> {
  let resetAnchorWeekKey: string | null = null;
  let prior: PriorTag;
  let firstWeek: string;
  if (opts.ignoreOpeningReset) {
    prior = await loadPriorTagClosingMinor(orgId, weekKey);
    firstWeek = prior.priorWeekKey ? addDaysYmd(prior.priorWeekKey, 7) : weekKey;
  } else {
    const anchor = await loadOrgTagOpeningResetAnchor(orgId, weekKey);
    resetAnchorWeekKey = anchor?.weekKey ?? null;
    if (anchor && weekKey > anchor.weekKey) {
      prior = { openingMinor: anchor.reset.statementClosingMinor, priorWeekKey: anchor.weekKey };
      firstWeek = tagAccountFirstWeekAfterReset(anchor.weekKey);
    } else {
      prior = await loadPriorTagClosingMinor(orgId, weekKey);
      firstWeek = prior.priorWeekKey ? addDaysYmd(prior.priorWeekKey, 7) : weekKey;
    }
  }

  const newSystemWeeks = await tagAccountWeeksFromTollSystem(orgId, firstWeek, weekKey);
  const useOld = opts.ignoreOpeningReset
    ? true
    : tagAccountUseOldTollRecords({ resetAnchorWeekKey, weekKey });
  const weeks = await Promise.all(
    newSystemWeeks.map(async (w) => {
      if (!useOld || w.weekKey >= weekKey || w.topUpsMinor !== 0 || w.usageMinor !== 0) return w;
      const old = await oldTollRecordsTagWeekMinor(orgId, w.weekKey);
      return { weekKey: w.weekKey, topUpsMinor: old.topUpsMinor, usageMinor: old.tagUsageMinor };
    }),
  );

  const stored = runId && !opts.ignoreOpeningReset ? await loadStoredStatementClosing(runId) : null;
  const statementClosingMinor = opts.ignoreOpeningReset ? null : (stored?.minor ?? null);

  const baselineOpening = tagAccountOpeningFromWeeks({
    weekKey,
    prior,
    weeks,
    statementClosingMinor: null,
  });

  const baselineRoll = computeTagAccountRollForward({
    openingMinor: baselineOpening.openingMinor,
    topUpsMinor: baselineOpening.topUpsMinor,
    tagUsageMinor: baselineOpening.tagUsageMinor,
    statementClosingMinor: opts.ignoreOpeningReset ? null : statementClosingMinor,
  });

  let activeReset: ActiveTagAccountOpeningReset | null = null;
  if (runId && !opts.ignoreOpeningReset) {
    activeReset = await loadActiveOpeningResetForRun(runId);
  }

  const runClosed = opts.runState === "closed";
  const openingReset: TagOpeningResetPublic | null = activeReset
    ? { ...activeReset, undoable: !runClosed }
    : null;

  if (activeReset) {
    const after = tagAccountRollAfterReset({
      topUpsMinor: baselineOpening.topUpsMinor,
      tagUsageMinor: baselineOpening.tagUsageMinor,
      reset: activeReset,
    });
    return {
      priorWeekKey: prior.priorWeekKey,
      carriedWeekKeys: baselineOpening.carriedWeekKeys,
      openingMinor: after.openingMinor,
      baselineOpeningMinor: baselineOpening.openingMinor,
      openingFromStatement: true,
      topUpsMinor: baselineOpening.topUpsMinor,
      tagUsageMinor: baselineOpening.tagUsageMinor,
      statementClosingMinor: after.statementClosingMinor,
      statementConfirmedFromExpected: false,
      expectedClosingMinor: after.expectedClosingMinor,
      varianceMinor: after.varianceMinor,
      ties: after.ties,
      openingReset,
    };
  }

  return {
    priorWeekKey: prior.priorWeekKey,
    carriedWeekKeys: baselineOpening.carriedWeekKeys,
    openingMinor: baselineOpening.openingMinor,
    baselineOpeningMinor: baselineOpening.openingMinor,
    openingFromStatement: baselineOpening.openingFromStatement,
    topUpsMinor: baselineOpening.topUpsMinor,
    tagUsageMinor: baselineOpening.tagUsageMinor,
    statementClosingMinor: opts.ignoreOpeningReset ? null : statementClosingMinor,
    statementConfirmedFromExpected: stored?.confirmedExpected === true,
    expectedClosingMinor: baselineRoll.expectedClosingMinor,
    varianceMinor: baselineRoll.varianceMinor,
    ties: baselineRoll.ties,
    openingReset,
  };
}

/** Server-side payload for tag_account_opening_reset. */
export function buildOpeningResetPayloadForWeek(roll: TagAccountRollResponse, reason: string, statementClosingMinor: number) {
  return buildTagAccountOpeningResetPayload({
    statementClosingMinor,
    previousOpeningMinor: roll.baselineOpeningMinor,
    topUpsMinor: roll.topUpsMinor,
    tagUsageMinor: roll.tagUsageMinor,
    reason,
  });
}