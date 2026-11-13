/**
 * After a toll v2 file import, mark the Week Reconciliation source received (same path as fuel register).
 */
import { weekDayKeys } from '@roam/finance-core';
import { isReconUnavailable, ReconApiError, registerReconImport } from '../services/reconApi';

export type TollV2ReconSourceId = 'toll_usage' | 'toll_topup' | 'uber_bundle';

export async function registerTollV2WithRecon(opts: {
  batchId: string;
  sourceId: TollV2ReconSourceId;
  weekKey: string;
  rowsCommitted?: number;
  fileName?: string;
}): Promise<void> {
  const days = weekDayKeys(opts.weekKey);
  if (days.length < 7) return;
  const coverageStart = days[0];
  const coverageEnd = days[6];
  const importId = opts.batchId.startsWith('batch:') ? opts.batchId.slice(6) : opts.batchId;
  try {
    await registerReconImport(importId, {
      batchId: opts.batchId,
      sourceId: opts.sourceId,
      weekKey: opts.weekKey.slice(0, 10),
      coverageStart,
      coverageEnd,
      dataStart: coverageStart,
      dataEnd: coverageEnd,
      rowsCommitted: opts.rowsCommitted ?? 1,
      fileName: opts.fileName,
    });
  } catch (e) {
    if (isReconUnavailable(e) || (e instanceof ReconApiError && e.status === 404)) return;
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export function countRowsFromV2ImportResponse(data: {
  imports?: Array<{ rows?: number; counts?: Record<string, number> }>;
}): number {
  const imports = data.imports ?? [];
  let n = 0;
  for (const imp of imports) {
    if (typeof imp.rows === 'number') {
      n += imp.rows;
      continue;
    }
    const counts = imp.counts ?? {};
    for (const v of Object.values(counts)) {
      if (typeof v === 'number') n += v;
    }
  }
  return n || 1;
}
