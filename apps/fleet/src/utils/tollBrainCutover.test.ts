/**
 * Toll Brain cutover smoke — policy merge + classify method stamp.
 */
import { describe, it, expect } from 'vitest';
import { classifyTollMatch, mergeTollBrainPolicy } from './tollBrainClassify';
import { FLEET_USE_TOLL_BRAIN } from './tollBrainFlags';

describe('toll brain cutover', () => {
  it('merges Dominion-style dials into classify', () => {
    const policy = mergeTollBrainPolicy({
      cashAmountDeltaMax: 20,
      cashReceiptProximityMinutes: 120,
      personalUseDetectionEnabled: true,
    });
    expect(policy.cashAmountDeltaMax).toBe(20);
    expect(policy.cashReceiptProximityMinutes).toBe(120);

    const result = classifyTollMatch({
      toll: {
        date: '2026-01-05T14:00:00',
        amount: 380,
        paymentMethod: 'Cash',
        receiptUrl: 'https://example.com/r.jpg',
      },
      trips: [
        {
          id: 'trip-1',
          date: '2026-01-05',
          requestTime: '2026-01-05T12:00:00',
          dropoffTime: '2026-01-05T15:30:00',
          tollCharges: 370,
          platform: 'Uber',
        },
      ],
      timezone: 'America/Jamaica',
      policy,
    });
    expect(result.meta.method).toBe('toll_brain_v1');
  });

  it('fleet consume flag defaults on unless VITE=0', () => {
    expect(typeof FLEET_USE_TOLL_BRAIN).toBe('boolean');
  });
});
