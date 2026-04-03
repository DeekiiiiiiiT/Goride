import type { Trip, OrganizationMetrics } from '../types/data';
import type { FileData } from './csvHelpers';
import type { UberSsotTotals } from './uberSsot';

export interface ImportValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

function toYmd(iso: string | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const s = iso.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Pre-confirm checks for merged Uber import: fail-fast on blocking issues; warnings for cross-file gaps.
 */
export function validateMergedImportPreview(params: {
  trips: Trip[];
  organizationMetrics: OrganizationMetrics[];
  uploadedFiles: FileData[];
  uberStatementsByDriverId: Record<string, UberSsotTotals> | null | undefined;
  disputeRefunds: { driverId?: string }[];
}): ImportValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const types = params.uploadedFiles.map((f) => f.type);
  const hasUberTripFile = types.some((t) => t === 'uber_trip' || t === 'uber_payment');
  const hasPaymentsDriver = types.some((t) => t === 'uber_payment_driver');

  const completedUber = params.trips.filter((t) => {
    const p = String(t.platform ?? '').toLowerCase();
    return p === 'uber' && String(t.status ?? '').toLowerCase() === 'completed';
  });

  if (hasUberTripFile && completedUber.length === 0) {
    warnings.push(
      'No completed Uber trips in merged data — verify trip_activity rows and trip status mapping.',
    );
  }

  const org = params.organizationMetrics[0];
  if (org) {
    const ps = toYmd(org.periodStart);
    const pe = toYmd(org.periodEnd);
    if (!ps || !pe) {
      warnings.push(
        'Organization period dates are missing or invalid — canonical statement dates may fall back to trip date bounds.',
      );
    }
    if (ps && pe && ps > pe) {
      warnings.push('Organization periodStart is after periodEnd.');
    }
  }

  if (
    hasPaymentsDriver &&
    (!params.uberStatementsByDriverId ||
      Object.keys(params.uberStatementsByDriverId).length === 0)
  ) {
    warnings.push(
      'Driver payments file detected but no per-driver statement totals were merged — check payments_driver mapping.',
    );
  }

  const badDisputes = params.disputeRefunds.filter((r) => !String(r.driverId ?? '').trim());
  if (badDisputes.length > 0) {
    errors.push(
      `${badDisputes.length} dispute refund row(s) are missing driver UUID — fix the CSV before importing.`,
    );
  }

  if (params.trips.length > 0) {
    const missingDriver = params.trips.filter((t) => !String(t.driverId ?? '').trim());
    if (missingDriver.length === params.trips.length) {
      warnings.push(
        'All trips are missing driverId — Uber statement canonical lines (from trips) may be incomplete.',
      );
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
