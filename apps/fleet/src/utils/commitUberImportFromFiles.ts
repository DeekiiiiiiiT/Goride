/**
 * Close Week Uber cash refresh — week-scoped preview/commit.
 * Same write building blocks as Imports, with bundle gates, week filter,
 * duplicate hard-block, and no auto week sync (caller decides).
 */
import { api, fetchFleetTimezone } from '../services/api';
import { tripCalibrationService } from '../services/tripCalibrationService';
import { supabase } from '../utils/supabase/client';
import {
  DEFAULT_FIELDS,
  mergeAndProcessData,
  type FileData,
} from './csvHelpers';
import { computeImportBundleFingerprint } from './importBundleFingerprint';
import { buildCanonicalImportEvents, tripDateBounds } from './buildCanonicalImportEvents';
import { buildPaymentLedgerCanonicalEvents } from './buildPaymentLedgerCanonicalEvents';
import { validateMergedImportPreview } from './importValidation';
import type { Trip } from '../types/data';
import {
  assertUberCashRefreshBundle,
  isYmdInWeek,
  tripYmd,
  weekEndYmd,
} from './uberCashRefreshScope';

export {
  assertUberCashRefreshBundle,
  isYmdInWeek,
  tripYmd,
  weekEndYmd,
} from './uberCashRefreshScope';

const UBER_FILE_TYPES = new Set([
  'uber_trip',
  'uber_payment',
  'uber_payment_driver',
  'uber_payment_org',
  'uber_driver_quality',
  'uber_vehicle_performance',
  'uber_driver_activity',
  'uber_driver_time_distance',
  'uber_vehicle_time_distance',
]);

export function isUberImportFileType(type: FileData['type']): boolean {
  return UBER_FILE_TYPES.has(type);
}

export type UberCashRefreshPreview = {
  weekKey: string;
  weekEnd: string;
  tripCountInWeek: number;
  tripCountOutsideWeek: number;
  paymentLineCount: number;
  statementCashTotal: number;
  tripCashTotal: number;
  cashDelta: number;
  hasDriverPayments: boolean;
  hasTripOrTx: boolean;
  contentFingerprint: string;
  /** Existing trips in payload that already have cash_wash (best-effort). */
  existingCashWashCount: number;
  overwriteTripCount: number;
};

export type CommitUberImportResult = {
  batchId: string;
  tripCount: number;
  statementCashTotal: number;
  tripCashTotal: number;
  preview: UberCashRefreshPreview;
};

async function chunkedImport<T>(
  items: T[],
  runner: (chunk: T[]) => Promise<{ imported?: number; skipped?: number } | void>,
  size = 200,
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;
  for (let i = 0; i < items.length; i += size) {
    const chunk = items.slice(i, i + size);
    const r = await runner(chunk);
    imported += r?.imported ?? chunk.length;
    skipped += r?.skipped ?? 0;
  }
  return { imported, skipped };
}

async function buildMergedUberBundle(uploadedFiles: FileData[]) {
  const uberFiles = uploadedFiles.filter((f) => isUberImportFileType(f.type));
  if (uberFiles.length === 0) {
    throw new Error('Drop Uber CSVs (payments_driver, payments_transaction, trips, …).');
  }
  assertUberCashRefreshBundle(uberFiles);

  const fleetTimezone = await fetchFleetTimezone();
  const merged = mergeAndProcessData(uberFiles, DEFAULT_FIELDS, undefined, [], fleetTimezone);
  const trips = (merged.trips || []).map((t) => ({
    ...t,
    platform: (t.platform || 'Uber') as Trip['platform'],
  })) as Trip[];

  const validation = validateMergedImportPreview({
    trips,
    organizationMetrics: merged.organizationMetrics || [],
    uploadedFiles: uberFiles,
    uberStatementsByDriverId: merged.uberStatementsByDriverId,
    disputeRefunds: merged.disputeRefunds || [],
  });
  if (!validation.ok) {
    throw new Error(validation.errors.join(' ') || 'Import validation failed');
  }

  const calibratedTrips = await tripCalibrationService.calibrateTrips(trips);
  const contentFingerprint = await computeImportBundleFingerprint(uberFiles);
  return { uberFiles, merged, calibratedTrips, contentFingerprint };
}

function scopeTripsToWeek(trips: Trip[], weekKey: string) {
  const inWeek: Trip[] = [];
  let outside = 0;
  for (const t of trips) {
    const ymd = tripYmd(t);
    if (!ymd || isYmdInWeek(ymd, weekKey)) inWeek.push(t);
    else outside += 1;
  }
  return { inWeek, outside };
}

async function countExistingCashWash(weekKey: string): Promise<number> {
  try {
    const end = weekEndYmd(weekKey);
    const res = await api.getTripsFiltered({
      startDate: weekKey,
      endDate: end,
      limit: 500,
    } as Parameters<typeof api.getTripsFiltered>[0]);
    const trips =
      (res as { data?: Trip[] }).data ||
      (res as { trips?: Trip[] }).trips ||
      (Array.isArray(res) ? (res as Trip[]) : []);
    return trips.filter((t) => t?.tollRefundResolution?.status === 'cash_wash').length;
  } catch {
    return 0;
  }
}

export async function previewUberCashRefresh(
  uploadedFiles: FileData[],
  weekKey: string,
): Promise<UberCashRefreshPreview> {
  const wk = weekKey.slice(0, 10);
  const { merged, calibratedTrips, contentFingerprint } = await buildMergedUberBundle(uploadedFiles);
  const { inWeek, outside } = scopeTripsToWeek(calibratedTrips, wk);
  if (calibratedTrips.length > 0 && inWeek.length === 0) {
    throw new Error(`No trips fall in week of ${wk}. Check the CSV dates.`);
  }
  if (outside > 0 && outside > inWeek.length * 2) {
    throw new Error(
      `Most trips (${outside}) are outside week ${wk}. Use Data Imports for multi-week bundles.`,
    );
  }

  const paymentLines = (merged.paymentLedgerLines || []).filter((l) => {
    const ymd = String((l as { date?: string; tripDate?: string }).date || (l as { tripDate?: string }).tripDate || '').slice(0, 10);
    return !ymd || isYmdInWeek(ymd, wk);
  });

  const statementCashTotal = Object.values(merged.uberStatementsByDriverId || {}).reduce(
    (s, t) => s + Math.abs(Number(t?.cashCollected) || 0),
    0,
  );
  const tripCashTotal = inWeek
    .filter((t) => String(t.platform || '').toLowerCase() === 'uber')
    .reduce((s, t) => s + Math.abs(Number(t.cashCollected) || 0), 0);

  const ids = inWeek.map((t) => String(t.id || '')).filter(Boolean);
  let existingCashWashCount = 0;
  try {
    existingCashWashCount = await countExistingCashWash(wk);
  } catch {
    existingCashWashCount = 0;
  }

  return {
    weekKey: wk,
    weekEnd: weekEndYmd(wk),
    tripCountInWeek: inWeek.length,
    tripCountOutsideWeek: outside,
    paymentLineCount: paymentLines.length,
    statementCashTotal,
    tripCashTotal,
    cashDelta: statementCashTotal - tripCashTotal,
    hasDriverPayments: true,
    hasTripOrTx: true,
    contentFingerprint,
    existingCashWashCount,
    overwriteTripCount: inWeek.length,
  };
}

/**
 * @deprecated Prefer previewUberCashRefresh + commitUberCashRefresh for Close Week.
 * Kept for callers that pass files without week scope (still enforces full bundle).
 */
export async function commitUberImportFromFiles(
  uploadedFiles: FileData[],
  opts?: { weekKey?: string; closeWeekMode?: boolean },
): Promise<CommitUberImportResult> {
  return commitUberCashRefresh(uploadedFiles, opts?.weekKey || '', {
    closeWeekMode: opts?.closeWeekMode !== false,
  });
}

export async function commitUberCashRefresh(
  uploadedFiles: FileData[],
  weekKey: string,
  opts?: { closeWeekMode?: boolean },
): Promise<CommitUberImportResult> {
  const closeWeekMode = opts?.closeWeekMode !== false;
  const wk = weekKey.slice(0, 10);
  if (!wk) throw new Error('weekKey is required for Uber cash refresh');

  const preview = await previewUberCashRefresh(uploadedFiles, wk);
  const { uberFiles, merged, calibratedTrips, contentFingerprint } = await buildMergedUberBundle(
    uploadedFiles,
  );
  const { inWeek } = scopeTripsToWeek(calibratedTrips, wk);

  const batchId = crypto.randomUUID();
  const orgForBatch = merged.organizationMetrics?.[0] ?? null;
  const tripBounds = tripDateBounds(inWeek);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uploadedBy = session?.user?.email?.trim() || session?.user?.id || undefined;

  const paymentLines = (merged.paymentLedgerLines || []).filter((l) => {
    const ymd = String(
      (l as { date?: string }).date || (l as { tripDate?: string }).tripDate || '',
    ).slice(0, 10);
    return !ymd || isYmdInWeek(ymd, wk);
  });
  const usesLineSsot = paymentLines.length > 0;
  const tripsForSave = inWeek.map((t) => ({
    ...t,
    batchId,
    ...(usesLineSsot ? { usesPaymentLineSsot: true } : {}),
  }));

  await api.createBatch({
    id: batchId,
    fileName: uberFiles.map((f) => f.name).join(', '),
    uploadDate: new Date().toISOString(),
    status: 'processing',
    recordCount: tripsForSave.length,
    type: 'merged_import',
    processedBy: uploadedBy || 'Close Week',
    contentFingerprint,
    periodStart: wk,
    periodEnd: weekEndYmd(wk),
    dataPeriodStart: tripBounds.min || wk,
    dataPeriodEnd: tripBounds.max || weekEndYmd(wk),
    uploadedBy,
    usesPaymentLineSsot: usesLineSsot,
    paymentLedgerLineCount: paymentLines.length,
  });

  const TRIP_CHUNK = 15;
  for (let i = 0; i < tripsForSave.length; i += TRIP_CHUNK) {
    await api.saveTrips(tripsForSave.slice(i, i + TRIP_CHUNK));
  }
  if ((merged.driverMetrics || []).length > 0) {
    await api.saveDriverMetrics(merged.driverMetrics);
  }
  if ((merged.vehicleMetrics || []).length > 0) {
    try {
      await api.saveVehicleMetrics(merged.vehicleMetrics);
    } catch (e) {
      console.warn('[CloseWeek Uber cash refresh] vehicle metrics skipped', e);
    }
  }
  if (orgForBatch) {
    await api.saveFinancials(orgForBatch);
  }

  const paymentLineEvents =
    paymentLines.length > 0
      ? buildPaymentLedgerCanonicalEvents(
          paymentLines.map((l) => ({ ...l, batchId })),
          batchId,
          contentFingerprint,
        )
      : [];
  const canonicalEvents = [
    ...paymentLineEvents,
    ...buildCanonicalImportEvents({
      batchId,
      sourceFileHash: contentFingerprint,
      trips: tripsForSave,
      organizationMetrics: orgForBatch,
      uberStatementsByDriverId: merged.uberStatementsByDriverId,
      disputeRefunds: merged.disputeRefunds || [],
    }),
  ];

  if (canonicalEvents.length > 0) {
    let confirmSignedWeek = false;
    const CANONICAL_APPEND_MAX = 200;
    for (let i = 0; i < canonicalEvents.length; i += CANONICAL_APPEND_MAX) {
      const chunk = canonicalEvents.slice(i, i + CANONICAL_APPEND_MAX);
      try {
        await api.appendCanonicalLedgerEvents(chunk, {
          confirmSignedWeek,
          confirmDuplicateFile: false,
        });
      } catch (err: any) {
        if (err?.code === 'DUPLICATE_FILE_HASH') {
          if (closeWeekMode) {
            throw new Error(
              'These CSVs were already imported (same fingerprint). Close Week will not post a second copy of statement cash. Use Accept statement cash, or Data Imports only if you intend a visible restatement.',
            );
          }
          throw err;
        }
        if (err?.code === 'SIGNED_WEEK' && !confirmSignedWeek) {
          const weeks = Array.isArray(err.signedWeeks)
            ? err.signedWeeks
                .map((w: { periodAnchor?: string }) => w.periodAnchor)
                .filter(Boolean)
                .join(', ')
            : '';
          const ok = window.confirm(
            `This import would change signed week(s)${weeks ? `: ${weeks}` : ''}. Post as a visible adjustment?`,
          );
          if (!ok) throw err;
          confirmSignedWeek = true;
          await api.appendCanonicalLedgerEvents(chunk, { confirmSignedWeek: true });
          continue;
        }
        throw err;
      }
    }
  }

  if (paymentLines.length > 0) {
    await chunkedImport(
      paymentLines.map((l) => ({ ...l, batchId })),
      (chunk) => api.importPaymentLedgerLines(chunk),
    );
  }
  if ((merged.disputeRefunds || []).length > 0) {
    await chunkedImport(
      (merged.disputeRefunds || []).map((r) => ({ ...r, batchId })),
      (chunk) => api.importDisputeRefunds(chunk),
    );
  }

  await api.patchImportBatch(batchId, { status: 'completed' });

  return {
    batchId,
    tripCount: tripsForSave.length,
    statementCashTotal: preview.statementCashTotal,
    tripCashTotal: preview.tripCashTotal,
    preview,
  };
}

