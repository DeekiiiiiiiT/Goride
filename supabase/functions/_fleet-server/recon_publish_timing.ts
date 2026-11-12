/**
 * WRA-27 (timing part): when the calculator may publish a week's desk.
 * - Wait for 45 s with no new change to that week, so a burst of changes becomes one publish.
 * - A user hold (recon.week_publish_holds.hold_until) delays the publish,
 *   but never for more than 15 minutes in a row (held_since).
 * Pure: the worker passes the times in.
 */
export const DESK_QUIET_MS = 45_000;
export const DESK_HOLD_CAP_MS = 15 * 60_000;

export type DeskPublishDecision =
  | { publish: true; reason: "quiet" | "hold_cap_reached" }
  | { publish: false; retryInSeconds: number; reason: "recent_change" | "held" };

export function decideDeskPublish(input: {
  nowMs: number;
  /** Last change to the week's facts (latest calculator unit update for the week). */
  lastChangeAtMs: number | null;
  holdUntilMs: number | null;
  heldSinceMs: number | null;
}): DeskPublishDecision {
  const { nowMs, lastChangeAtMs, holdUntilMs, heldSinceMs } = input;

  if (lastChangeAtMs != null && nowMs - lastChangeAtMs < DESK_QUIET_MS) {
    return {
      publish: false,
      retryInSeconds: Math.max(1, Math.ceil((DESK_QUIET_MS - (nowMs - lastChangeAtMs)) / 1000)),
      reason: "recent_change",
    };
  }

  if (holdUntilMs != null && holdUntilMs > nowMs) {
    const since = heldSinceMs ?? nowMs;
    const heldFor = nowMs - since;
    if (heldFor >= DESK_HOLD_CAP_MS) return { publish: true, reason: "hold_cap_reached" };
    const untilHoldEnds = holdUntilMs - nowMs;
    const untilCap = DESK_HOLD_CAP_MS - heldFor;
    return {
      publish: false,
      retryInSeconds: Math.max(1, Math.ceil(Math.min(untilHoldEnds, untilCap) / 1000)),
      reason: "held",
    };
  }

  return { publish: true, reason: "quiet" };
}
