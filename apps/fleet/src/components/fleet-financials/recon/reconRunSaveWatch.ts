import type { ReconRunPayload } from '../../../services/reconApi';

export const WATCH_AFTER_SAVE_MS = 3 * 60 * 1000;
export const WATCH_EVERY_MS = 3000;
/** After the save's publish: the calculator often publishes a second time (driver checks), so keep looking. */
export const WATCH_SETTLE_MS = 10_000;
/** Page open and visible, nothing saved lately: still pick up new numbers without a refresh (reads the saved week only). */
export const WATCH_IDLE_MS = 30_000;

export type ReconRunSaveWatchCtx = {
  watchUntilMs: number;
  versionAtSave: number | null;
};

/**
 * WRA-69: after a save, poll until the week version moves past the save response
 * and the calculator has no pending units (final publish). Never stop on
 * lastComputedAt alone — the worker can write the desk more than once per change.
 */
export function reconRunSaveWatchRefetchInterval(
  data: ReconRunPayload | undefined,
  ctx: ReconRunSaveWatchCtx,
  nowMs: number,
): number | false {
  if (data?.calculatorPaused) return 8000;
  if (data?.deskReady === false) return WATCH_EVERY_MS;
  if ((data?.calculator?.pendingUnits ?? 0) > 0) return WATCH_EVERY_MS;

  if (nowMs < ctx.watchUntilMs) {
    const baseline = ctx.versionAtSave;
    const version = data?.run?.version ?? 0;
    const pending = data?.calculator?.pendingUnits ?? 0;
    if (baseline != null && version > baseline && pending === 0) {
      // Owner, 21 Nov: never stop here — a later round (driver checks) can still change a step.
      return WATCH_SETTLE_MS;
    }
    return WATCH_EVERY_MS;
  }
  // A closed week no longer changes; an open one keeps a slow look so nobody has to refresh.
  if (data?.run?.state === 'closed') return false;
  return WATCH_IDLE_MS;
}