/**
 * Toll v2 matcher runner (Part F P2-R3). Claim → pure engine → store, until the company's queue is empty.
 * The database queues records itself (triggers) whenever data arrives; this only drains the queue.
 * Called after an import (P2-R5 wires the route) and by the sweep. Service key only.
 * With `toll_disputes` off, nothing is applied (shadow suggestions only). With it on, the database may
 * link and open disputes or settle refunds when the engine marks a candidate eligible.
 */
import { matchTolls } from "../../../packages/toll-core/src/v2/matcher/index.ts";
import type { MatchBundle } from "../../../packages/toll-core/src/v2/matcher/index.ts";

export type TollRpc = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export interface MatcherRunReport {
  organizationId: string;
  rounds: number;
  stored: Record<string, number>;
  actions: { opened: number; settled: number; skipped: number };
  claimGone: number;
  queueLeft: boolean;
}

export interface MatcherRunSweepError {
  organizationId: string;
  error: string;
}

export type MatcherSweepItem = MatcherRunReport | MatcherRunSweepError;

export function isMatcherRunReport(item: MatcherSweepItem): item is MatcherRunReport {
  return !("error" in item);
}

const COUNT_KEYS = ["new", "unchanged", "replaced", "withdrawn", "skipped"] as const;

export async function runTollMatcher(
  rpc: TollRpc,
  organizationId: string,
  opts: { maxRounds?: number; limit?: number } = {},
): Promise<MatcherRunReport> {
  const maxRounds = opts.maxRounds ?? 20;
  const report: MatcherRunReport = {
    organizationId,
    rounds: 0,
    stored: Object.fromEntries(COUNT_KEYS.map((k) => [k, 0])),
    actions: { opened: 0, settled: 0, skipped: 0 },
    claimGone: 0,
    queueLeft: false,
  };
  for (let i = 0; i < maxRounds; i++) {
    const claim = await rpc("toll_sys_match_claim", { p_company: organizationId, p_limit: opts.limit ?? 500 });
    if (claim.error) throw new Error(`toll_sys_match_claim: ${claim.error.message}`);
    const bundle = claim.data as MatchBundle & { claim_id: string | null };
    if (!bundle?.claim_id) return report;

    const result = matchTolls(bundle);
    const stored = await rpc("toll_sys_match_store", {
      p_company: organizationId,
      p_claim_id: bundle.claim_id,
      p_result: result,
    });
    if (stored.error) throw new Error(`toll_sys_match_store: ${stored.error.message}`);
    report.rounds++;
    const s = (stored.data ?? {}) as Record<string, unknown>;
    if (s.status === "claim_gone") {
      report.claimGone++;
      continue;
    }
    for (const k of COUNT_KEYS) report.stored[k] += Number(s[k] ?? 0);
    const act = s.actions as { opened?: number; settled?: number; skipped?: unknown[] } | undefined;
    if (act && typeof act === "object") {
      report.actions.opened += Number(act.opened ?? 0);
      report.actions.settled += Number(act.settled ?? 0);
      if (Array.isArray(act.skipped)) report.actions.skipped += act.skipped.length;
    }
  }
  report.queueLeft = true;
  return report;
}

/** Drain every company that has queued work. */
export async function runTollMatcherSweep(rpc: TollRpc): Promise<MatcherSweepItem[]> {
  const pending = await rpc("toll_sys_match_pending", {});
  if (pending.error) throw new Error(`toll_sys_match_pending: ${pending.error.message}`);
  const rows = Array.isArray(pending.data) ? (pending.data as { organization_id: string }[]) : [];
  const out: MatcherSweepItem[] = [];
  for (const row of rows) {
    const organizationId = String(row.organization_id);
    try {
      out.push(await runTollMatcher(rpc, organizationId));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`runTollMatcherSweep failed for ${organizationId}:`, message);
      out.push({ organizationId, error: message });
    }
  }
  return out;
}
