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
