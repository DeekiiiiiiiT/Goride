/**
 * Week Reconciliation step 5 → "Distance and who pays" (fuel audit Part E screen 1, Part J
 * screens 1, 3, 9, 12, 17). Turns one driver's week report into car cards. Every number comes
 * from the report: the v3 lines (`metadata.fuelV3`) when present, else the saved v2.2 totals.
 */
import type { WeeklyFuelReport } from '@roam/fuel-core';

export type WhoPaysState = 'charged' | 'preview' | 'old_way';

export type WhoPaysPurpose =
  | 'uber_trips'
  | 'to_pickups'
  | 'company_errands'
  | 'personal'
  | 'personal_allowance'
  | 'commute'
  | 'unexplained_km'
  | 'no_odometer_fills';

export const PURPOSE_LABEL: Record<WhoPaysPurpose, string> = {
  uber_trips: 'Uber trips',
  to_pickups: 'To pickups',
  company_errands: 'Company errands',
  personal: 'Personal',
  personal_allowance: 'Personal Allowance',
  commute: 'Commute',
  unexplained_km: 'Unexplained km',
  no_odometer_fills: 'No-odometer fills',
};

/** Kinds of driving shown on every car, muted when 0 km (Part J1). */
const STANDARD_PURPOSES: WhoPaysPurpose[] = [
  'uber_trips',
  'to_pickups',
  'company_errands',
  'personal',
  'commute',
  'unexplained_km',
];

type V3Line = {
  purpose: WhoPaysPurpose;
  km: number;
  costPerKm: number | null;
  costMinor: number;
  driverPct: number;
  driverMinor: number;
  companyMinor: number;
  vehicleId?: string;
};

type V3Result = {
  pricing?: 'odometer' | 'km_share_fallback' | 'none' | 'mixed';
  previewOnly?: boolean;
  costPerKm?: number | null;
  odometerKm?: number;
  cap?: { beforeKm: number; afterKm: number; tripsReportedKm: number; tripsPricedKm: number } | null;
  lines?: V3Line[];
  totalMinor?: number;
  driverMinor?: number;
  companyMinor?: number;
  byVehicle?: Array<{ vehicleId: string; result: V3Result }>;
};

export type WhoPaysRow = {
  purpose: WhoPaysPurpose;
  label: string;
  km: number;
  costPerKm: number | null;
  cost: number;
  driverPct: number;
  driver: number;
  company: number;
};

export type WhoPaysCar = {
  key: string;
  vehicleId: string;
  plate: string;
  makeModel: string;
  driverId: string;
  driverName: string;
  state: WhoPaysState;
  ruleName: string | null;
  ruleFrom: string | null;
  fuelBought: number;
  gasCard: number | null;
  cash: number | null;
  km: number;
  odoFrom: number | null;
  odoTo: number | null;
  costPerKm: number | null;
  pricing: 'odometer' | 'km_share_fallback' | 'none';
  previewOnly: boolean;
  /** F-10 note, already in plain words. */
  capNote: string | null;
  rows: WhoPaysRow[];
  /** Standard kinds of driving with 0 km this week. */
  mutedRows: string[];
  personalAllowance: WhoPaysRow | null;
  noOdometer: WhoPaysRow | null;
  driver: number;
  company: number;
  total: number;
  /** driver + company − fuel bought, to the cent (0 = adds up). */
  difference: number;
  engineVersion: string | null;
};

export type WhoPaysComparison = {
  oldDriver: number;
  newDriver: number;
  /** newDriver − oldDriver (negative = the driver pays less the new way). */
  change: number;
  usualKmPerLiter: number | null;
  movedMost: { label: string; from: number; to: number } | null;
};

export type WhoPaysDriverWeek = {
  driverId: string;
  driverName: string;
  state: WhoPaysState;
  cars: WhoPaysCar[];
  /** Only for preview weeks: the charged (old way) driver amount vs the new way. */
  comparison: WhoPaysComparison | null;
};

export type WhoPaysVehicle = { id: string; licensePlate?: string; make?: string; model?: string };
export type WhoPaysFill = {
  vehicleId?: string;
  driverId?: string;
  amount?: number;
  /** True for a gas-card fill that counts in spend. */
  gasCard: boolean;
};

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const fromMinor = (m: number) => (Number(m) || 0) / 100;

function stateOf(report: WeeklyFuelReport, v3: V3Result | undefined): WhoPaysState {
  if (!v3 || !Array.isArray(v3.lines)) return 'old_way';
  return report.metadata?.chargedBy === 'fuel-chain-v3' ? 'charged' : 'preview';
}

function rowOf(l: V3Line): WhoPaysRow {
  return {
    purpose: l.purpose,
    label: PURPOSE_LABEL[l.purpose] || l.purpose,
    km: Number(l.km) || 0,
    costPerKm: l.costPerKm,
    cost: fromMinor(l.costMinor),
    driverPct: Number(l.driverPct) || 0,
    driver: fromMinor(l.driverMinor),
    company: fromMinor(l.companyMinor),
  };
}

/** "from 3 Aug 2026"; the legacy open window (2000-01-03) has no meaningful start. */
export function ruleFromLabel(effectiveFrom: string | null | undefined): string | null {
  const ymd = String(effectiveFrom || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || ymd < '2001-01-01') return null;
  const d = new Date(`${ymd}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function capNoteOf(cap: V3Result['cap']): string | null {
  if (!cap) return null;
  const over = Math.round((cap.tripsReportedKm || 0) - (cap.tripsPricedKm || 0));
  if (over <= 0) return null;
  const n = (x: number) => Math.round(x).toLocaleString('en-US');
  return `Uber's km were ${n(over)} km more than the odometer; trip km capped at ${n(cap.tripsPricedKm)}.`;
}

function buildCar(args: {
  report: WeeklyFuelReport;
  vehicleId: string;
  result: V3Result;
  single: boolean;
  state: WhoPaysState;
  vehicles: WhoPaysVehicle[];
  fills: WhoPaysFill[];
  driverName: string;
}): WhoPaysCar {
  const { report, vehicleId, result, single, state } = args;
  const meta = (report.metadata || {}) as Record<string, any>;
  const vehicle = args.vehicles.find((v) => v.id === vehicleId);
  const allRows = (result.lines || []).map(rowOf);
  const rows = allRows.filter(
    (r) => r.purpose !== 'personal_allowance' && r.purpose !== 'no_odometer_fills' && r.cost > 0,
  );
  const shown = new Set(rows.map((r) => r.purpose));
  const carFills = args.fills.filter(
    (f) => f.vehicleId === vehicleId && (!f.driverId || f.driverId === report.driverId),
  );
  const gasCard = carFills.length ? carFills.filter((f) => f.gasCard).reduce((s, f) => s + (Number(f.amount) || 0), 0) : null;
  const cash = carFills.length ? carFills.filter((f) => !f.gasCard).reduce((s, f) => s + (Number(f.amount) || 0), 0) : null;
  const driver = fromMinor(result.driverMinor ?? 0);
  const company = fromMinor(result.companyMinor ?? 0);
  const total = fromMinor(result.totalMinor ?? 0);
  const pricing = result.pricing === 'km_share_fallback' || result.pricing === 'none' ? result.pricing : 'odometer';
  return {
    key: `${report.driverId}:${vehicleId}`,
    vehicleId,
    plate: vehicle?.licensePlate || vehicleId,
    makeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(' '),
    driverId: report.driverId,
    driverName: args.driverName,
    state,
    ruleName: meta.scenarioName || null,
    ruleFrom: ruleFromLabel(meta.fuelPolicyVersion?.effectiveFrom),
    fuelBought: total,
    gasCard: gasCard != null && cash != null && Math.abs(gasCard + cash - total) < 0.01 ? gasCard : null,
    cash: gasCard != null && cash != null && Math.abs(gasCard + cash - total) < 0.01 ? cash : null,
    km: Number(result.odometerKm) || 0,
    odoFrom: single && Number(meta.spanStartOdometer) > 0 ? Number(meta.spanStartOdometer) : null,
    odoTo: single && Number(meta.spanEndOdometer) > 0 ? Number(meta.spanEndOdometer) : null,
    costPerKm: result.costPerKm ?? null,
    pricing,
    previewOnly: Boolean(result.previewOnly),
    capNote: capNoteOf(result.cap),
    rows,
    mutedRows: STANDARD_PURPOSES.filter((p) => !shown.has(p)).map((p) => PURPOSE_LABEL[p]),
    personalAllowance: allRows.find((r) => r.purpose === 'personal_allowance' && r.cost > 0) || null,
    noOdometer: allRows.find((r) => r.purpose === 'no_odometer_fills' && r.cost > 0) || null,
    driver,
    company,
    total,
    difference: fromMinor(cents(driver) + cents(company) - cents(total)),
    engineVersion: meta.engineVersion || null,
  };
}

/** The v2.2 bucket each new-way kind of driving compares against (screen 3, "moved most"). */
function movedMost(report: WeeklyFuelReport, v3: V3Result): WhoPaysComparison['movedMost'] {
  const lines = (v3.lines || []).map(rowOf);
  const sum = (ps: WhoPaysPurpose[]) => lines.filter((l) => ps.includes(l.purpose)).reduce((s, l) => s + l.cost, 0);
  const pairs: Array<{ label: string; from: number; to: number }> = [
    { label: 'Uber trips', from: Number(report.rideShareCost) || 0, to: sum(['uber_trips']) },
    { label: 'To pickups', from: Number(report.deadheadCost) || 0, to: sum(['to_pickups']) },
    { label: 'Company errands', from: Number(report.companyUsageCost) || 0, to: sum(['company_errands']) },
    { label: 'Personal', from: Number(report.personalUsageCost) || 0, to: sum(['personal', 'personal_allowance']) },
    { label: 'Commute', from: Number(report.commuteCost) || 0, to: sum(['commute']) },
  ];
  const best = pairs
    .map((p) => ({ ...p, delta: Math.abs(p.to - p.from) }))
    .sort((a, b) => b.delta - a.delta)[0];
  return best && best.delta >= 0.01 ? { label: best.label, from: best.from, to: best.to } : null;
}

export function buildWhoPaysWeek(args: {
  report: WeeklyFuelReport;
  vehicles: WhoPaysVehicle[];
  fills: WhoPaysFill[];
  driverName?: string;
}): WhoPaysDriverWeek {
  const { report } = args;
  const meta = (report.metadata || {}) as Record<string, any>;
  const v3 = meta.fuelV3 as V3Result | undefined;
  const state = stateOf(report, v3);
  const driverName = args.driverName || (report as { driverName?: string }).driverName || report.driverId;

  if (state === 'old_way') {
    const vehicle = args.vehicles.find((v) => v.id === report.vehicleId);
    const total = Number(report.totalGasCardCost) || 0;
    const driver = Number(report.driverShare) || 0;
    const company = Number(report.companyShare) || 0;
    return {
      driverId: report.driverId,
      driverName,
      state,
      comparison: null,
      cars: [
        {
          key: `${report.driverId}:${report.vehicleId}`,
          vehicleId: report.vehicleId,
          plate: vehicle?.licensePlate || (report.vehiclePlates || [])[0] || report.vehicleId,
          makeModel: [vehicle?.make, vehicle?.model].filter(Boolean).join(' '),
          driverId: report.driverId,
          driverName,
          state,
          ruleName: meta.scenarioName || null,
          ruleFrom: null,
          fuelBought: total,
          gasCard: null,
          cash: null,
          km:
            Number(meta.spanKm) ||
            (Number(meta.spanEndOdometer) > Number(meta.spanStartOdometer)
              ? Number(meta.spanEndOdometer) - Number(meta.spanStartOdometer)
              : 0),
          odoFrom: Number(meta.spanStartOdometer) > 0 ? Number(meta.spanStartOdometer) : null,
          odoTo: Number(meta.spanEndOdometer) > 0 ? Number(meta.spanEndOdometer) : null,
          costPerKm: null,
          pricing: 'odometer',
          previewOnly: false,
          capNote: null,
          rows: [],
          mutedRows: [],
          personalAllowance: null,
          noOdometer: null,
          driver,
          company,
          total,
          difference: fromMinor(cents(driver) + cents(company) - cents(total)),
          engineVersion: meta.engineVersion || null,
        },
      ],
    };
  }

  const parts = v3!.byVehicle?.length
    ? v3!.byVehicle
    : [{ vehicleId: report.vehicleId, result: v3! }];
  const cars = parts.map((p) =>
    buildCar({
      report,
      vehicleId: p.vehicleId,
      result: p.result,
      single: parts.length === 1,
      state,
      vehicles: args.vehicles,
      fills: args.fills,
      driverName,
    }),
  );
  const newDriver = fromMinor(v3!.driverMinor ?? 0);
  const comparison: WhoPaysComparison | null =
    state === 'preview'
      ? {
          oldDriver: Number(report.driverShare) || 0,
          newDriver,
          change: fromMinor(cents(newDriver) - cents(Number(report.driverShare) || 0)),
          usualKmPerLiter: Number(meta.referenceKmPerLiter) > 0 ? Number(meta.referenceKmPerLiter) : null,
          movedMost: movedMost(report, v3!),
        }
      : null;
  return { driverId: report.driverId, driverName, state, cars, comparison };
}
