/**
 * P8: link Data Center / wizard fuel commits to recon import_batches coverage.
 */
import {
  isReconUnavailable,
  ReconApiError,
  registerReconImport,
} from '../services/reconApi';

export type FuelReconSourceId = 'fuel_card_self' | 'fuel_card_roam';

export function buildFuelReconRegisterPayload(opts: {
  batchId: string;
  sourceId: FuelReconSourceId;
  organizationId?: string | null;
  dataPeriodStart?: string | null;
  dataPeriodEnd?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  rowsCommitted?: number;
  weekKeys?: string[];
}): Record<string, unknown> {
  const dataStart = opts.dataPeriodStart?.slice(0, 10);
  const dataEnd = opts.dataPeriodEnd?.slice(0, 10);
  const coverageStart = opts.coverageStart?.slice(0, 10) || dataStart;
  const coverageEnd = opts.coverageEnd?.slice(0, 10) || dataEnd;
  const orgId = opts.organizationId?.trim() || null;
  return {
    batchId: opts.batchId,
    sourceId: opts.sourceId,
    coverageStart,
    coverageEnd,
    dataStart,
    dataEnd,
    semanticKey:
      orgId && coverageStart && coverageEnd
        ? `fuel:${opts.sourceId}:${orgId}:${coverageStart}:${coverageEnd}`
        : undefined,
    rowsCommitted: opts.rowsCommitted,
    weekKeys: opts.weekKeys,
  };
}

export async function registerFuelCardWithRecon(opts: {
  batchId: string;
  sourceId: FuelReconSourceId;
  organizationId?: string | null;
  dataPeriodStart?: string | null;
  dataPeriodEnd?: string | null;
  coverageStart?: string | null;
  coverageEnd?: string | null;
  rowsCommitted?: number;
  weekKeys?: string[];
  importId?: string;
}): Promise<void> {
  const dataStart = opts.dataPeriodStart?.slice(0, 10);
  const dataEnd = opts.dataPeriodEnd?.slice(0, 10);
  if (!dataStart || !dataEnd) return;

  const importId = opts.importId || crypto.randomUUID();
  const body = buildFuelReconRegisterPayload(opts);
  try {
    await registerReconImport(importId, body);
  } catch (e) {
    // R3-10: only swallow when recon wizard API is not deployed; otherwise surface.
    if (isReconUnavailable(e) || (e instanceof ReconApiError && e.status === 404)) return;
    throw e instanceof Error ? e : new Error(String(e));
  }
}
