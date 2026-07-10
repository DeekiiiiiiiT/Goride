/**
 * Official toll rate lookup from Super Admin Toll Info (date-versioned).
 */
import type {
  OfficialTollRateResult,
  PlazaRates,
  TollPaymentMethodRate,
  TollRateScheduleLegacy,
  TollRateScheduleStore,
  TollRateScheduleVersion,
  TollVehicleClassDef,
} from '../types/tollRateSchedule.ts';
import { TOLL_RATE_TOLERANCE } from '../types/tollRateSchedule.ts';

export { TOLL_RATE_TOLERANCE };

/** DD/MM/YYYY or ISO → YYYY-MM-DD */
export function toIsoDateKey(raw: string | undefined | null): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

export function isoToDisplayDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function newVersionId(): string {
  return `trv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_CLASSES: TollVehicleClassDef[] = [
  {
    id: 'class1',
    label: 'Class 1',
    iconName: 'car',
    description: 'Vehicles less than 1.7m high, but any length',
    examples: 'Cars, SUVs, Pickup trucks',
    height: '< 1.7m',
    length: 'Any',
    fleetRelevance: 'Most Fleet Vehicles',
    fleetRelevanceColor: 'emerald',
  },
  {
    id: 'class2',
    label: 'Class 2',
    iconName: 'truck',
    description: 'Vehicles more than 1.7m high, but less than 5.5m long',
    examples: 'Minibuses, small trucks, large vans',
    height: '> 1.7m',
    length: '< 5.5m',
    fleetRelevance: 'Some Fleet Vehicles',
    fleetRelevanceColor: 'amber',
  },
  {
    id: 'class3',
    label: 'Class 3',
    iconName: 'bus',
    description: 'Vehicles more than 1.7m high and more than 5.5m long',
    examples: 'Buses, tractor-trailers, large trucks',
    height: '> 1.7m',
    length: '> 5.5m',
    fleetRelevance: 'Rare in Fleet',
    fleetRelevanceColor: 'slate',
  },
  {
    id: 'class4',
    label: 'Class 4',
    iconName: 'bike',
    description: 'Motorized two-wheel and three-wheel vehicles',
    examples: 'Motorcycles, scooters',
    height: 'N/A',
    length: 'N/A',
    fleetRelevance: 'Rare in Fleet',
    fleetRelevanceColor: 'slate',
  },
];

/** Normalize legacy KV blob → versioned store. */
export function migrateToVersionedStore(raw: TollRateScheduleLegacy | null | undefined): TollRateScheduleStore {
  if (raw && raw.current && Array.isArray(raw.versions) && raw.versions.length > 0) {
    const versions = [...raw.versions].sort((a, b) =>
      a.effectiveFrom.localeCompare(b.effectiveFrom),
    );
    const current = raw.current.id
      ? versions.find((v) => v.id === raw.current!.id) || versions[versions.length - 1]
      : versions[versions.length - 1];
    return { current, versions };
  }

  const effectiveFrom = toIsoDateKey(raw?.effectiveDate);
  const version: TollRateScheduleVersion = {
    id: newVersionId(),
    effectiveFrom,
    effectiveDate: raw?.effectiveDate || isoToDisplayDate(effectiveFrom),
    operator: raw?.operator || 'TransJamaican Highway Limited',
    currency: raw?.currency || 'JMD',
    plazas: raw?.plazas || [],
    vehicleClasses:
      raw?.vehicleClasses && raw.vehicleClasses.length > 0
        ? raw.vehicleClasses
        : DEFAULT_CLASSES,
    routeRateGroups: raw?.routeRateGroups || [],
    createdAt: new Date().toISOString(),
  };
  return { current: version, versions: [version] };
}

/** Pick the rate card in force on asOfDate (latest effectiveFrom <= asOf). */
export function selectScheduleVersion(
  store: TollRateScheduleStore,
  asOfDate: string,
): TollRateScheduleVersion {
  const asOf = toIsoDateKey(asOfDate);
  const sorted = [...store.versions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  let chosen = sorted[0] || store.current;
  for (const v of sorted) {
    if (v.effectiveFrom <= asOf) chosen = v;
    else break;
  }
  return chosen;
}

/**
 * Publish a new immutable version (Edit Rates).
 * Does not mutate prior versions.
 */
export function publishScheduleVersion(
  store: TollRateScheduleStore,
  draft: Omit<TollRateScheduleVersion, 'id' | 'createdAt' | 'effectiveFrom'> & {
    effectiveFrom?: string;
    createdBy?: string;
  },
): TollRateScheduleStore {
  const effectiveFrom = toIsoDateKey(draft.effectiveFrom || draft.effectiveDate);
  const version: TollRateScheduleVersion = {
    ...draft,
    id: newVersionId(),
    effectiveFrom,
    effectiveDate: draft.effectiveDate || isoToDisplayDate(effectiveFrom),
    createdAt: new Date().toISOString(),
    createdBy: draft.createdBy,
  };
  const versions = [...store.versions, version].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  return { current: version, versions };
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function findPlaza(
  plazas: PlazaRates[],
  plazaId?: string | null,
  plazaName?: string | null,
): PlazaRates | null {
  if (plazaId) {
    const byId = plazas.find((p) => p.plazaId === plazaId);
    if (byId) return byId;
  }
  if (plazaName) {
    const n = normalizeName(plazaName);
    if (!n) return null;
    const exact = plazas.find((p) => normalizeName(p.plazaName) === n);
    if (exact) return exact;
    const partial = plazas.find((p) => {
      const pn = normalizeName(p.plazaName);
      return pn.includes(n) || n.includes(pn);
    });
    if (partial) return partial;
  }
  return null;
}

export interface ResolveOfficialTollRateInput {
  store: TollRateScheduleStore;
  asOfDate: string;
  tollClassId: string;
  paymentMethod?: TollPaymentMethodRate;
  plazaId?: string | null;
  plazaName?: string | null;
  /** NSH origin→destination (optional). */
  fromPlazaName?: string | null;
  toPlazaName?: string | null;
}

export function resolveOfficialTollRate(
  input: ResolveOfficialTollRateInput,
): OfficialTollRateResult | null {
  const {
    store,
    asOfDate,
    tollClassId,
    paymentMethod = 'withTag',
    plazaId,
    plazaName,
    fromPlazaName,
    toPlazaName,
  } = input;
  if (!tollClassId) return null;

  const version = selectScheduleVersion(store, asOfDate);

  // Route-based (NSH) when both ends provided
  if (fromPlazaName && toPlazaName) {
    const fromN = normalizeName(fromPlazaName);
    const toN = normalizeName(toPlazaName);
    for (const group of version.routeRateGroups || []) {
      for (const seg of group.segments || []) {
        if (
          normalizeName(seg.fromPlazaName) === fromN &&
          normalizeName(seg.toPlazaName) === toN
        ) {
          const amt = Number(seg.rates?.[tollClassId]);
          if (!(amt > 0)) return null; // $0 = incomplete card
          return {
            amount: amt,
            scheduleVersionId: version.id,
            plazaId: seg.toPlazaId || seg.fromPlazaId || null,
            plazaName: `${seg.fromPlazaName} → ${seg.toPlazaName}`,
            classId: tollClassId,
            paymentMethod,
            source: 'route',
            effectiveFrom: version.effectiveFrom,
          };
        }
      }
    }
  }

  const plaza = findPlaza(version.plazas || [], plazaId, plazaName);
  if (!plaza) return null;
  const rate = plaza.rates?.[tollClassId];
  if (!rate) return null;
  const amount = Number(paymentMethod === 'withoutTag' ? rate.withoutTag : rate.withTag);
  if (!(amount > 0)) return null;

  return {
    amount,
    scheduleVersionId: version.id,
    plazaId: plaza.plazaId || null,
    plazaName: plaza.plazaName,
    classId: tollClassId,
    paymentMethod,
    source: 'flat',
    effectiveFrom: version.effectiveFrom,
  };
}

/** Tag vs official drift. */
export function hasOfficialRateDrift(
  tagAmount: number,
  officialAmount: number,
  tolerance = TOLL_RATE_TOLERANCE,
): boolean {
  return Math.abs(Math.abs(tagAmount) - Math.abs(officialAmount)) > tolerance;
}

/** Cost basis for shortfall: official when resolved, else tag. */
export function resolveExpectedTollCost(opts: {
  tagAmount: number;
  official: OfficialTollRateResult | null;
}): { expectedCost: number; usedOfficial: boolean; drift: boolean } {
  const tag = Math.abs(opts.tagAmount);
  if (opts.official && opts.official.amount > 0) {
    return {
      expectedCost: opts.official.amount,
      usedOfficial: true,
      drift: hasOfficialRateDrift(tag, opts.official.amount),
    };
  }
  return { expectedCost: tag, usedOfficial: false, drift: false };
}

export function listVehicleClassesFromStore(
  store: TollRateScheduleStore | null,
): TollVehicleClassDef[] {
  if (!store?.current?.vehicleClasses?.length) return DEFAULT_CLASSES;
  return store.current.vehicleClasses;
}
