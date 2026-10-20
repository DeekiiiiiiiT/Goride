import { describe, expect, it } from 'vitest';
import { evaluateRun } from './evaluateRun.ts';

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
        trips_earnings: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: '' },
        { stepId: 'attribution', inputsHashAtComplete: '' },
        { stepId: 'trips_earnings', inputsHashAtComplete: priorTripsHash },
      ],
    });
    const trips = result.steps.find((s) => s.id === 'trips_earnings');
    expect(trips?.status).toBe('stale');
    expect(result.nextAction.label).toMatch(/Re-review/);
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
        trips_earnings: zero,
        tolls: zero,
        tag_account: zero,
      },
      completedSteps: [
        { stepId: 'sources', inputsHashAtComplete: 's' },
        { stepId: 'attribution', inputsHashAtComplete: 'a' },
        {
          stepId: 'trips_earnings',
          inputsHashAtComplete:
            'indrive_trips::|roam_trips::|rush_deliveries::|uber_bundle:u1:received',
        },
        { stepId: 'tolls', inputsHashAtComplete: priorTollsHash },
      ],
    });
    const tolls = result.steps.find((s) => s.id === 'tolls');
    expect(tolls?.status).toBe('stale');
  });
});
