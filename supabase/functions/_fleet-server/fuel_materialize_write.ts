/**
 * Decide what POST …/fuel/periods/:id/materialize may write.
 * Finalize owns money from finalized_report snaps — never client-body fallback.
 */

export type MaterializeWriteDecision =
  | { mode: "locked" }
  | { mode: "counts_only"; money: "pending_finalize" }
  | { mode: "full_money" };

export function decideMaterializeWrite(opts: {
  periodLocked: boolean;
  snapMoneyOk: boolean;
}): MaterializeWriteDecision {
  if (opts.periodLocked) return { mode: "locked" };
  if (!opts.snapMoneyOk) return { mode: "counts_only", money: "pending_finalize" };
  return { mode: "full_money" };
}
