import { TollRefundResolutionStatus } from '../types/data';

/**
 * Pure auto-classifier for unlinked toll refunds.
 *
 * An "unlinked refund" is a trip where the platform reimbursed a toll in the
 * fare but no toll expense is linked. This function proposes a resolution +
 * confidence from signals the caller has already computed (payment settlement,
 * plaza proximity, whether a tag statement is still expected).
 *
 * It is intentionally pure and side-effect free so it can be unit-tested and
 * ported verbatim to the Deno server (mirrors the findTollMatches pattern).
 *
 * Mirrored across apps/{fleet,admin,driver} + packages/types.
 */

export interface RefundClassifierInput {
  /** Positive toll amount the platform reimbursed on the trip. */
  tollCharges: number;
  platform?: string;
  paymentMethod?: string;
  /**
   * Distance (meters) from the trip's pickup/dropoff to the nearest ACTIVE toll
   * plaza, or null when the trip has no usable coordinates.
   */
  nearestPlazaMeters?: number | null;
  /** Effective on-route radius. Defaults to 500m. */
  plazaRadiusMeters?: number;
  /** True when a tag statement covering this trip's period is still expected. */
  pendingTagImport?: boolean;
}

export interface RefundClassification {
  status: TollRefundResolutionStatus;
  confidence: number; // 0-100
  reason: string;
}

export const DEFAULT_PLAZA_RADIUS_M = 500;

/** Only high-confidence cash-wash resolutions are eligible for auto-apply. */
export const REFUND_AUTO_APPLY_MIN_CONFIDENCE = 85;

/** A fare the driver settles in physical cash (vs platform/card-settled). */
export function isCashSettled(platform?: string, paymentMethod?: string): boolean {
  const pm = (paymentMethod || '').toLowerCase();
  const pf = (platform || '').toLowerCase();
  return pm === 'cash' || pf === 'cash';
}

export function classifyRefund(input: RefundClassifierInput): RefundClassification {
  const {
    tollCharges,
    platform,
    paymentMethod,
    nearestPlazaMeters = null,
    plazaRadiusMeters = DEFAULT_PLAZA_RADIUS_M,
    pendingTagImport = false,
  } = input;

  if (!(tollCharges > 0)) {
    return { status: 'pending', confidence: 0, reason: 'No positive toll refund on this trip.' };
  }

  // A tag charge is still expected — leave it to auto-match on import.
  if (pendingTagImport) {
    return {
      status: 'pending',
      confidence: 60,
      reason: 'A tag statement for this period is expected; will auto-match on import.',
    };
  }

  const cashSettled = isCashSettled(platform, paymentMethod);
  const hasGeo = typeof nearestPlazaMeters === 'number' && nearestPlazaMeters >= 0;
  const nearPlaza = hasGeo && (nearestPlazaMeters as number) <= plazaRadiusMeters;

  // Strongest signal: cash-settled fare with a plaza on-route → cash wash.
  if (cashSettled && nearPlaza) {
    return {
      status: 'cash_wash',
      confidence: 92,
      reason: 'Cash-settled fare and a toll plaza on-route — driver paid cash. No leakage.',
    };
  }
  // Cash-settled, no geo to corroborate — still strong (fare covered the toll).
  if (cashSettled && !hasGeo) {
    return {
      status: 'cash_wash',
      confidence: 80,
      reason: 'Cash-settled fare reimbursed the toll — driver most likely paid cash.',
    };
  }
  // Platform-settled but a plaza is clearly on-route — medium cash-wash.
  if (!cashSettled && nearPlaza) {
    return {
      status: 'cash_wash',
      confidence: 70,
      reason: 'A toll plaza sits on this route; likely paid in cash and reimbursed.',
    };
  }
  // We have coordinates and NO plaza is near — likely a platform estimate.
  if (hasGeo && !nearPlaza) {
    return {
      status: 'phantom',
      confidence: 64,
      reason: 'No toll plaza near this route — likely a platform fare estimate.',
    };
  }

  return {
    status: 'pending',
    confidence: 40,
    reason: 'Insufficient signal; leaving pending for tag-statement import.',
  };
}

/** Whether a classification is safe to apply automatically (no integrity risk). */
export function isSafeAutoApply(c: RefundClassification): boolean {
  // cash_wash only marks the trip (no expense created/deleted) → reversible & safe.
  return c.status === 'cash_wash' && c.confidence >= REFUND_AUTO_APPLY_MIN_CONFIDENCE;
}

/**
 * A refund is "resolved" (drops off the unlinked list) only when it carries a
 * non-pending resolution. Legacy trips (no resolution field) are NOT resolved,
 * so existing behavior is unchanged. Mirrored server-side by isUnresolvedRefund.
 */
export function isRefundResolved(
  res?: { status?: TollRefundResolutionStatus } | null,
): boolean {
  return !!res && res.status !== undefined && res.status !== 'pending';
}
