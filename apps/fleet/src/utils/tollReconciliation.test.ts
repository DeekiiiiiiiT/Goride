import { describe, expect, it } from 'vitest';
import { findTollMatches } from './tollReconciliation';
import { FinancialTransaction, Trip } from '../types/data';

/**
 * Trip and transaction timestamps must be built in the same clock. `findTollMatches`
 * parses a toll's `date` + `time` as local, so trip fixtures use naive (no-Z) ISO
 * strings — a `Z` suffix here silently shifts every window by the runner's offset.
 */
const createTx = (
  id: string,
  date: string,
  time: string,
  amount: number,
  vehicleId: string = 'V1',
): FinancialTransaction =>
  ({
    id,
    date,
    time,
    amount, // negative: an expense
    vehicleId,
    description: 'Toll',
    type: 'Expense',
    category: 'Tolls',
    paymentMethod: 'Credit Card',
    status: 'Completed',
    isReconciled: false,
  }) as FinancialTransaction;

const addMinutes = (date: string, time: string, minutes: number): string => {
  const [h, m, s] = time.split(':').map(Number);
  const d = new Date(`${date}T${time}`);
  d.setHours(h, m + minutes, s);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const createTrip = (
  id: string,
  date: string,
  startTime: string,
  tollAmount: number,
  vehicleId: string = 'V1',
): Trip => {
  const start = `${date}T${startTime}`;
  return {
    id,
    date: start,
    requestTime: start,
    dropoffTime: addMinutes(date, startTime, 20),
    amount: 50,
    tollCharges: tollAmount,
    vehicleId,
    platform: 'Uber',
    status: 'Completed',
    driverId: 'D1',
  } as Trip;
};

/**
 * With no `startTime` or `duration`, pickup falls back to request time, so for a trip
 * requested at 10:00 and dropped at 10:20 the windows are:
 *   active   10:00 - 10:20
 *   approach 09:15 - 10:00
 *   search   09:15 - 10:35
 */
describe('findTollMatches', () => {
  it('flags a toll inside the active window with a matching amount as reimbursed', () => {
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -5.0);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    const matches = findTollMatches(tx, [trip]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('PERFECT_MATCH');
    expect(matches[0].confidence).toBe('high');
  });

  it('raises a claim when the platform reimbursed less than the toll cost', () => {
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -4.5);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    const matches = findTollMatches(tx, [trip]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('AMOUNT_VARIANCE');
    expect(matches[0].confidence).toBe('high');
    expect(matches[0].varianceAmount).toBeCloseTo(0.5, 3);
  });

  it('treats a reimbursed approach toll as covered by the platform', () => {
    const tx = createTx('tx1', '2023-10-10', '09:30:00', -5.0);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    const matches = findTollMatches(tx, [trip]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('PERFECT_MATCH');
    expect(matches[0].reason).toBe('Approach phase - Reimbursed by Uber');
  });

  it('charges an unreimbursed approach toll to the driver', () => {
    const tx = createTx('tx1', '2023-10-10', '09:30:00', -4.5);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    const matches = findTollMatches(tx, [trip]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('PERSONAL_MATCH');
    expect(matches[0].reason).toBe('Unreimbursed Approach - Driver Liability');
  });

  it('treats a toll after dropoff but inside the buffer as likely personal', () => {
    const tx = createTx('tx1', '2023-10-10', '10:30:00', -5.0);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    const matches = findTollMatches(tx, [trip]);

    expect(matches).toHaveLength(1);
    expect(matches[0].matchType).toBe('PERSONAL_MATCH');
    expect(matches[0].confidence).toBe('low');
  });

  it('returns nothing when the toll falls outside every window', () => {
    // Search starts 09:15, so 09:00 is too early to belong to this trip.
    const tx = createTx('tx1', '2023-10-10', '09:00:00', -5.0);
    const trip = createTrip('trip1', '2023-10-10', '10:00:00', 5.0);

    expect(findTollMatches(tx, [trip])).toHaveLength(0);
  });

  it('ranks the trip that was actually underway above a later candidate', () => {
    const tx = createTx('tx1', '2023-10-10', '10:10:00', -5.0);
    // Trip A is underway at 10:10.
    const tripA = createTrip('tripA', '2023-10-10', '10:00:00', 5.0);
    // Trip B has not started yet, so 10:10 only lands in its approach window.
    const tripB = createTrip('tripB', '2023-10-10', '10:45:00', 5.0);

    const matches = findTollMatches(tx, [tripA, tripB]);

    expect(matches).toHaveLength(2);
    expect(matches[0].trip.id).toBe('tripA');
    expect(matches[0].timeDifferenceMinutes).toBe(0);
    expect(matches[1].trip.id).toBe('tripB');
    expect(matches[1].timeDifferenceMinutes).toBeGreaterThan(0);
  });
});
