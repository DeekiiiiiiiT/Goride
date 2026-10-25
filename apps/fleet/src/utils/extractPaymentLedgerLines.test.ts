import { describe, expect, it } from 'vitest';
import {
  extractPaymentLedgerLineFromUberRow,
  otherFareFromUberRow,
  uberFareComponentGap,
} from './extractPaymentLedgerLines';

const SPACED = {
  'Paid to you : Your earnings': '102.08',
  'Paid to you : Your earnings : Fare:Wait Time at Pickup': '62.08',
  'Paid to you : Your earnings : Fare:Time at Stop': '10',
  'Paid to you : Your earnings : Fare:UberX Priority': '30',
};

describe('otherFareFromUberRow', () => {
  it('does not put known Uber fare columns into other', () => {
    expect(otherFareFromUberRow(SPACED)).toBe(0);
    expect(otherFareFromUberRow({
      'Paid to you:Your earnings:Fare:Wait Time at Pickup': '62.08',
      'Paid to you:Your earnings:Fare:Time at Stop': '10',
      'Paid to you:Your earnings:Fare:UberX Priority': '30',
      'Paid to you:Your earnings:Fare:Airport Surcharge': '5',
    })).toBe(0);
  });

  it('keeps an unknown fare column as other', () => {
    expect(otherFareFromUberRow({
      'Paid to you:Your earnings:Fare:Booking Fee': '4.50',
      'Paid to you:Your earnings:Fare:Wait Time at Pickup': '62.08',
    })).toBe(4.5);
  });

  it('stores named columns once and leaves other at 0', () => {
    const line = extractPaymentLedgerLineFromUberRow({
      'transaction UUID': 'tx-1',
      Description: 'trip',
      ...SPACED,
    });
    expect(line?.fareBreakdown.waitPickup).toBe(62.08);
    expect(line?.fareBreakdown.timeAtStop).toBe(10);
    expect(line?.fareBreakdown.priority).toBe(30);
    expect(line?.fareBreakdown.other).toBe(0);
    expect(uberFareComponentGap(102.08, 102.08, true)).toBeNull();
  });
});
