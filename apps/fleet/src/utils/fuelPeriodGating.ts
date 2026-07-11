/**
 * Hard-gated step order for Consumption Reconciliation (toll-parity).
 * Only actionable counts block advance; informational never does.
 */

export type FuelStepId =
  | 'data-quality'
  | 'adjustments-disputes'
  | 'policy-check'
  | 'leakage-gap'
  | 'settlement-preview'
  | 'finalize';

export const FUEL_STEP_ORDER: FuelStepId[] = [
  'data-quality',
  'adjustments-disputes',
  'policy-check',
  'leakage-gap',
  'settlement-preview',
  'finalize',
];

export const FUEL_STEP_LABELS: Record<FuelStepId, string> = {
  'data-quality': 'Data quality',
  'adjustments-disputes': 'Adjustments & disputes',
  'policy-check': 'Policy check',
  'leakage-gap': 'Leakage & gap',
  'settlement-preview': 'Settlement preview',
  finalize: 'Finalize',
};

export interface FuelStepCounts {
  actionable: number;
  informational: number;
}

export function emptyFuelStepCounts(): Record<FuelStepId, FuelStepCounts> {
  return {
    'data-quality': { actionable: 0, informational: 0 },
    'adjustments-disputes': { actionable: 0, informational: 0 },
    'policy-check': { actionable: 0, informational: 0 },
    'leakage-gap': { actionable: 0, informational: 0 },
    'settlement-preview': { actionable: 0, informational: 0 },
    finalize: { actionable: 0, informational: 0 },
  };
}

export function canAdvanceFuelStep(
  step: FuelStepId,
  counts: Record<FuelStepId, FuelStepCounts>,
): boolean {
  return (counts[step]?.actionable ?? 0) === 0;
}

export function fuelActionableTotal(counts: Record<FuelStepId, FuelStepCounts>): number {
  return FUEL_STEP_ORDER.reduce((sum, id) => sum + (counts[id]?.actionable ?? 0), 0);
}

export interface FuelGatedStepState {
  id: FuelStepId;
  locked: boolean;
  complete: boolean;
  isCurrent: boolean;
  actionable: number;
  informational: number;
}

/** Same hard-gate machine as toll computeGatedStepStates. */
export function computeFuelGatedStepStates(
  counts: Record<FuelStepId, FuelStepCounts>,
  order: FuelStepId[] = FUEL_STEP_ORDER,
): FuelGatedStepState[] {
  const states: FuelGatedStepState[] = [];
  let earlierHasActionable = false;
  for (const id of order) {
    const { actionable, informational } = counts[id];
    const complete = actionable === 0;
    const locked = earlierHasActionable;
    states.push({ id, locked, complete, isCurrent: false, actionable, informational });
    if (!complete) earlierHasActionable = true;
  }
  const currentIdx = states.findIndex((s) => !s.locked && !s.complete);
  if (currentIdx >= 0) states[currentIdx].isCurrent = true;
  return states;
}

export function pickInitialFuelStep(states: FuelGatedStepState[]): FuelStepId {
  const current = states.find((s) => s.isCurrent);
  if (current) return current.id;
  return (states[states.length - 1] ?? states[0]).id;
}
