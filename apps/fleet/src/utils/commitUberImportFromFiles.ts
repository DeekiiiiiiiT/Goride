/**
 * Commit a merged Uber CSV bundle (Close Week in-place re-import).
 * Same write path as ImportsPage confirm — trips, metrics, payment lines, canonical events.
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

export type CommitUberImportResult = {
  batchId: string;
  tripCount: number;
  statementCashTotal: number;
  tripCashTotal: number;
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

export async function commitUberImportFromFiles(
  uploadedFiles: FileData[],
): Promise<CommitUberImportResult> {
  const uberFiles = uploadedFiles.filter((f) => isUberImportFileType(f.type));
  if (uberFiles.length === 0) {
    throw new Error('Drop Uber CSVs (payments_driver, payments_transaction, trips, …).');
  }
  const hasDriver = uberFiles.some((f) => f.type === 'uber_payment_driver');
  const hasTxOrTrip = uberFiles.some(
    (f) => f.type === 'uber_payment' || f.type === 'uber_trip',
  );
  if (!hasDriver && !hasTxOrTrip) {
    throw new Error(
      'Need payments_driver.csv and/or payments_transaction / trip_activity for Uber cash.',
    );
  }

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
  const batchId = crypto.randomUUID();
  const contentFingerprint = await computeImportBundleFingerprint(uberFiles);
  const orgForBatch = merged.organizationMetrics?.[0] ?? null;
  const tripBounds = tripDateBounds(calibratedTrips);
  const { data: { session } } = await supabase.auth.getSession();
  const uploadedBy = session?.user?.email?.trim() || session?.user?.id || undefined;

  const paymentLines = merged.paymentLedgerLines || [];
  const usesLineSsot = paymentLines.length > 0;
  const tripsForSave = calibratedTrips.map((t) => ({
    ...t,
    batchId,
    ...(usesLineSsot ? { usesPaymentLineSsot: true } : {}),
  }));

  await api.createBatch({
    id: batchId,
    fileName: uberFiles.map((f) => f.name).join(', '),
    uploadDate: new Date().toISOString(),
    status: 'processing',
    recordCount: calibratedTrips.length,
    type: 'merged_import',
    processedBy: uploadedBy || 'Close Week',
    contentFingerprint,
    periodStart: orgForBatch?.periodStart
      ? String(orgForBatch.periodStart).slice(0, 10)
      : undefined,
    periodEnd: orgForBatch?.periodEnd ? String(orgForBatch.periodEnd).slice(0, 10) : undefined,
    dataPeriodStart: tripBounds.min,
    dataPeriodEnd: tripBounds.max,
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
      console.warn('[CloseWeek Uber re-import] vehicle metrics skipped', e);
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
    let confirmDuplicateFile = false;
    const CANONICAL_APPEND_MAX = 200;
    for (let i = 0; i < canonicalEvents.length; i += CANONICAL_APPEND_MAX) {
      const chunk = canonicalEvents.slice(i, i + CANONICAL_APPEND_MAX);
      try {
        await api.appendCanonicalLedgerEvents(chunk, {
          confirmSignedWeek,
          confirmDuplicateFile,
        });
      } catch (err: any) {
        if (err?.code === 'DUPLICATE_FILE_HASH' && !confirmDuplicateFile) {
          const ok = window.confirm(
            'This CSV was already imported. Re-importing would post a second copy of the same money. Continue only if you intend a visible restatement?',
          );
          if (!ok) throw err;
          confirmDuplicateFile = true;
          await api.appendCanonicalLedgerEvents(chunk, {
            confirmSignedWeek,
            confirmDuplicateFile: true,
          });
          continue;
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

  const statementCashTotal = Object.values(merged.uberStatementsByDriverId || {}).reduce(
    (s, t) => s + Math.abs(Number(t?.cashCollected) || 0),
    0,
  );
  const tripCashTotal = tripsForSave
    .filter((t) => String(t.platform || '').toLowerCase() === 'uber')
    .reduce((s, t) => s + Math.abs(Number(t.cashCollected) || 0), 0);

  return {
    batchId,
    tripCount: tripsForSave.length,
    statementCashTotal,
    tripCashTotal,
  };
}
