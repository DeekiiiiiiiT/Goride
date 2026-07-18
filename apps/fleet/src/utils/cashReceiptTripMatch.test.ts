import { describe, expect, it } from 'vitest';
import {
  CASH_RECEIPT_TRIP_PROXIMITY_MINUTES,
  cashReceiptAmountsAlign,
  findCashReceiptTripCreditHits,
  isCashOrPassageReceiptToll,
  minutesOutsideTripInterval,
} from './cashReceiptTripMatch';

describe('cashReceiptTripMatch', () => {
  it('detects cash and passage receipts', () => {
    expect(isCashOrPassageReceiptToll({ paymentMethod: 'Cash' })).toBe(true);
    expect(isCashOrPassageReceiptToll({ paymentMethod: 'Tag Balance' })).toBe(false);
    expect(isCashOrPassageReceiptToll({ location: 'Passage receipt' })).toBe(true);
    expect(isCashOrPassageReceiptToll({ receiptUrl: 'https://x' })).toBe(true);
  });

  it('aligns tag/cash rate pairs within $15', () => {
    expect(cashReceiptAmountsAlign(380, 370)).toBe(true);
    expect(cashReceiptAmountsAlign(285, 275)).toBe(true);
    expect(cashReceiptAmountsAlign(380, 2400)).toBe(false);
    expect(cashReceiptAmountsAlign(380, 0)).toBe(false);
  });

  it('measures gap outside trip interval', () => {
    const start = new Date('2026-01-08T10:14:00.000Z');
    const end = new Date('2026-01-08T10:45:00.000Z');
    expect(minutesOutsideTripInterval(new Date('2026-01-08T10:30:00.000Z'), start, end)).toBe(0);
    expect(minutesOutsideTripInterval(new Date('2026-01-08T11:15:00.000Z'), start, end)).toBe(30);
  });

  it('matches Jan-style cash receipt to nearby Uber toll credit (not orphan)', () => {
    // Toll 5:48 AM local ≈ 10:48 UTC; trip 5:14 AM ≈ 10:14 UTC — ~34 min gap, $380 vs $370
    const tollDate = new Date('2026-01-08T10:48:00.000Z');
    const hits = findCashReceiptTripCreditHits({
      tollAmountAbs: 380,
      tollDate,
      trips: [
        {
          id: 'trip-a',
          tollCharges: 370,
          requestTime: '2026-01-08T10:14:00.000Z',
          dropoffTime: '2026-01-08T10:40:00.000Z',
        },
        {
          id: 'trip-noise',
          tollCharges: 0,
          requestTime: '2026-01-08T10:00:00.000Z',
          dropoffTime: '2026-01-08T10:20:00.000Z',
        },
        {
          id: 'trip-far',
          tollCharges: 370,
          requestTime: '2026-01-08T18:00:00.000Z',
          dropoffTime: '2026-01-08T18:30:00.000Z',
        },
      ],
    });

    expect(hits).toHaveLength(1);
    expect(hits[0].tripId).toBe('trip-a');
    expect(hits[0].timeDifferenceMinutes).toBeLessThanOrEqual(CASH_RECEIPT_TRIP_PROXIMITY_MINUTES);
    expect(hits[0].confidenceScore).toBeGreaterThanOrEqual(58);
  });

  it('returns empty when only distant or wrong-amount trips exist', () => {
    const hits = findCashReceiptTripCreditHits({
      tollAmountAbs: 380,
      tollDate: new Date('2026-01-08T10:48:00.000Z'),
      trips: [
        {
          id: 'wrong-amt',
          tollCharges: 2400,
          requestTime: '2026-01-08T10:14:00.000Z',
          dropoffTime: '2026-01-08T10:40:00.000Z',
        },
      ],
    });
    expect(hits).toHaveLength(0);
  });
});
