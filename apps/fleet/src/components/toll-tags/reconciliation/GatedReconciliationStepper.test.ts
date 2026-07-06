import { describe, it, expect } from 'vitest';
import { computeGatedStepStates, pickInitialStep } from './GatedReconciliationStepper';
import type { StepId, StepCounts } from '../../../utils/tollPeriodGating';

const ORDER: StepId[] = [
  'needs-review',
  'personal-use',
  'deadhead',
  'underpaid-claims',
  'dispute-refunds',
  'unlinked-refunds',
];

const counts = (overrides: Partial<Record<StepId, StepCounts>>): Record<StepId, StepCounts> => {
  const base: Record<StepId, StepCounts> = {
    'needs-review': { actionable: 0, informational: 0 },
    'personal-use': { actionable: 0, informational: 0 },
    deadhead: { actionable: 0, informational: 0 },
    'underpaid-claims': { actionable: 0, informational: 0 },
    'dispute-refunds': { actionable: 0, informational: 0 },
    'unlinked-refunds': { actionable: 0, informational: 0 },
  };
  return { ...base, ...overrides };
};

describe('computeGatedStepStates', () => {
  it('when every step is clear, nothing is locked and the last step is current', () => {
    const states = computeGatedStepStates(counts({}), ORDER);
    expect(states.every((s) => !s.locked)).toBe(true);
    expect(states.every((s) => s.complete)).toBe(true);
    // No step is "current" here — there's nothing left needing attention.
    // pickInitialStep (tested below) is what falls back to the last step.
    expect(states.find((s) => s.isCurrent)).toBeUndefined();
  });

  it('a step with actionable items is current and unlocked; every later step locks', () => {
    const states = computeGatedStepStates(
      counts({ deadhead: { actionable: 2, informational: 0 } }),
      ORDER,
    );
    const byId = Object.fromEntries(states.map((s) => [s.id, s]));
    expect(byId['needs-review'].locked).toBe(false);
    expect(byId['needs-review'].complete).toBe(true);
    expect(byId['personal-use'].locked).toBe(false);
    expect(byId['personal-use'].complete).toBe(true);
    expect(byId.deadhead.locked).toBe(false);
    expect(byId.deadhead.complete).toBe(false);
    expect(byId.deadhead.isCurrent).toBe(true);
    expect(byId['underpaid-claims'].locked).toBe(true);
    expect(byId['dispute-refunds'].locked).toBe(true);
    expect(byId['unlinked-refunds'].locked).toBe(true);
  });

  it('a completed earlier step never re-locks steps ahead of it once its own actionable count is 0', () => {
    const states = computeGatedStepStates(
      counts({ 'needs-review': { actionable: 0, informational: 3 } }),
      ORDER,
    );
    const byId = Object.fromEntries(states.map((s) => [s.id, s]));
    // informational-only never blocks — needs-review is complete/unlocked despite informational=3
    expect(byId['needs-review'].complete).toBe(true);
    expect(byId['needs-review'].locked).toBe(false);
    expect(byId['personal-use'].locked).toBe(false);
  });

  it('the FIRST step with actionable items is current, not a later one', () => {
    const states = computeGatedStepStates(
      counts({
        'needs-review': { actionable: 1, informational: 0 },
        deadhead: { actionable: 5, informational: 0 },
      }),
      ORDER,
    );
    const current = states.find((s) => s.isCurrent);
    expect(current?.id).toBe('needs-review');
    // deadhead is locked because needs-review (earlier) is still open
    expect(states.find((s) => s.id === 'deadhead')?.locked).toBe(true);
  });

  it('re-locks immediately if an earlier step regains an actionable item (no stored progress)', () => {
    const before = computeGatedStepStates(counts({}), ORDER);
    expect(before.find((s) => s.id === 'unlinked-refunds')?.locked).toBe(false);

    // Simulate a background rematch re-flagging an old needs-review toll.
    const after = computeGatedStepStates(
      counts({ 'needs-review': { actionable: 1, informational: 0 } }),
      ORDER,
    );
    expect(after.find((s) => s.id === 'unlinked-refunds')?.locked).toBe(true);
  });
});

describe('pickInitialStep', () => {
  it('resumes at the current (first non-locked, non-complete) step', () => {
    const states = computeGatedStepStates(
      counts({ 'underpaid-claims': { actionable: 4, informational: 0 } }),
      ORDER,
    );
    expect(pickInitialStep(states)).toBe('underpaid-claims');
  });

  it('lands on the last step when every step is already clear', () => {
    const states = computeGatedStepStates(counts({}), ORDER);
    expect(pickInitialStep(states)).toBe('unlinked-refunds');
  });
});
