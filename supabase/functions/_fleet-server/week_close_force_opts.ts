/** Pure Close Week force-reseal flag resolution (no DB). */
export type CloseLaneForceOpts = {
  forceTollReseal?: boolean;
  forceFuelReseal?: boolean;
  forceEarningsReseal?: boolean;
};

export type PrepareWeekCloseOpts = CloseLaneForceOpts & {
  /** Mass heal / Close: force closed→closed reseal on all three lanes. */
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
