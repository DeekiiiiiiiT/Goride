/**
 * What a rate card would do to money that is still in flight.
 *
 * Publishing a card is irreversible in effect: from its effective date forward
 * every unsettled toll is re-priced, some reconciliations start showing drift,
 * and drivers get charged a different number. This computes that before the
 * publish rather than after, from the same resolver reconciliation uses.
 *
 * Only unstamped tolls are eligible — a stamped row is frozen history and a new
 * card cannot touch it.
 *
 * Pure TS — fleet-canonical (Deno edge imports this via relative path; Vite via @roam/toll-core).
 */
import type {
  TollPaymentMethodRate,
  TollRateScheduleStore,
  TollRateScheduleVersion,
} from './tollRateSchedule.ts';
import { TOLL_RATE_TOLERANCE } from './tollRateSchedule.ts';
import { resolveOfficialTollRate, toIsoDateKey } from './officialTollRate.ts';

export interface ImpactTollRow {
  id: string;
  /** Toll date, ISO or DD/MM/YYYY. */
  date: string;
  plazaId?: string | null;
  plazaName?: string | null;
  classId?: string | null;
  paymentMethod?: TollPaymentMethodRate | null;
  /** Amount the tag actually charged, used as the fallback expected cost. */
  tagAmount: number;
  /** True once the row has frozen pricing and is out of reach of a new card. */
  stamped?: boolean;
}

export interface ImpactPlazaLine {
  plazaName: string;
  count: number;
  delta: number;
}

export interface RateImpactPreview {
  /** Unsettled, unstamped tolls dated on or after the draft's effective date. */
  eligible: number;
  /** Of those, how many end up at a different expected cost. */
  repriced: number;
  /** Signed total change in expected cost across all repriced tolls. */
  totalDelta: number;
  /** Rows that had no official price and would gain one. */
  newlyPriced: number;
  /** Rows that would start being flagged as tag-vs-official drift. */
  newlyDrifting: number;
  /** Rows whose existing drift flag the new card would clear. */
  driftResolved: number;
  /** Settled rows the draft cannot touch, reported so the number is not mistaken for zero risk. */
  frozen: number;
  byPlaza: ImpactPlazaLine[];
}

function priceUnder(
  version: TollRateScheduleVersion,
  row: ImpactTollRow,
): number | null {
  const store: TollRateScheduleStore = { current: version, versions: [version] };
  const result = resolveOfficialTollRate({
    store,
    asOfDate: toIsoDateKey(row.date),
    tollClassId: row.classId || 'class1',
    paymentMethod: row.paymentMethod || 'withTag',
    plazaId: row.plazaId ?? null,
    plazaName: row.plazaName ?? null,
  });
  return result && result.amount > 0 ? result.amount : null;
}

function drifts(tagAmount: number, official: number | null): boolean {
  if (official === null) return false;
  return Math.abs(Math.abs(tagAmount) - official) > TOLL_RATE_TOLERANCE;
}

export function previewRateImpact(
  rows: ImpactTollRow[],
  currentVersion: TollRateScheduleVersion,
  draft: TollRateScheduleVersion,
): RateImpactPreview {
  const effectiveFrom = toIsoDateKey(draft.effectiveFrom || draft.effectiveDate);

  let frozen = 0;
  const eligibleRows: ImpactTollRow[] = [];
  for (const row of rows) {
    if (row.stamped) {
      frozen += 1;
      continue;
    }
    // A card only prices forward, so anything dated earlier keeps its old card.
    if (toIsoDateKey(row.date) < effectiveFrom) continue;
    eligibleRows.push(row);
  }

  const byPlaza = new Map<string, ImpactPlazaLine>();
  let repriced = 0;
  let totalDelta = 0;
  let newlyPriced = 0;
  let newlyDrifting = 0;
  let driftResolved = 0;

  for (const row of eligibleRows) {
    const before = priceUnder(currentVersion, row);
    const after = priceUnder(draft, row);
    const tag = Math.abs(row.tagAmount || 0);

    // An unpriced toll falls back to what the tag charged, so that is the number
    // the change is measured against, not zero.
    const expectedBefore = before ?? tag;
    const expectedAfter = after ?? tag;
    const delta = expectedAfter - expectedBefore;

    if (before === null && after !== null) newlyPriced += 1;

    const droveDrift = drifts(tag, before);
    const willDrift = drifts(tag, after);
    if (!droveDrift && willDrift) newlyDrifting += 1;
    if (droveDrift && !willDrift) driftResolved += 1;

    if (delta === 0) continue;

    repriced += 1;
    totalDelta += delta;
    const label = row.plazaName || 'Unknown Plaza';
    const line = byPlaza.get(label) || { plazaName: label, count: 0, delta: 0 };
    line.count += 1;
    line.delta += delta;
    byPlaza.set(label, line);
  }

  return {
    eligible: eligibleRows.length,
    repriced,
    totalDelta,
    newlyPriced,
    newlyDrifting,
    driftResolved,
    frozen,
    byPlaza: [...byPlaza.values()].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
  };
}
