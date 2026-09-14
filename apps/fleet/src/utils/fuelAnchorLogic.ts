/** Capacity-close + SPLIT math — canonical in @roam/fuel-core. */
export {
  SOFT_ANCHOR_THRESHOLD,
  CAPACITY_CLOSE_THRESHOLD,
  isNonTankCycleEntry,
  resolveTankCapacity,
  classifyAnchor,
  mintCycleId,
  isStableCycleId,
  resolveCycleIdForOpenCycle,
  resolveNextCycleIdAfterAnchor,
  type AnchorClassifyInput,
  type AnchorClassifyResult,
} from '@roam/fuel-core/fuelAnchorLogic';
