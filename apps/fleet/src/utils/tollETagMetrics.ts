/**
 * Real E-Tag savings: what cash passages would have cost less with a tag,
 * using the official withTag / withoutTag delta — not a hardcoded 10%.
 */

export interface TagRateLine {
  withTag: number;
  withoutTag: number;
}

export interface PlazaRateCard {
  plazaId?: string | null;
  plazaName?: string | null;
  rates?: Record<string, TagRateLine | undefined>;
}

export interface SavingsPassage {
  plazaId?: string | null;
  plazaName?: string | null;
  paymentMethodDisplay?: string | null;
  /** True when the passage actually used a known transponder. */
  hasTag?: boolean;
  absAmount: number;
}

export interface ETagSavingsResult {
  /** Sum of (withoutTag − withTag) across cash passages with a known plaza rate. */
  potentialSavings: number;
  /** Cash passages that had a rate-card match. */
  pricedCashPassages: number;
  /** Cash passages that could not be priced (missing plaza or rate). */
  unpricedCashPassages: number;
  /** Passages that actually used a tag / total usage. */
  adoptionRate: number;
  taggedPassages: number;
  totalPassages: number;
}

const DEFAULT_CLASS = 'class1';

function lineSavings(line: TagRateLine | undefined): number {
  if (!line) return 0;
  const delta = Number(line.withoutTag) - Number(line.withTag);
  return Number.isFinite(delta) && delta > 0 ? delta : 0;
}

function matchPlaza(card: PlazaRateCard[], plazaId?: string | null, plazaName?: string | null): PlazaRateCard | undefined {
  if (plazaId) {
    const byId = card.find((p) => p.plazaId === plazaId);
    if (byId) return byId;
  }
  if (plazaName) {
    const needle = plazaName.trim().toLowerCase();
    return card.find((p) => (p.plazaName || '').trim().toLowerCase() === needle);
  }
  return undefined;
}

/**
 * Adoption = passages that carried a real tag id, not "anything that is not cash".
 * Savings = sum of the official withoutTag − withTag delta for every cash passage
 * that we can price from the current rate card.
 */
export function computeETagMetrics(
  passages: SavingsPassage[],
  rateCard: PlazaRateCard[],
  vehicleClassId: string = DEFAULT_CLASS,
): ETagSavingsResult {
  const totalPassages = passages.length;
  const taggedPassages = passages.filter((p) => p.hasTag === true).length;

  let potentialSavings = 0;
  let pricedCashPassages = 0;
  let unpricedCashPassages = 0;

  for (const p of passages) {
    if (p.paymentMethodDisplay !== 'Cash') continue;
    const plaza = matchPlaza(rateCard, p.plazaId, p.plazaName);
    const savings = lineSavings(plaza?.rates?.[vehicleClassId]);
    if (savings > 0) {
      potentialSavings += savings;
      pricedCashPassages += 1;
    } else {
      unpricedCashPassages += 1;
    }
  }

  return {
    potentialSavings: Number(potentialSavings.toFixed(2)),
    pricedCashPassages,
    unpricedCashPassages,
    adoptionRate: totalPassages > 0 ? (taggedPassages / totalPassages) * 100 : 0,
    taggedPassages,
    totalPassages,
  };
}
