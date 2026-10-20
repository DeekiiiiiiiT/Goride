/**
 * Week-scoped InDrive trip commit for Week Reconciliation (R2-24).
 * Mirrors TripReImportFlow + importExecutor.processTripBatch, then registers recon coverage.
 */
import type { Trip } from '../types/data';
import { fetchFleetTimezone } from '../services/api';
import { validateImportFile, type ValidationError } from '../services/import-validator';
import { importExecutor } from '../services/data-import-executor';
import {
  isReconUnavailable,
  ReconApiError,
  registerReconImport,
} from '../services/reconApi';
import { isYmdInWeek, tripYmd, weekEndYmd } from './uberCashRefreshScope';

const PLATFORM = 'indrive';

export type CommitIndrivePreview = {
  totalParsed: number;
  platformMatchCount: number;
  inWeekCount: number;
  outsideWeekCount: number;
  errors: ValidationError[];
  records: Partial<Trip>[];
};

export type CommitIndriveResult = {
  batchId: string;
  successCount: number;
  failureCount: number;
  inWeekCount: number;
  errors: Array<{ row: number; error: string }>;
};

function isIndrivePlatform(platform: unknown): boolean {
  return String(platform || '').trim().toLowerCase() === PLATFORM;
}

export async function previewIndriveImport(
  csvText: string,
  weekKey: string,
): Promise<CommitIndrivePreview> {
  const wk = weekKey.slice(0, 10);
  if (!wk) throw new Error('weekKey is required for InDrive import');

  const fleetTimezone = await fetchFleetTimezone();
  const validated = validateImportFile(csvText, 'trip', fleetTimezone);
  const platformMatch = validated.validRecords.filter((r) => isIndrivePlatform(r.platform));
  const inWeek: Partial<Trip>[] = [];
  let outsideWeekCount = 0;
  for (const r of platformMatch) {
    const ymd = tripYmd(r as { date?: string });
    if (!ymd || isYmdInWeek(ymd, wk)) inWeek.push(r);
    else outsideWeekCount += 1;
  }

  return {
    totalParsed: validated.totalProcessed,
    platformMatchCount: platformMatch.length,
    inWeekCount: inWeek.length,
    outsideWeekCount,
    errors: validated.errors,
    records: inWeek,
  };
}

export async function registerIndriveWithRecon(opts: {
  batchId: string;
  dataPeriodStart?: string | null;
  dataPeriodEnd?: string | null;
  rowsCommitted?: number;
}): Promise<void> {
  const dataStart = opts.dataPeriodStart?.slice(0, 10);
  const dataEnd = opts.dataPeriodEnd?.slice(0, 10);
  if (!dataStart || !dataEnd) return;
  const importId = crypto.randomUUID();
  try {
    await registerReconImport(importId, {
      batchId: opts.batchId,
      sourceId: 'indrive_trips',
      coverageStart: dataStart,
      coverageEnd: dataEnd,
      dataStart,
      dataEnd,
      semanticKey: `indrive:${dataStart}:${dataEnd}`,
      rowsCommitted: opts.rowsCommitted,
    });
  } catch (e) {
    if (isReconUnavailable(e) || (e instanceof ReconApiError && e.status === 404)) return;
    console.warn('[InDrive import] recon register failed', e);
  }
}

export async function commitIndriveImport(
  csvText: string,
  weekKey: string,
  onProgress?: (pct: number) => void,
): Promise<CommitIndriveResult> {
  const wk = weekKey.slice(0, 10);
  const preview = await previewIndriveImport(csvText, wk);
  if (preview.inWeekCount === 0) {
    throw new Error(
      preview.platformMatchCount === 0
        ? 'No InDrive trips found in this CSV.'
        : 'No InDrive trips fall inside this week.',
    );
  }

  const result = await importExecutor.processTripBatch(
    preview.records,
    (pct) => onProgress?.(pct),
  );

  const ymids = preview.records
    .map((r) => tripYmd(r as { date?: string }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const dataStart = ymids[0] || wk;
  const dataEnd = ymids[ymids.length - 1] || weekEndYmd(wk);

  await registerIndriveWithRecon({
    batchId: result.batchId,
    dataPeriodStart: dataStart,
    dataPeriodEnd: dataEnd,
    rowsCommitted: result.successCount,
  });

  return {
    batchId: result.batchId,
    successCount: result.successCount,
    failureCount: result.failureCount,
    inWeekCount: preview.inWeekCount,
    errors: result.errors.map((e) => ({ row: e.row, error: e.error })),
  };
}
