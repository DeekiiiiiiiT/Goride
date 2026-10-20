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
  rowsCommitted?: number;
  weekKeys?: string[];
}): Record<string, unknown> {
  const dataStart = opts.dataPeriodStart?.slice(0, 10);
  const dataEnd = opts.dataPeriodEnd?.slice(0, 10);
  const orgId = opts.organizationId?.trim() || null;
  return {
    batchId: opts.batchId,
    sourceId: opts.sourceId,
    coverageStart: dataStart,
    coverageEnd: dataEnd,
    dataStart,
    dataEnd,
    semanticKey:
      orgId && dataStart && dataEnd
        ? `fuel:${opts.sourceId}:${orgId}:${dataStart}:${dataEnd}`
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
    if (isReconUnavailable(e) || (e instanceof ReconApiError && e.status === 404)) return;
    console.warn('[Fuel import] recon register failed', e);
  }
}
