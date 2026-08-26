/**
 * Compare two toll rate cards.
 *
 * Used by the rate history browser (what changed between version N and N+1)
 * and by the pre-publish preview (what this draft would change). Pure, so both
 * the fleet UI and the edge function can call it.
 */
import type {
  TollPaymentMethodRate,
  TollRateScheduleVersion,
} from '../types/tollRateSchedule.ts';

export type RateChangeKind = 'added' | 'removed' | 'changed';

export interface RateDiffRow {
  kind: RateChangeKind;
  /** 'plaza' rows are a single booth; 'route' rows are an origin→destination segment. */
  scope: 'plaza' | 'route';
  plazaKey: string;
  plazaLabel: string;
  classId: string;
  paymentMethod: TollPaymentMethodRate;
  /** Null when the price did not exist on that side of the comparison. */
  from: number | null;
  to: number | null;
  /** to - from, treating a missing side as zero so the column always adds up. */
  delta: number;
}

export interface RateVersionDiff {
  rows: RateDiffRow[];
  plazasAdded: string[];
  plazasRemoved: string[];
  classesAdded: string[];
  classesRemoved: string[];
  operatorChanged: { from: string; to: string } | null;
  currencyChanged: { from: string; to: string } | null;
  /** True when nothing at all differs, which is what a no-op publish looks like. */
  identical: boolean;
}

type VersionLike = Pick<
  TollRateScheduleVersion,
  'operator' | 'currency' | 'plazas' | 'vehicleClasses' | 'routeRateGroups'
>;

interface PricePoint {
  scope: 'plaza' | 'route';
  plazaKey: string;
  plazaLabel: string;
  classId: string;
  paymentMethod: TollPaymentMethodRate;
  amount: number;
}

function normalizeKey(s: string | undefined | null): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Flatten a card into one entry per priced (plaza, class, payment method). */
function pricePoints(v: VersionLike): Map<string, PricePoint> {
  const out = new Map<string, PricePoint>();

  for (const plaza of v.plazas || []) {
    // Prefer the linked id: renaming a plaza should read as a rename, not as a
    // removal plus an addition at the same price.
    const plazaKey = plaza.plazaId?.trim() || `name:${normalizeKey(plaza.plazaName)}`;
    for (const [classId, rate] of Object.entries(plaza.rates || {})) {
      for (const method of ['withTag', 'withoutTag'] as TollPaymentMethodRate[]) {
        const amount = Number(rate?.[method]);
        if (!Number.isFinite(amount)) continue;
        out.set(`plaza|${plazaKey}|${classId}|${method}`, {
          scope: 'plaza',
          plazaKey,
          plazaLabel: plaza.plazaName,
          classId,
          paymentMethod: method,
          amount,
        });
      }
    }
  }

  for (const group of v.routeRateGroups || []) {
    for (const seg of group.segments || []) {
      const plazaKey = `${normalizeKey(seg.fromPlazaName)}>${normalizeKey(seg.toPlazaName)}`;
      const plazaLabel = `${seg.fromPlazaName} → ${seg.toPlazaName}`;
      for (const [classId, amount] of Object.entries(seg.rates || {})) {
        const n = Number(amount);
        if (!Number.isFinite(n)) continue;
        // Route pricing has no tag/cash split, so it lands on the tag side only.
        out.set(`route|${plazaKey}|${classId}|withTag`, {
          scope: 'route',
          plazaKey,
          plazaLabel,
          classId,
          paymentMethod: 'withTag',
          amount: n,
        });
      }
    }
  }

  return out;
}

export function diffRateVersions(from: VersionLike, to: VersionLike): RateVersionDiff {
  const before = pricePoints(from);
  const after = pricePoints(to);

  const rows: RateDiffRow[] = [];
  for (const [key, next] of after) {
    const prev = before.get(key);
    if (!prev) {
      rows.push({ ...next, kind: 'added', from: null, to: next.amount, delta: next.amount });
    } else if (prev.amount !== next.amount) {
      rows.push({
        ...next,
        kind: 'changed',
        from: prev.amount,
        to: next.amount,
        delta: next.amount - prev.amount,
      });
    }
  }
  for (const [key, prev] of before) {
    if (after.has(key)) continue;
    rows.push({ ...prev, kind: 'removed', from: prev.amount, to: null, delta: -prev.amount });
  }

  rows.sort(
    (a, b) =>
      a.plazaLabel.localeCompare(b.plazaLabel) ||
      a.classId.localeCompare(b.classId) ||
      a.paymentMethod.localeCompare(b.paymentMethod),
  );

  const plazaLabels = (v: VersionLike) =>
    new Map((v.plazas || []).map((p) => [p.plazaId?.trim() || `name:${normalizeKey(p.plazaName)}`, p.plazaName]));
  const beforePlazas = plazaLabels(from);
  const afterPlazas = plazaLabels(to);

  const classIds = (v: VersionLike) => new Set((v.vehicleClasses || []).map((c) => c.id));
  const beforeClasses = classIds(from);
  const afterClasses = classIds(to);

  const operatorChanged = from.operator !== to.operator ? { from: from.operator, to: to.operator } : null;
  const currencyChanged = from.currency !== to.currency ? { from: from.currency, to: to.currency } : null;

  const plazasAdded = [...afterPlazas].filter(([k]) => !beforePlazas.has(k)).map(([, label]) => label);
  const plazasRemoved = [...beforePlazas].filter(([k]) => !afterPlazas.has(k)).map(([, label]) => label);
  const classesAdded = [...afterClasses].filter((c) => !beforeClasses.has(c));
  const classesRemoved = [...beforeClasses].filter((c) => !afterClasses.has(c));

  return {
    rows,
    plazasAdded,
    plazasRemoved,
    classesAdded,
    classesRemoved,
    operatorChanged,
    currencyChanged,
    identical:
      rows.length === 0 &&
      plazasAdded.length === 0 &&
      plazasRemoved.length === 0 &&
      classesAdded.length === 0 &&
      classesRemoved.length === 0 &&
      !operatorChanged &&
      !currencyChanged,
  };
}
