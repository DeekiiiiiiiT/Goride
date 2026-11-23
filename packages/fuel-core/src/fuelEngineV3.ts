/**
 * Fuel engine v3 (fuel enterprise audit F-01, F-10, F-12, F-22, F-23).
 *
 * Prices a car's week from the fuel actually bought:
 *   cost per km = spend on fills with an odometer ÷ odometer km (fill-to-fill span).
 * Every kind of driving is its km × that cost per km, so the parts add up to exactly what was
 * bought. "Usual economy" is never used for money. Commute and unexplained km sit inside
 * company + driver on every path (F-23), so company + driver = total spend, to the cent.
 *
 * Rounding: each line's cost is a share of the spend in cents (largest remainder by km), so the
 * lines always sum to the spend. The driver's part is the exact (unrounded) line cost × the
 * rule's driver %, rounded half up; the company keeps the rest of the line.
 *
 * Pure: no I/O. The v2.2 engine supplies the km; this file only prices them.
 */
import { getCategoryCoverageSplit, type FuelCoverageRule } from './fuelCoverageSplit.ts';
import { splitLeftoverFuel, type LeftoverSplit } from './leftoverSplit.ts';

export const FUEL_ENGINE_V3_VERSION = 'fuel-chain-v3';

export type FuelV3Purpose =
  | 'uber_trips'
  | 'to_pickups'
  | 'company_errands'
  | 'personal'
  | 'personal_allowance'
  | 'commute'
  | 'unexplained_km'
  | 'no_odometer_fills';

export type FuelV3Line = {
  /** The car this line is for (F-03: one line per car × purpose). */
  vehicleId?: string;
  purpose: FuelV3Purpose;
  km: number;
  /** Exact cost per km in J$ (null for the no-odometer fills line). */
  costPerKm: number | null;
  costMinor: number;
  /** The rule's driver share for this line, 0–100 (worked out, for display). */
  driverPct: number;
  driverMinor: number;
  companyMinor: number;
};

export type FuelV3Input = {
  /** J$ on this car's fills in the week that carry an odometer reading. */
  spendWithOdometer: number;
  /** J$ on fills with no odometer reading. */
  spendNoOdometer: number;
  /** Fill-to-fill odometer km for the week (prior fill → last fill). */
  odometerKm: number;
  /** At least 3 fills with an odometer (the v2.2 chain is usable). */
  chainUsable: boolean;
  /** The owner reviewed a chainless week (fuel_week_closable_gate "odometer chain review"). */
  chainReviewed?: boolean;
  km: {
    trips: number;
    /** Platform km before any capping, for the F-10 note. */
    tripsReported?: number;
    pickups: number;
    companyErrands: number;
    personal: number;
    commute: number;
  };
  /** Personal Allowance earned km this week (company pays them), ≤ personal km (F-22). */
  personalAllowanceEarnedKm?: number;
  rule?: FuelCoverageRule | null;
  /** Company % of commute (rule.commuteCoverage, default 100). */
  commuteCompanyPct?: number;
  leftover: LeftoverSplit;
  /** Degraded inputs: the leftover rule may not bill the driver. */
  blockLeftoverDriver?: boolean;
};

export type FuelV3Result = {
  engineVersion: typeof FUEL_ENGINE_V3_VERSION;
  pricing: 'odometer' | 'km_share_fallback' | 'none';
  /** A chainless week not yet reviewed: preview only, never charged (F-01 detail). */
  previewOnly: boolean;
  costPerKm: number | null;
  odometerKm: number;
  /** F-10: the parts were longer than the odometer and were scaled down to it. */
  cap: { beforeKm: number; afterKm: number; ratio: number; tripsReportedKm: number; tripsPricedKm: number } | null;
  lines: FuelV3Line[];
  totalMinor: number;
  driverMinor: number;
  companyMinor: number;
  totalSpend: number;
  driverShare: number;
  companyShare: number;
  /** The inputs this car-week was priced from — lets a multi-car week re-price with its share of Personal Allowance. */
  input?: FuelV3Input;
};

const toMinor = (j: number) => Math.round((Number(j) || 0) * 100);
const nonNeg = (n: unknown) => Math.max(0, Number(n) || 0);
/** Half-up to whole cents, robust to float noise (1222.5549… → 122255; 122.2555 → 12226). */
const roundMinor = (j: number) => Math.floor(j * 100 + 0.5 + 1e-9);

/** Split `totalMinor` cents over weights; the parts always sum to `totalMinor`. */
export function allocateByWeight(totalMinor: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!(sum > 0) || totalMinor <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (totalMinor * w) / sum);
  const out = raw.map((r) => Math.floor(r));
  let left = totalMinor - out.reduce((s, n) => s + n, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);
  for (let k = 0; left > 0 && order.length; k = (k + 1) % order.length) {
    out[order[k].i] += 1;
    left -= 1;
  }
  return out;
}

type Part = { purpose: FuelV3Purpose; km: number };

function companyPctFor(purpose: FuelV3Purpose, input: FuelV3Input): number | null {
  // null = decided by the leftover rule, not a coverage %.
  switch (purpose) {
    case 'personal_allowance':
      return 100;
    case 'commute':
      return Math.max(0, Math.min(100, input.commuteCompanyPct ?? 100));
    case 'unexplained_km':
    case 'no_odometer_fills':
      return null;
    default:
      return null;
  }
}

const COVERAGE_CATEGORY: Partial<Record<FuelV3Purpose, 'rideShare' | 'deadhead' | 'companyUsage' | 'personal'>> = {
  uber_trips: 'rideShare',
  to_pickups: 'deadhead',
  company_errands: 'companyUsage',
  personal: 'personal',
};

function driverJ(purpose: FuelV3Purpose, exactCost: number, input: FuelV3Input): number {
  const category = COVERAGE_CATEGORY[purpose];
  if (category) {
    return getCategoryCoverageSplit(category, exactCost, input.rule || undefined).driver;
  }
  const pct = companyPctFor(purpose, input);
  if (pct != null) return exactCost * (1 - pct / 100);
  const leftover = splitLeftoverFuel({
    variance: 0,
    unattributedKmCost: purpose === 'unexplained_km' ? exactCost : 0,
    noOdometerFillCost: purpose === 'no_odometer_fills' ? exactCost : 0,
    split: input.leftover,
    blockDriver: !!input.blockLeftoverDriver,
    blockReason: input.blockLeftoverDriver ? 'degraded_inputs' : undefined,
  });
  return leftover.driver;
}

function priceParts(
  parts: Part[],
  spendMinor: number,
  exactSpend: number,
  denomKm: number,
  input: FuelV3Input,
): FuelV3Line[] {
  const live = parts.filter((p) => p.km > 0);
  const cents = allocateByWeight(spendMinor, live.map((p) => p.km));
  const cpk = denomKm > 0 ? exactSpend / denomKm : 0;
  return live.map((p, i) => {
    const exactCost = p.km * cpk;
    const costMinor = cents[i];
    const dJ = driverJ(p.purpose, exactCost, input);
    // A line the rule gives wholly to one side goes wholly to that side, rounding cent included.
    const driverMinor = dJ >= exactCost - 1e-9
      ? costMinor
      : Math.min(costMinor, Math.max(0, roundMinor(dJ)));
    return {
      purpose: p.purpose,
      km: p.km,
      costPerKm: cpk,
      costMinor,
      driverPct: exactCost > 0 ? Math.round((driverJ(p.purpose, exactCost, input) / exactCost) * 10000) / 100 : 0,
      driverMinor,
      companyMinor: costMinor - driverMinor,
    };
  }).filter((l) => l.costMinor > 0);
}

function splitPersonal(personalKm: number, earnedKm: number | undefined): Part[] {
  const earned = Math.min(personalKm, nonNeg(earnedKm));
  return [
    { purpose: 'personal_allowance', km: earned },
    { purpose: 'personal', km: personalKm - earned },
  ];
}

type ReportLike = Record<string, unknown> & { metadata?: Record<string, unknown> };

const sumPurpose = (lines: FuelV3Line[], purposes: FuelV3Purpose[]) =>
  lines.filter((l) => purposes.includes(l.purpose)).reduce((s, l) => s + l.costMinor, 0) / 100;

/** The v2.2 report fields each v3 purpose corresponds to (for the preview and the switch). */
const V22_FIELDS: Array<{ label: string; purposes: FuelV3Purpose[]; fields: string[] }> = [
  { label: 'Uber trips', purposes: ['uber_trips'], fields: ['rideShareCost'] },
  { label: 'To pickups', purposes: ['to_pickups'], fields: ['deadheadCost'] },
  { label: 'Company errands', purposes: ['company_errands'], fields: ['companyUsageCost'] },
  { label: 'Personal', purposes: ['personal', 'personal_allowance'], fields: ['personalUsageCost'] },
  { label: 'Commute', purposes: ['commute'], fields: ['commuteCost'] },
  // v2.2's miscellaneousCost (fuel the usual-economy model couldn't place) is not a kind of
  // driving; v3 removes it by design (F-01), so it is never the "moved most" answer.
  { label: 'Unexplained km', purposes: ['unexplained_km'], fields: ['unattributedKmCost'] },
  { label: 'No-odometer fills', purposes: ['no_odometer_fills'], fields: ['unattributedFillCost', 'windowTimingCost'] },
];

export type FuelV3PreviewRow = {
  driverId: string;
  vehicleId: string;
  oldDriverShare: number;
  newDriverShare: number;
  /** New − old, J$. Negative = the driver pays less under v3. */
  delta: number;
  movedMost: { label: string; oldCost: number; newCost: number } | null;
  previewOnly: boolean;
  personalAllowanceNotApplied: boolean;
};

/**
 * Step 5 "New pricing preview" (audit Part D, Stitch screen 3): per driver, today's charge vs
 * the v3 charge, and which kind of driving moved most. Reads only the saved reports.
 */
export function fuelV3PreviewRows(reports: ReportLike[]): FuelV3PreviewRow[] {
  const rows: FuelV3PreviewRow[] = [];
  for (const r of reports) {
    const v3 = r.metadata?.fuelV3 as (FuelV3Result | FuelV3Combined) | undefined;
    if (!v3) continue;
    let movedMost: FuelV3PreviewRow['movedMost'] = null;
    let best = 0;
    for (const f of V22_FIELDS) {
      const oldCost = f.fields.reduce((s, k) => s + (Number(r[k]) || 0), 0);
      const newCost = sumPurpose(v3.lines, f.purposes);
      const d = Math.abs(newCost - oldCost);
      if (d > best + 0.005) {
        best = d;
        movedMost = { label: f.label, oldCost: Math.round(oldCost * 100) / 100, newCost };
      }
    }
    const oldDriverShare = Math.round((Number(r.driverShare) || 0) * 100) / 100;
    rows.push({
      driverId: String(r.driverId || ''),
      vehicleId: String(r.vehicleId || ''),
      oldDriverShare,
      newDriverShare: v3.driverShare,
      delta: Math.round((v3.driverShare - oldDriverShare) * 100) / 100,
      movedMost,
      previewOnly: !!v3.previewOnly,
      personalAllowanceNotApplied: !!(v3 as FuelV3Combined).personalAllowanceNotApplied,
    });
  }
  return rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/**
 * The platform switch fuelEngineV3 is on: the report is charged from its v3 result. Category
 * costs and shares are replaced so every reader sees one set of numbers; nothing is left as
 * "miscellaneous". A preview-only (unreviewed chainless) week keeps v2.2 and stays blocked by
 * odometer_chain_unusable. Returns the report unchanged when it has no v3 result.
 */
export function applyFuelV3ToReport<T extends ReportLike>(report: T): T {
  const v3 = report.metadata?.fuelV3 as (FuelV3Result | FuelV3Combined) | undefined;
  if (!v3 || v3.previewOnly) return report;
  const lines = v3.lines;
  const driverOf = (purposes: FuelV3Purpose[]) =>
    lines.filter((l) => purposes.includes(l.purpose)).reduce((s, l) => s + l.driverMinor, 0) / 100;
  return {
    ...report,
    rideShareCost: sumPurpose(lines, ['uber_trips']),
    deadheadCost: sumPurpose(lines, ['to_pickups']),
    companyUsageCost: sumPurpose(lines, ['company_errands']),
    personalUsageCost: sumPurpose(lines, ['personal', 'personal_allowance']),
    commuteCost: sumPurpose(lines, ['commute']),
    unattributedKmCost: sumPurpose(lines, ['unexplained_km']),
    unattributedFillCost: sumPurpose(lines, ['no_odometer_fills']),
    windowTimingCost: 0,
    miscellaneousCost: 0,
    driverMiscShare: driverOf(['unexplained_km', 'no_odometer_fills']),
    companyShare: v3.companyShare,
    driverShare: v3.driverShare,
    metadata: {
      ...report.metadata,
      engineVersion: FUEL_ENGINE_V3_VERSION,
      pricing: v3.pricing,
      chargedBy: FUEL_ENGINE_V3_VERSION,
    },
  };
}

/** A driver's week over several cars: each car priced on its own fills, then the lines joined. */
export type FuelV3Combined = Omit<FuelV3Result, 'costPerKm' | 'odometerKm' | 'cap' | 'pricing'> & {
  pricing: FuelV3Result['pricing'] | 'mixed';
  byVehicle: Array<{ vehicleId: string; result: FuelV3Result }>;
  /** Kept for old snapshots: true meant v3 had not split a multi-car Personal Allowance. Never set now. */
  personalAllowanceNotApplied?: boolean;
};

/**
 * Multi-car Personal Allowance: the earned km (worked out once on the driver's combined week)
 * are shared across the cars by each car's personal km, then each car is priced again from its
 * own fills. Each car still adds up to its own fuel bought, so the week does too.
 * Cars priced before this (`input` missing) are left as they are.
 */
export function applyMultiCarPersonalAllowance(
  parts: Array<{ vehicleId: string; result: FuelV3Result }>,
  earnedKm: number,
): Array<{ vehicleId: string; result: FuelV3Result }> {
  const totalPersonal = parts.reduce((s, p) => s + nonNeg(p.result.input?.km.personal), 0);
  const earned = Math.min(nonNeg(earnedKm), totalPersonal);
  if (!(earned > 0) || parts.some((p) => !p.result.input)) return parts;
  return parts.map((p) => {
    const input = p.result.input!;
    const share = earned * (nonNeg(input.km.personal) / totalPersonal);
    const result = priceFuelWeekV3({ ...input, personalAllowanceEarnedKm: share });
    for (const l of result.lines) l.vehicleId = p.vehicleId;
    return { vehicleId: p.vehicleId, result };
  });
}

export function combineFuelV3(parts: Array<{ vehicleId: string; result: FuelV3Result }>): FuelV3Combined {
  const lines = parts.flatMap((p) => p.result.lines.map((l) => ({ ...l, vehicleId: l.vehicleId || p.vehicleId })));
  const totalMinor = lines.reduce((s, l) => s + l.costMinor, 0);
  const driverMinor = lines.reduce((s, l) => s + l.driverMinor, 0);
  const companyMinor = lines.reduce((s, l) => s + l.companyMinor, 0);
  const pricings = new Set(parts.map((p) => p.result.pricing));
  return {
    engineVersion: FUEL_ENGINE_V3_VERSION,
    pricing: pricings.size === 1 ? [...pricings][0] : 'mixed',
    previewOnly: parts.some((p) => p.result.previewOnly),
    byVehicle: parts,
    lines,
    totalMinor,
    driverMinor,
    companyMinor,
    totalSpend: totalMinor / 100,
    driverShare: driverMinor / 100,
    companyShare: companyMinor / 100,
  };
}

export function priceFuelWeekV3(input: FuelV3Input): FuelV3Result {
  const spendOdo = nonNeg(input.spendWithOdometer);
  const spendNoOdo = nonNeg(input.spendNoOdometer);
  const km = {
    trips: nonNeg(input.km.trips),
    pickups: nonNeg(input.km.pickups),
    companyErrands: nonNeg(input.km.companyErrands),
    personal: nonNeg(input.km.personal),
    commute: nonNeg(input.km.commute),
  };
  const odometerKm = nonNeg(input.odometerKm);
  let lines: FuelV3Line[] = [];
  let pricing: FuelV3Result['pricing'] = 'none';
  let costPerKm: number | null = null;
  let cap: FuelV3Result['cap'] = null;
  let previewOnly = false;

  const purposeParts = (scale = 1): Part[] => [
    { purpose: 'uber_trips', km: km.trips * scale },
    { purpose: 'to_pickups', km: km.pickups * scale },
    { purpose: 'company_errands', km: km.companyErrands * scale },
    ...splitPersonal(km.personal * scale, (input.personalAllowanceEarnedKm ?? 0) * scale),
    { purpose: 'commute', km: km.commute * scale },
  ];
  const purposeKm = km.trips + km.pickups + km.companyErrands + km.personal + km.commute;

  if (input.chainUsable) {
    pricing = 'odometer';
    if (odometerKm > 0 && spendOdo > 0) {
      let scale = 1;
      if (purposeKm > odometerKm) {
        scale = odometerKm / purposeKm;
        const tripsReported = nonNeg(input.km.tripsReported ?? km.trips);
        cap = {
          beforeKm: purposeKm,
          afterKm: odometerKm,
          ratio: scale,
          tripsReportedKm: Math.max(tripsReported, km.trips),
          tripsPricedKm: km.trips * scale,
        };
      } else if (nonNeg(input.km.tripsReported) > km.trips) {
        // v2.2 already capped trip km against the odometer; record it (F-10).
        cap = {
          beforeKm: purposeKm - km.trips + nonNeg(input.km.tripsReported),
          afterKm: odometerKm,
          ratio: km.trips / nonNeg(input.km.tripsReported),
          tripsReportedKm: nonNeg(input.km.tripsReported),
          tripsPricedKm: km.trips,
        };
      }
      const parts = purposeParts(scale);
      const used = parts.reduce((s, p) => s + p.km, 0);
      parts.push({ purpose: 'unexplained_km', km: Math.max(0, odometerKm - used) });
      lines = priceParts(parts, toMinor(spendOdo), spendOdo, odometerKm, input);
      costPerKm = spendOdo / odometerKm;
    } else if (spendOdo > 0) {
      // Fills with an odometer but no distance between them: nothing to price by km.
      lines = priceParts(
        [{ purpose: 'unexplained_km', km: 1 }],
        toMinor(spendOdo),
        spendOdo,
        1,
        input,
      ).map((l) => ({ ...l, km: 0, costPerKm: null }));
    }
    if (spendNoOdo > 0) {
      const costMinor = toMinor(spendNoOdo);
      const d = Math.min(costMinor, roundMinor(driverJ('no_odometer_fills', spendNoOdo, input)));
      lines.push({
        purpose: 'no_odometer_fills',
        km: 0,
        costPerKm: null,
        costMinor,
        driverPct: spendNoOdo > 0 ? Math.round((d / costMinor) * 10000) / 100 : 0,
        driverMinor: d,
        companyMinor: costMinor - d,
      });
    }
  } else {
    // Chainless week (F-01 detail): priced by share of km over the purposes, never by usual
    // economy. Until the owner reviews the readings it is a preview only.
    pricing = 'km_share_fallback';
    previewOnly = !input.chainReviewed;
    const spend = spendOdo + spendNoOdo;
    if (spend > 0 && purposeKm > 0) {
      lines = priceParts(purposeParts(1), toMinor(spend), spend, purposeKm, input);
      costPerKm = spend / purposeKm;
    } else if (spend > 0) {
      // No km at all: the whole spend is unexplained, split by the leftover rule (F-12).
      const costMinor = toMinor(spend);
      const d = Math.min(costMinor, roundMinor(driverJ('unexplained_km', spend, input)));
      lines = [{
        purpose: 'unexplained_km',
        km: 0,
        costPerKm: null,
        costMinor,
        driverPct: Math.round((d / costMinor) * 10000) / 100,
        driverMinor: d,
        companyMinor: costMinor - d,
      }];
    }
  }

  // The leftover rule's fixed amount is capped once across its buckets, so the unexplained km
  // and no-odometer lines are split together in one call, not line by line.
  const unexplained = lines.find((l) => l.purpose === 'unexplained_km');
  const noOdo = lines.find((l) => l.purpose === 'no_odometer_fills');
  if (unexplained || noOdo) {
    const exactOf = (l: FuelV3Line | undefined) =>
      !l ? 0 : l.costPerKm != null && l.km > 0 ? l.km * l.costPerKm : l.costMinor / 100;
    const leftover = splitLeftoverFuel({
      variance: 0,
      unattributedKmCost: exactOf(unexplained),
      noOdometerFillCost: exactOf(noOdo),
      split: input.leftover,
      blockDriver: !!input.blockLeftoverDriver,
      blockReason: input.blockLeftoverDriver ? 'degraded_inputs' : undefined,
    });
    for (const [line, bucket] of [[unexplained, 'unattributedKm'], [noOdo, 'noOdometerFills']] as const) {
      if (!line) continue;
      const dJ = leftover.byBucket[bucket].driver;
      const d = dJ >= exactOf(line) - 0.005
        ? line.costMinor
        : Math.min(line.costMinor, Math.max(0, roundMinor(dJ)));
      line.driverMinor = d;
      line.companyMinor = line.costMinor - d;
      line.driverPct = line.costMinor > 0 ? Math.round((d / line.costMinor) * 10000) / 100 : 0;
    }
  }

  const totalMinor = lines.reduce((s, l) => s + l.costMinor, 0);
  const driverMinor = lines.reduce((s, l) => s + l.driverMinor, 0);
  const companyMinor = lines.reduce((s, l) => s + l.companyMinor, 0);
  return {
    engineVersion: FUEL_ENGINE_V3_VERSION,
    pricing,
    previewOnly,
    costPerKm,
    odometerKm,
    cap,
    lines,
    totalMinor,
    driverMinor,
    companyMinor,
    totalSpend: totalMinor / 100,
    driverShare: driverMinor / 100,
    companyShare: companyMinor / 100,
    input,
  };
}
