import { describe, expect, it } from 'vitest';
import {
  recognizePlatformGrossAndFees,
  signedLedgerAmount,
  statementEarningDelta,
} from './platformFeeRecognition';

describe('platform fee recognition', () => {
  it('a reversal fare reduces the week instead of adding again', () => {
    const recognized = recognizePlatformGrossAndFees([
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: 100,
        grossAmount: 100,
      },
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: 100,
        grossAmount: 100,
        metadata: { reversal: true },
      },
    ]);
    expect(recognized.totalGross).toBe(0);
  });

  it('does not flip a reversal a second time when the stored amount is already negative', () => {
    const recognized = recognizePlatformGrossAndFees([
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: 100,
        grossAmount: 100,
      },
      {
        platform: 'Uber',
        eventType: 'fare_earning',
        netAmount: -100,
        grossAmount: 100,
        metadata: { reversal: true },
      },
    ]);
    expect(recognized.totalGross).toBe(0);
    expect(signedLedgerAmount({
      netAmount: -100,
      metadata: { reversal: true },
    })).toBe(-100);
  });

  it('statement summary subtracts a positive reversal fare and promotion', () => {
    const fare = statementEarningDelta({
      eventType: 'fare_earning',
      netAmount: 50,
      paymentMethod: 'Cash',
      metadata: { reversal: true, cashCollected: 50 },
    });
    const promo = statementEarningDelta({
      eventType: 'promotion',
      netAmount: 95.76,
      metadata: { reversal: true },
    });
    const kept = statementEarningDelta({
      eventType: 'promotion',
      netAmount: 191.52,
    });
    expect(fare.netFare).toBe(-50);
    expect(fare.tripCount).toBe(0);
    expect(fare.cashCollected).toBe(0);
    expect(promo.promotions + kept.promotions).toBeCloseTo(95.76, 2);
  });
});
