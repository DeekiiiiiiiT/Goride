import { describe, expect, it } from 'vitest';
import { classifyTollMatch, mergeTollBrainPolicy } from './tollBrainClassify';

describe('tollBrainClassify', () => {
  it('merges default policy', () => {
    const p = mergeTollBrainPolicy({ cashAmountDeltaMax: 20 });
    expect(p.approachMinutes).toBe(45);
    expect(p.cashAmountDeltaMax).toBe(20);
  });

  it('perfect-matches on-trip amount', () => {
    const result = classifyTollMatch({
      timezone: 'America/Jamaica',
      expectedCostAbs: 370,
      toll: {
        date: '2026-01-08T15:30:00.000Z',
        amount: -370,
        paymentMethod: 'Tag Balance',
        driverId: 'd1',
        vehicleId: 'v1',
      },
      trips: [
        {
          id: 't1',
          date: '2026-01-08T15:00:00.000Z',
          requestTime: '2026-01-08T15:00:00.000Z',
          dropoffTime: '2026-01-08T16:00:00.000Z',
          startTime: '2026-01-08T15:10:00.000Z',
          tollCharges: 370,
          platform: 'Uber',
          driverId: 'd1',
          vehicleId: 'v1',
        },
      ],
    });
    expect(result.best?.matchType).toBe('PERFECT_MATCH');
    expect(result.classification.matchStatus).toBe('matched');
    expect(result.meta.method).toBe('toll_brain_v1');
  });

  it('soft-matches cash receipt to nearby InDrive credit (not Uber-only)', () => {
    const result = classifyTollMatch({
      timezone: 'America/Jamaica',
      expectedCostAbs: 380,
      toll: {
        date: '2026-01-08T10:48:00.000Z',
        amount: -380,
        paymentMethod: 'Cash',
        location: 'Passage receipt',
        driverId: 'd1',
      },
      trips: [
        {
          id: 'indrive-1',
          date: '2026-01-08T10:14:00.000Z',
          requestTime: '2026-01-08T10:14:00.000Z',
          dropoffTime: '2026-01-08T10:40:00.000Z',
          tollCharges: 370,
          platform: 'InDrive',
          driverId: 'd1',
        },
      ],
    });
    expect(result.best?.tripId).toBe('indrive-1');
    expect(result.best?.matchType).toBe('AMOUNT_VARIANCE');
    expect(result.best?.tripPlatform).toBe('InDrive');
  });

  it('orphan personal when no trip and policy on', () => {
    const result = classifyTollMatch({
      timezone: 'America/Jamaica',
      toll: { date: '2026-01-06T15:00:00.000Z', amount: -285, paymentMethod: 'Cash' },
      trips: [],
      policy: { personalUseDetectionEnabled: true },
    });
    expect(result.classification.matchStatus).toBe('orphan_personal');
    expect(result.best?.tripId).toBe('');
  });
});
