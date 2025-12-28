import { FinancialTransaction, Trip } from '../types/data';
import { isWithinInterval, differenceInMinutes } from 'date-fns';
import { calculateTripTimes, getTripWindows } from './timeUtils';

/**
 * Toll Reconciliation Engine - "Idea 1" Implementation
 * 
 * This module implements the "Three Window" logic to strictly categorize toll expenses.
 * 
 * Core Logic:
 * 1. Active Window (Pickup -> Dropoff): Uber's Responsibility.
 *    - Match = Green (Reimbursed)
 *    - Mismatch = Amber (Valid Claim)
 * 2. Approach Window (Request-45 -> Pickup): Driver's Responsibility (Business Expense).
 *    - Any toll = Blue (Deadhead)
 * 3. Gap/Search Window: Personal Use.
 *    - Post-trip buffer = Purple (Personal)
 */

export const VARIANCE_THRESHOLD = 0.05; // 5 cents tolerance

export type MatchType = 
  | 'PERFECT_MATCH'    // Green: Active Trip + Amount Match
  | 'AMOUNT_VARIANCE'  // Amber: Active Trip + Amount Mismatch (Claim)
  | 'DEADHEAD_MATCH'   // Blue: Approach Window (Tax Deductible)
  | 'PERSONAL_MATCH'   // Purple: In Search Window but outside business logic (e.g. 10 mins after dropoff)
  | 'POSSIBLE_MATCH';  // Fallback (shouldn't be used much)

export interface MatchResult {
  transaction: FinancialTransaction;
  trip: Trip;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  timeDifferenceMinutes: number;
  matchType: MatchType;
  varianceAmount?: number;
}

/**
 * Helper to check if two amounts are effectively equal
 */
export function isAmountMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < VARIANCE_THRESHOLD;
}

/**
 * Helper to parse the transaction date
 */
function getTransactionDateTime(tx: FinancialTransaction): Date | null {
  try {
    if (tx.date.includes('T')) return new Date(tx.date);
    const timeStr = tx.time || '00:00:00';
    const date = new Date(`${tx.date}T${timeStr}`);
    if (isNaN(date.getTime())) return new Date(`${tx.date} ${timeStr}`); // Fallback
    return date;
  } catch (e) {
    return null;
  }
}

export function findTollMatches(
  transaction: FinancialTransaction,
  trips: Trip[]
): MatchResult[] {
  const txDate = getTransactionDateTime(transaction);
  if (!txDate) return [];

  const matches: MatchResult[] = [];

  // 1. Filter trips by Vehicle ID (if present)
  const vehicleTrips = trips.filter(t => 
    t.vehicleId === transaction.vehicleId || 
    (!t.vehicleId && !transaction.vehicleId)
  );

  for (const trip of vehicleTrips) {
    // 2. Calculate Precise Trip Times
    const tripTimes = calculateTripTimes(trip);
    if (!tripTimes.isValid) continue;

    // 3. Get Classification Windows
    const windows = getTripWindows(tripTimes);

    // 4. Broad Search Filter
    // If it's outside the "Search Window" (Request-45 to Dropoff+15), skip it entirely.
    if (!isWithinInterval(txDate, { start: windows.searchStart, end: windows.searchEnd })) {
      continue;
    }

    // 5. Calculate Time Distance (from Active Window)
    let diff = 0;
    if (txDate < windows.activeStart) diff = differenceInMinutes(windows.activeStart, txDate);
    else if (txDate > windows.activeEnd) diff = differenceInMinutes(txDate, windows.activeEnd);

    const txAmountAbs = Math.abs(transaction.amount);
    const tripRefundAmount = trip.tollCharges || 0;
    const amountsMatch = isAmountMatch(tripRefundAmount, txAmountAbs);

    let matchType: MatchType = 'PERSONAL_MATCH'; // Default if in search window but not active/approach
    let confidence: 'high' | 'medium' | 'low' = 'low';
    let reason = 'Outside active trip';
    let varianceAmount = 0;

    // --- WATERFALL LOGIC ---

    // Step A: Active Trip Window (Pickup -> Dropoff)
    if (isWithinInterval(txDate, { start: windows.activeStart, end: windows.activeEnd })) {
      if (amountsMatch) {
        // GREEN: Perfect Match
        matchType = 'PERFECT_MATCH';
        confidence = 'high';
        reason = 'During active trip & amount matched';
      } else {
        // AMBER: Valid Claim
        matchType = 'AMOUNT_VARIANCE';
        confidence = 'high';
        varianceAmount = tripRefundAmount - txAmountAbs;
        reason = `During active trip but underpaid (Diff: ${varianceAmount.toFixed(2)})`;
      }
    }
    // Step B: Approach Window (Request-45 -> Pickup)
    else if (isWithinInterval(txDate, { start: windows.approachStart, end: windows.approachEnd })) {
      // BLUE: Deadhead
      matchType = 'DEADHEAD_MATCH';
      confidence = 'medium'; // It's a "Match" to the trip context, but not a reimbursement match
      reason = 'During approach (Deadhead) - Tax Deductible';
      
      // Note: Even if amounts match (Uber paid for approach?), we classify as Deadhead 
      // because it's technically Pre-Trip. 
      // If the user wants to see "Reimbursed", they can look at the Variance (0.00).
    }
    // Step C: Post-Dropoff Buffer (Dropoff -> Dropoff+15)
    else if (txDate > windows.activeEnd && txDate <= windows.searchEnd) {
      // PURPLE: Personal (or fast return?)
      // It matched the "Search Window" but failed Active/Approach.
      matchType = 'PERSONAL_MATCH';
      confidence = 'low';
      reason = 'After dropoff (Likely Personal)';
    }

    matches.push({
      transaction,
      trip,
      confidence,
      reason,
      timeDifferenceMinutes: diff,
      matchType,
      varianceAmount
    });
  }

  // Sort matches by Priority
  return matches.sort((a, b) => {
    const priority = { 
      'PERFECT_MATCH': 5, 
      'AMOUNT_VARIANCE': 4, 
      'DEADHEAD_MATCH': 3, 
      'PERSONAL_MATCH': 2,
      'POSSIBLE_MATCH': 1
    };
    
    const scoreA = priority[a.matchType];
    const scoreB = priority[b.matchType];

    if (scoreA !== scoreB) return scoreB - scoreA;
    return a.timeDifferenceMinutes - b.timeDifferenceMinutes;
  });
}
