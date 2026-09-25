import { describe, it, expect } from 'vitest';
import {
  computeTollPeriodReadiness,
  decideTollFinishAllowed,
  diffClientServerStepCounts,
  computeIdentityResidualHelpers,
} from './tollPeriodReadiness.ts';
import { incrementUnlinkedRefundCount } from './tollPeriodCounts.ts';
import type { StepId } from './tollPeriodStepTypes.ts';

function zeroSteps() {
  return {
    'needs-review': { actionable: 0, informational: 0 },
    'personal-use': { actionable: 0, informational: 0 },
    deadhead: { actionable: 0, informational: 0 },
    'underpaid-claims': { actionable: 0, informational: 0 },
    'dispute-refunds': { actionable: 0, informational: 0 },
    'unlinked-refunds': { actionable: 0, informational: 0 },
  } as Record<StepId, { actionable: number; informational: number }>;
}

describe('computeTollPeriodReadiness', () => {
  it('pending-hold unlinked refund increments actionable (product decision A)', () => {
    const steps = zeroSteps();
    incrementUnlinkedRefundCount(steps, {
      id: 't1',
      tollCharges: 275,
      tollRefundResolution: { status: 'pending' },
    } as any);
    expect(steps['unlinked-refunds']).toEqual({ actionable: 1, informational: 0 });

    const readiness = computeTollPeriodReadiness({
      weekKey: '2026-09-07',
      steps,
      cardsNetLoss: 10,
      eventsNetLoss: 10,
    });
    expect(readiness.actionableTotal).toBe(1);
    expect(readiness.blockers.some((b) => b.code === 'STEP_UNLINKED_REFUNDS')).toBe(true);
    expect(decideTollFinishAllowed(readiness).allowed).toBe(false);
  });

  it('clear readiness allows Finish Reviewed', () => {
    const readiness = computeTollPeriodReadiness({
      weekKey: '2026-09-07',
      steps: zeroSteps(),
      cardsNetLoss: 50,
      eventsNetLoss: 50,
    });
    expect(decideTollFinishAllowed(readiness)).toEqual({ allowed: true });
  });

  it('identity residual helpers compare cards vs events', () => {
    const id = computeIdentityResidualHelpers({ cardsNetLoss: 100, eventsNetLoss: 90 });
    expect(id.residual).toBe(10);
    expect(id.withinTolerance).toBe(false);
  });

  it('diffClientServerStepCounts flags mismatches', () => {
    const server = zeroSteps();
    server['unlinked-refunds'] = { actionable: 2, informational: 0 };
    const client = {
      'unlinked-refunds': { actionable: 0, informational: 2 },
    };
    expect(diffClientServerStepCounts(client, server)).toEqual(['unlinked-refunds']);
  });
});
