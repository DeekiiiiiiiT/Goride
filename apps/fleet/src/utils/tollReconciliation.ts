import { FinancialTransaction, Trip, Claim } from '../types/data';
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
  // Phase 1: New fields from server-side scoring engine (IDEA_2)
  confidenceScore?: number;       // 0-100 numeric score
  vehicleMatch?: boolean;         // true if toll's vehicleId === trip's vehicleId
  driverMatch?: boolean;          // true if toll's driverId === trip's driverId
  dataQuality?: 'PRECISE' | 'TIMED' | 'DATE_ONLY';  // Trip timing data quality tier
  windowHit?: 'ON_TRIP' | 'ENROUTE' | 'POST_TRIP' | 'NONE';  // Which time window the toll fell in
  isAmbiguous?: boolean;          // true if multiple trips compete with similar scores
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

/**
 * @deprecated Server-side matching is now the primary engine (Phase 2 toll_controller.tsx).
 * This function is retained only for:
 *  - ManualMatchModal's client-side search fallback
 *  - unreconcile() in useTollReconciliation.ts (re-generate suggestions locally)
 * Do not use for new features — use the server endpoints instead.
 */
export function findTollMatches(
  transaction: FinancialTransaction,
  trips: Trip[]
): MatchResult[] {
  const txDate = getTransactionDateTime(transaction);
  if (!txDate) return [];

  const matches: MatchResult[] = [];

  // Phase 8: Replace hard vehicle/driver gate with same-day pre-filter (+/- 2 days for safety)
  const txTime = txDate.getTime();
  const ONE_DAY_MS = 86_400_000;
  const candidateTrips = trips.filter(t => {
    const tripTime = new Date(t.dropoffTime || t.date).getTime();
    return !isNaN(tripTime) && Math.abs(tripTime - txTime) <= ONE_DAY_MS * 2;
  });

  for (const trip of candidateTrips) {
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
        
        if (tripRefundAmount === 0) {
             reason = `Valid trip but Uber reimbursement missing (Claimable)`;
        } else {
             reason = `During active trip but underpaid (Diff: ${varianceAmount.toFixed(2)})`;
        }
      }
    }
    // Step B: Approach Window (Request-45 -> Pickup)
    else if (isWithinInterval(txDate, { start: windows.approachStart, end: windows.approachEnd })) {
       if (amountsMatch) {
        // GREEN: Reimbursed Approach (Rare but possible)
        matchType = 'PERFECT_MATCH';
        confidence = 'high';
        reason = 'Approach phase - Reimbursed by Uber';
       } else {
        // PURPLE: Driver Liability (Strict Rule: No Passenger = Personal)
        matchType = 'PERSONAL_MATCH';
        confidence = 'high'; 
        reason = 'Unreimbursed Approach - Driver Liability';
       }
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

/**
 * Calculates the full financial picture of a toll transaction, 
 * accounting for Platform Reimbursement and Driver Recoveries.
 */
export interface TollFinancials {
    cost: number;              // The original toll cost (absolute value)
    platformRefund: number;    // Amount reimbursed by Uber/Lyft
    driverRecovered: number;   // Amount charged to driver via Claims
    fleetAbsorbed: number;     // Amount explicitly written off
    totalRecovered: number;    // platformRefund + driverRecovered
    netLoss: number;           // cost - totalRecovered
    status: 'Recovered' | 'Partial Loss' | 'Full Loss';
}

export function calculateTollFinancials(
    transaction: FinancialTransaction,
    trip?: Trip,
    claim?: Claim
): TollFinancials {
    const cost = Math.abs(transaction.amount);
    
    // 1. Platform Reimbursement (Source A)
    // Only if a trip is linked (either passed in or via transaction.tripId)
    // We prioritize the passed trip object as it might be fresher
    const platformRefund = trip?.tollCharges || 0;

    // 2. Driver Recovery (Source B)
    // Only if a resolved claim exists and was charged to the driver
    let driverRecovered = 0;
    let fleetAbsorbed = 0;

    if (claim && claim.status === 'Resolved') {
        if (claim.resolutionReason === 'Charge Driver') {
            driverRecovered = claim.amount; // The claim amount is the missing portion
        } else if (claim.resolutionReason === 'Write Off') {
            fleetAbsorbed = claim.amount;
        }
    }

    const totalRecovered = platformRefund + driverRecovered;
    
    // Net Loss Calculation
    // We use Math.round to avoid floating point artifacts (e.g. 0.00000001)
    let netLoss = Math.round((cost - totalRecovered) * 100) / 100;
    
    // Determine Status
    let status: TollFinancials['status'] = 'Full Loss';
    
    // If netLoss is negative (profit), we treat it as Recovered (0 loss) for status purposes
    // but we return the actual netLoss value (which might be negative)? 
    // No, usually "Loss" implies a non-negative number in this context. 
    // If we made a profit, Net Loss is 0.
    
    if (netLoss <= 0) {
        netLoss = 0;
        status = 'Recovered';
    } else if (totalRecovered > 0) {
        status = 'Partial Loss';
    }

    return {
        cost,
        platformRefund,
        driverRecovered,
        fleetAbsorbed,
        totalRecovered,
        netLoss,
        status
    };
}