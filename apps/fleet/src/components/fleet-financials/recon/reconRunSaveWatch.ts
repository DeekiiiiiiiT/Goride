import type { ReconRunPayload } from '../../../services/reconApi';

export const WATCH_AFTER_SAVE_MS = 3 * 60 * 1000;
export const WATCH_EVERY_MS = 3000;

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
      return false;
    }
    return WATCH_EVERY_MS;
  }
  return false;
}