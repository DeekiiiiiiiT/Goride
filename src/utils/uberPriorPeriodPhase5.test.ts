import { describe, it, expect } from 'vitest';
import {
  isUberTripFareAdjustOrderDescription,
  normalizeUberPaymentsTransactionDescription,
} from './uberTripFareAdjustOrder';
import { parseUberPaymentTransactionSsotLine } from './uberSsot';

/**
 * Mirrors `csvHelpers` uber_payment merge rule for `uberPriorPeriodAdjustment` per row
 * (see `isPriorPeriodFareAdjust` branch). Used only to verify fixture sums vs import behavior.
 */
function priorPeriodAdjustmentFromPaymentRow(row: {
  Description: string;
  tipColumn: number;
  earnings: number;
  netPayoutRaw: number;
  tripInUberTripActivity: boolean;
}): number {
  if (!isUberTripFareAdjustOrderDescription(row.Description)) return 0;
  // Only `trip fare adjust order` rows missing from `trip_activity` become prior-period adjustments.
  if (row.tripInUberTripActivity) return 0;
  const tipColumnVal = row.tipColumn;
  const earnings = row.earnings;
  const netPayoutRaw = row.netPayoutRaw;
  if (tipColumnVal !== 0) return tipColumnVal;
  if (earnings !== 0) return earnings;
  return Math.abs(netPayoutRaw);
}

describe('isUberTripFareAdjustOrderDescription', () => {
  it('matches exact normalized description', () => {
    expect(isUberTripFareAdjustOrderDescription('trip fare adjust order')).toBe(true);
    expect(isUberTripFareAdjustOrderDescription('  Trip  FARE  adjust  ORDER  ')).toBe(true);
  });

  it('matches token plus suffix (locale)', () => {
    expect(isUberTripFareAdjustOrderDescription('trip fare adjust order fr-ca')).toBe(true);
  });

  it('does not match typos or generic adjustment text', () => {
    expect(isUberTripFareAdjustOrderDescription('trip fare adjust orde')).toBe(false);
    expect(isUberTripFareAdjustOrderDescription('fare adjustment')).toBe(false);
    expect(isUberTripFareAdjustOrderDescription('adjustment')).toBe(false);
    expect(isUberTripFareAdjustOrderDescription('')).toBe(false);
  });

  it('does not treat substring without leading token as match', () => {
    expect(isUberTripFareAdjustOrderDescription('x trip fare adjust order')).toBe(false);
  });
});

describe('normalizeUberPaymentsTransactionDescription', () => {
  it('collapses whitespace and lowercases', () => {
    expect(normalizeUberPaymentsTransactionDescription('  Trip\nFARE\tadjust  ORDER ')).toBe('trip fare adjust order');
  });
});

describe('parseUberPaymentTransactionSsotLine (fare-adjust rows)', () => {
  it('reads Tip column for fare-adjust rows (classification happens later)', () => {
    const row: Record<string, unknown> = {
      Description: 'trip fare adjust order',
      'Paid to you:Your earnings:Tip': '160.00',
      'Paid to you : Your earnings : Fare:Fare': '0',
    };
    const line = parseUberPaymentTransactionSsotLine(row);
    expect(line.tips).toBe(160);
  });

  it('keeps real tips for completed trip rows', () => {
    const row: Record<string, unknown> = {
      Description: 'trip completed order',
      'Paid to you:Your earnings:Tip': '12.50',
      'Paid to you : Your earnings : Fare:Fare': '18.00',
    };
    const line = parseUberPaymentTransactionSsotLine(row);
    expect(line.tips).toBe(12.5);
  });
});

describe('Fixture-style accumulation (Phase 5)', () => {
  it('sums two prior-period rows for the same trip UUID to combined adjustment (e.g. 80 + 80 = 160)', () => {
    const rows = [
      {
        Description: 'trip fare adjust order',
        tipColumn: 80,
        earnings: 0,
        netPayoutRaw: 80,
        tripInUberTripActivity: false,
      },
      {
        Description: 'trip fare adjust order',
        tipColumn: 80,
        earnings: 0,
        netPayoutRaw: 80,
        tripInUberTripActivity: false,
      },
    ];
    const sum = rows.reduce((acc, r) => acc + priorPeriodAdjustmentFromPaymentRow(r), 0);
    expect(sum).toBe(160);
  });

  it('does not count tips for rows that exist in trip activity', () => {
    const rows = [
      {
        Description: 'trip completed order',
        tipColumn: 5,
        earnings: 20,
        netPayoutRaw: 25,
        tripInUberTripActivity: true,
      },
    ];
    const sum = rows.reduce((acc, r) => acc + priorPeriodAdjustmentFromPaymentRow(r), 0);
    expect(sum).toBe(0);
  });

  it('preserves negative tip column as negative prior-period adjustment', () => {
    const row = {
      Description: 'trip fare adjust order',
      tipColumn: -10,
      earnings: 0,
      netPayoutRaw: -10,
      tripInUberTripActivity: false,
    };
    expect(priorPeriodAdjustmentFromPaymentRow(row)).toBe(-10);
  });
});
