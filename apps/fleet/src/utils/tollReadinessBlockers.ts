/**
 * Plain-English labels for GET /toll-reconciliation/periods/:weekKey/readiness blockers.
 * Used on Close Week when the toll lane is awaiting_tolls / blocked (Phase 7).
 */
import type { StepId } from './tollPeriodGating';
import { STEP_ORDER } from './tollPeriodGating';

export type TollReadinessBlockerLike = {
  code: string;
  stepId?: string | null;
  count?: number;
  amountMajor?: number | null;
  drillPath?: string;
};

const STEP_LABELS: Record<StepId, string> = {
  'needs-review': 'Needs review',
  'personal-use': 'Personal use',
  deadhead: 'Deadhead',
  'unlinked-refunds': 'Unlinked refunds',
  'dispute-refunds': 'Dispute refunds',
  'underpaid-claims': 'Underpaid & claims',
};

export function tollReadinessBlockerLabel(blocker: TollReadinessBlockerLike): string {
  const stepId = (blocker.stepId || '') as StepId;
  if (stepId && STEP_ORDER.includes(stepId)) {
    const n = Number(blocker.count) || 0;
    const label = STEP_LABELS[stepId];
    return n > 0 ? `${label}: ${n} open` : label;
  }
  const code = String(blocker.code || '').toUpperCase();
  if (code === 'IDENTITY_RESIDUAL') {
    const amt = Number(blocker.amountMajor);
    return Number.isFinite(amt)
      ? `Cards vs ledger differ by $${Math.abs(amt).toFixed(2)}`
      : 'Money cards do not reconcile';
  }
  if (code === 'TOLL_SEAL_DRIVER_MISSING') {
    const n = Number(blocker.count) || 0;
    return n > 0 ? `Toll seal missing for ${n} driver${n === 1 ? '' : 's'}` : 'Toll seal incomplete';
  }
  return blocker.code || 'Toll blocker';
}

export function tollStepFromDrillPath(drillPath: string | null | undefined): StepId | undefined {
  if (!drillPath) return undefined;
  try {
    const q = drillPath.includes('?') ? drillPath.slice(drillPath.indexOf('?') + 1) : drillPath;
    const step = new URLSearchParams(q).get('step');
    if (step && (STEP_ORDER as string[]).includes(step)) return step as StepId;
  } catch {
    /* ignore */
  }
  return undefined;
}
