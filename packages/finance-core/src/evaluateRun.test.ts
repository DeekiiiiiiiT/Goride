import { describe, expect, it } from 'vitest';
import { evaluateRun, hiddenLaneSteps } from './evaluateRun.ts';

describe('evaluateRun', () => {
  it('locks tolls while toll usage source is missing', () => {
    const result = evaluateRun({
      sources: [
        { id: 'toll_usage', status: 'missing' },
        { id: 'uber_bundle', status: 'received' },
      ],
      stepCounts: {
        sources: { actionable: 0, informational: 0 },
        tolls: { actionable: 2, informational: 0 },
      },
      completedSteps: [],
    });
    const tolls = result.steps.find((s) => s.id === 'tolls');
    expect(tolls?.status).toBe('locked');
    expect(tolls?.lockedBy?.kind).toBe('source');
    expect(result.nextAction.kind).toBe('source');
    expect(result.nextAction.targetId).toBe('toll_usage');
  });

  it('marks a step stale when feeding source hash changes after complete', () => {
    const zero = { actionable: 0, informational: 0 };
    const priorTripsHash =
      'indrive_trips::|roam_trips::|rush_deliveries::|uber_bundle:hash-v1:received';
    const result = evaluateRun({
      sources: [{ id: 'uber_bundle', status: 'received', inputHash: 'hash-v2' }],
      stepCounts: {
        sources: zero,
        attribution: zero,
        tolls: zero,
        tag_account: zero,
        fuel: zero,
        trips_earnings: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
        { stepId: 'tolls', inputsHashAtComplete: '' },
        { stepId: 'tag_account', inputsHashAtComplete: '' },
        { stepId: 'fuel', inputsHashAtComplete: '' },
        { stepId: 'trips_earnings', inputsHashAtComplete: priorTripsHash },
      ],
    });
    const trips = result.steps.find((s) => s.id === 'trips_earnings');
    expect(trips?.status).toBe('stale');
    expect(result.nextAction.label).toMatch(/Re-review/);
  });

  it('WRA-17: fuel with nothing left to do is ready, not complete, until it is completed', () => {
    const zero = { actionable: 0, informational: 0 };
    const base = {
      sources: [],
      stepCounts: {
        sources: zero,
        attribution: zero,
        tolls: zero,
        tag_account: zero,
        fuel: zero,
      },
    };
    const before = evaluateRun({
      ...base,
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
        { stepId: 'tolls', inputsHashAtComplete: '' },
        { stepId: 'tag_account', inputsHashAtComplete: '' },
      ],
    });
    expect(before.steps.find((s) => s.id === 'fuel')?.status).toBe('ready');
    expect(before.steps.find((s) => s.id === 'trips_earnings')?.status).toBe('locked');

    const after = evaluateRun({
      ...base,
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
        { stepId: 'tolls', inputsHashAtComplete: '' },
        { stepId: 'tag_account', inputsHashAtComplete: '' },
        { stepId: 'fuel', inputsHashAtComplete: '' },
      ],
    });
    expect(after.steps.find((s) => s.id === 'fuel')?.status).toBe('complete');
  });

  it('WRA-19: hidden lane steps show as complete and never lock later steps', () => {
    const zero = { actionable: 0, informational: 0 };
    const result = evaluateRun({
      sources: [{ id: 'rush_deliveries', status: 'received' }],
      stepCounts: {
        sources: zero,
        attribution: zero,
        // A probe can still count work on a step that does not apply; hidden wins.
        tolls: { actionable: 1, informational: 0 },
        tag_account: zero,
        fuel: { actionable: 1, informational: 0 },
        trips_earnings: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
      ],
      hiddenSteps: ['tolls', 'tag_account', 'fuel'],
    });
    for (const id of ['tolls', 'tag_account', 'fuel']) {
      const step = result.steps.find((s) => s.id === id);
      expect(step?.hidden, id).toBe(true);
      expect(step?.status, id).toBe('complete');
      expect(step?.actionable, id).toBe(0);
    }
    expect(result.steps.find((s) => s.id === 'trips_earnings')?.status).toBe('ready');
  });

  it('WRA-19: hiddenLaneSteps hides only lane steps with no applicable feeding source and no blockers', () => {
    // Delivery: only Rush sources apply → tolls, tag account and fuel are hidden.
    expect(hiddenLaneSteps({ applicableSourceIds: ['rush_deliveries', 'cod_remittance'], blockerStepIds: [] }))
      .toEqual(['tolls', 'tag_account', 'fuel']);
    // Rideshare main line with toll tags and fuel: nothing hidden.
    expect(hiddenLaneSteps({
      applicableSourceIds: ['uber_bundle', 'toll_usage', 'toll_topup', 'fuel_card_roam', 'cash_fuel'],
      blockerStepIds: [],
    })).toEqual([]);
    // Rideshare without toll tags: Tag account hidden, Tolls still fed by Uber.
    expect(hiddenLaneSteps({ applicableSourceIds: ['uber_bundle', 'cash_fuel'], blockerStepIds: [] }))
      .toEqual(['tag_account']);
    // A stored blocker on a step keeps it visible.
    expect(hiddenLaneSteps({ applicableSourceIds: ['rush_deliveries'], blockerStepIds: ['fuel'] }))
      .toEqual(['tolls', 'tag_account']);
  });

  it('keeps fuel open while it still has work', () => {
    const zero = { actionable: 0, informational: 0 };
    const result = evaluateRun({
      sources: [],
      stepCounts: {
        sources: zero,
        attribution: zero,
        tolls: zero,
        tag_account: zero,
        fuel: { actionable: 2, informational: 0 },
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
        { stepId: 'tolls', inputsHashAtComplete: '' },
        { stepId: 'tag_account', inputsHashAtComplete: '' },
      ],
    });
    expect(result.steps.find((s) => s.id === 'fuel')?.status).not.toBe('complete');
  });

  it('marks tolls stale when toll_usage hash changes after tolls step complete', () => {
    const zero = { actionable: 0, informational: 0 };
    const priorTollsHash = 'cash_tolls::|toll_usage:hash-v1:received|uber_bundle::';
    const result = evaluateRun({
      sources: [
        { id: 'toll_usage', status: 'received', inputHash: 'hash-v2' },
        { id: 'uber_bundle', status: 'received', inputHash: 'u1' },
      ],
      stepCounts: {
        sources: zero,
        attribution: zero,
        tolls: zero,
        tag_account: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: 's' },
        { stepId: 'attribution', inputsHashAtComplete: 'a' },
        { stepId: 'tolls', inputsHashAtComplete: priorTollsHash },
      ],
    });
    const tolls = result.steps.find((s) => s.id === 'tolls');
    expect(tolls?.status).toBe('stale');
  });

  // R4-05: live volume change on Covered days (coverageInputHash #r/#a) must stale tolls
  it('marks tolls stale when coverageInputHash volume part changes (late rows)', () => {
    const zero = { actionable: 0, informational: 0 };
    const dayPart = '2026-10-13:covered|2026-10-14:covered';
    const atComplete = `${dayPart}#r10#a2500`;
    const afterLate = `${dayPart}#r12#a2800`;
    const priorTollsHash =
      `cash_tolls::|toll_usage:${atComplete}:received|uber_bundle:u1:received`;
    const result = evaluateRun({
      sources: [
        { id: 'toll_usage', status: 'received', inputHash: afterLate },
        { id: 'uber_bundle', status: 'received', inputHash: 'u1' },
      ],
      stepCounts: {
        sources: zero,
        attribution: zero,
        tolls: zero,
        tag_account: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: 's' },
        { stepId: 'attribution', inputsHashAtComplete: 'a' },
        { stepId: 'tolls', inputsHashAtComplete: priorTollsHash },
      ],
    });
    const tolls = result.steps.find((s) => s.id === 'tolls');
    expect(tolls?.status).toBe('stale');
  });
});
