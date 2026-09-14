/** Tank cycle close policy — canonical in @roam/fuel-core. */
export {
  SINGLE_FILL_FULL_THRESHOLD,
  resolveCycleCloseMode,
  evaluateCycleClose,
  closeOpenCycleAtWeekBoundary,
  type CycleCloseMode,
  type CycleCloseReason,
  type CloseDecision,
} from '@roam/fuel-core/fuelCycleClosePolicy';
