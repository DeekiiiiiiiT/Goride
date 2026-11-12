/**
 * One wake does a chunk of work, then returns.
 * The database calls again a minute later if the queue is still there.
 * The edge function that places the call cannot stay open for an hour,
 * so a single wake stops after this budget and the next minute continues.
 */
export const RECON_WAKE_BUDGET_MS = 90_000;

export function wakeShouldReturn(input: {
  processed: number;
  workflows: number;
  elapsedMs: number;
  budgetMs?: number;
}): boolean {
  const budget = input.budgetMs ?? RECON_WAKE_BUDGET_MS;
  if (input.elapsedMs >= budget) return true;
  return input.processed === 0 && input.workflows === 0;
}

/**
 * Rev 24: true when a close workflow's state, step or message changed in this pass.
 * A close that is only waiting is not work (see advanceOpenCloseWorkflows).
 */
export function workflowMoved(
  before: { state: string; step: string; error?: string | null },
  after: { state: string; step: string; error?: string | null },
): boolean {
  return before.state !== after.state || before.step !== after.step || (before.error ?? null) !== (after.error ?? null);
}
