/**
 * Aggregate tag-vs-official rate drift for the Expected vs Actual screen.
 * Uses the same resolver reconciliation already depends on.
 */
import type { TollRateScheduleStore } from '../types/tollRateSchedule';
import {
  resolveOfficialTollRate,
  resolveExpectedTollCost,
  toIsoDateKey,
} from './officialTollRate';

export interface DriftSourceRow {
  id: string;
  date: string;
  absAmount: number;
  plazaId?: string | null;
  plazaName?: string | null;
  classId?: string | null;
  paymentMethod?: 'withTag' | 'withoutTag' | null;
  isUsage?: boolean;
  isVoided?: boolean;
}

export interface TollDriftLine {
  id: string;
  date: string;
  plazaName: string;
  tagAmount: number;
  expectedAmount: number;
  delta: number;
  usedOfficial: boolean;
}

export interface PlazaDriftSummary {
  plazaName: string;
  count: number;
  totalDelta: number;
  absDelta: number;
}

export interface TollDriftDashboard {
  drifting: TollDriftLine[];
  byPlaza: PlazaDriftSummary[];
  totalTagSpend: number;
  totalExpected: number;
  totalDelta: number;
  pricedCount: number;
  unpricedCount: number;
}

function paymentFromRow(row: DriftSourceRow): 'withTag' | 'withoutTag' {
  return row.paymentMethod === 'withoutTag' ? 'withoutTag' : 'withTag';
}

export function buildTollDriftDashboard(
  rows: DriftSourceRow[],
  store: TollRateScheduleStore | null,
): TollDriftDashboard {
  const drifting: TollDriftLine[] = [];
  let totalTagSpend = 0;
  let totalExpected = 0;
  let pricedCount = 0;
  let unpricedCount = 0;

  const usage = rows.filter((r) => r.isUsage !== false && !r.isVoided);
  for (const row of usage) {
    const tag = Math.abs(row.absAmount || 0);
    if (!(tag > 0)) continue;
    totalTagSpend += tag;

    if (!store) {
      unpricedCount += 1;
      totalExpected += tag;
      continue;
    }

    const official = resolveOfficialTollRate({
      store,
      asOfDate: toIsoDateKey(row.date),
      tollClassId: row.classId || 'class1',
      paymentMethod: paymentFromRow(row),
      plazaId: row.plazaId ?? null,
      plazaName: row.plazaName ?? null,
    });
    const resolved = resolveExpectedTollCost({ tagAmount: tag, official });
    totalExpected += resolved.expectedCost;
    if (resolved.usedOfficial) pricedCount += 1;
    else unpricedCount += 1;

    if (!resolved.drift) continue;
    drifting.push({
      id: row.id,
      date: row.date,
      plazaName: row.plazaName || official?.plazaName || 'Unknown plaza',
      tagAmount: tag,
      expectedAmount: resolved.expectedCost,
      delta: tag - resolved.expectedCost,
      usedOfficial: resolved.usedOfficial,
    });
  }

  const plazaMap = new Map<string, PlazaDriftSummary>();
  for (const line of drifting) {
    const key = line.plazaName;
    const cur = plazaMap.get(key) || {
      plazaName: key,
      count: 0,
      totalDelta: 0,
      absDelta: 0,
    };
    cur.count += 1;
    cur.totalDelta += line.delta;
    cur.absDelta += Math.abs(line.delta);
    plazaMap.set(key, cur);
  }

  const byPlaza = [...plazaMap.values()].sort((a, b) => b.absDelta - a.absDelta);

  return {
    drifting,
    byPlaza,
    totalTagSpend,
    totalExpected,
    totalDelta: totalTagSpend - totalExpected,
    pricedCount,
    unpricedCount,
  };
}
