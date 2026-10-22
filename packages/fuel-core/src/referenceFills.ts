/**
 * History rows for the reference economy. Same physical-fill pairing as
 * fuelEntriesForWeekEngine, so a card row and its manual twin count once.
 * A fill is left out only when the litres are not real (none, or more than the tank).
 * A repeated odometer or an odd price still burned fuel, so those litres stay.
 * A missing tank size is only a warning.
 */
import { assessFillPlausibility } from './fillPlausibility.ts';
import type { ReferenceFill } from './referenceEfficiency.ts';
import { selectWeekFuelFills } from './selectWeekFuelFills.ts';
import type { FuelEntry } from './fuelTypes.ts';

export function referenceFillsFromEntries(
  entries: FuelEntry[],
  opts?: { tankCapacityLiters?: number | null },
): ReferenceFill[] {
  const byId = new Map((entries || []).map((entry) => [entry.id, entry]));
  const fills = selectWeekFuelFills(entries || []);
  const rows = fills
    .map((fill) => {
      const manual = fill.manualEntryId ? byId.get(fill.manualEntryId) : undefined;
      const card = fill.cardTxId ? byId.get(fill.cardTxId) : undefined;
      const meta = (row?: FuelEntry) =>
        row?.metadata && typeof row.metadata === 'object'
          ? (row.metadata as Record<string, unknown>)
          : undefined;
      const manualMeta = meta(manual);
      const cardMeta = meta(card);
      return {
        date: String(fill.date || manual?.date || card?.date || ''),
        odometer: Number(fill.odometer) || 0,
        liters: Number(fill.litres) || 0,
        amount: Number(fill.amount) || 0,
        fullTank: Boolean(manualMeta?.isFullTank || cardMeta?.isFullTank),
        accepted: Boolean(manualMeta?.plausibilityAccepted || cardMeta?.plausibilityAccepted),
      };
    })
    .filter((row) => row.odometer > 0 && row.liters > 0)
    .sort((a, b) => a.odometer - b.odometer);

  const prices = rows.filter((row) => row.amount > 0).map((row) => row.amount / row.liters);
  const seen = new Set<number>();
  return rows.map((row, index) => {
    const duplicate = seen.has(row.odometer);
    seen.add(row.odometer);
    const own = row.amount > 0 ? row.amount / row.liters : 0;
    const issues = assessFillPlausibility({
      amount: row.amount,
      liters: row.liters,
      odometer: row.odometer,
      previousOdometer: index > 0 ? rows[index - 1].odometer : 0,
      tankCapacityLiters: opts?.tankCapacityLiters,
      peerPrices: prices.filter((price) => price !== own),
      duplicateOdometer: duplicate,
      confirmed: row.accepted,
    });
    return {
      date: row.date,
      odometer: row.odometer,
      liters: row.liters,
      fullTank: row.fullTank,
      exclude: issues.some(
        (issue) => issue.code === 'zero_liters_with_amount' || issue.code === 'over_tank',
      ),
    };
  });
}
