/** Pure Close Week force-reseal flag resolution (no DB). */
export type CloseLaneForceOpts = {
  forceTollReseal?: boolean;
  forceFuelReseal?: boolean;
  forceEarningsReseal?: boolean;
};

export type PrepareWeekCloseOpts = CloseLaneForceOpts & {
  /**
   * Mass heal / explicit Refresh only: force closed→closed reseal on all three lanes.
   * Never pass this from Close — Sync owns repairs; Close verifies + freezes.
   */
  forceAllLaneReseals?: boolean;
};

export function resolveCloseLaneForceOpts(opts?: PrepareWeekCloseOpts): CloseLaneForceOpts {
  const all = Boolean(opts?.forceAllLaneReseals);
  return {
    forceFuelReseal: all || Boolean(opts?.forceFuelReseal),
    forceTollReseal: all || Boolean(opts?.forceTollReseal),
    forceEarningsReseal: all || Boolean(opts?.forceEarningsReseal),
  };
}

/**
 * Force flags for POST Close. Always empty: Close must not blind-reseal all lanes
 * (that path caused WORKER_RESOURCE_LIMIT / CPU 546). Smart sync runs via prepare
 * with these opts; Refresh/mass heal may still pass forceAllLaneReseals.
 */
export function closeWeekLaneForceOpts(): PrepareWeekCloseOpts {
  return {};
}
