/**
 * Pure Vehicle Analytics aggregators — attributable data only, no estimates.
 */
import { eachDayOfInterval, format, parseISO } from 'date-fns';
import type { Trip, VehicleMetrics } from '../types/data';
import type { Vehicle } from '../types/vehicle';
import type { BusinessFinancePeriod } from '../components/business-finance/types';
import { inPeriod, ymd } from '../components/business-finance/periodRange';
import { getEffectiveTripEarnings, getTripGrossRevenue } from './tripEarnings';
import { recognizePlatformGrossAndFees } from './platformFeeRecognition';
import { computeFuelFleetLossNetting } from './fuelFleetLossNetting';
import { computeTollFleetLossNetting } from './tollFleetLossNetting';
import { tollEventAmount, tollEventDate } from './tollFleetLossNetting';

export function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

export function tripDateYmd(t: Trip): string {
  return String(t.date || '').slice(0, 10);
}

export function filterTripsInPeriod(trips: Trip[], period: BusinessFinancePeriod): Trip[] {
  return trips.filter((t) => inPeriod(tripDateYmd(t), period));
}

export function revenuePerTrip(revenue: number, completedTrips: number): number | null {
  if (completedTrips <= 0) return null;
  return revenue / completedTrips;
}

export function revenuePerKm(revenue: number, distanceKm: number): number | null {
  if (distanceKm <= 0) return null;
  return revenue / distanceKm;
}

export function cancellationRate(completed: number, cancelled: number): number | null {
  const total = completed + cancelled;
  if (total <= 0) return null;
  return (cancelled / total) * 100;
}

/** Idle/open hours only when imported metrics have usable time fields. */
export function idleHoursFromMetrics(m: VehicleMetrics | undefined): number | null {
  if (!m) return null;
  if (m.onlineHours != null && m.onlineHours > 0 && m.onTripHours != null) {
    return Math.max(0, m.onlineHours - m.onTripHours);
  }
  if (m.openTime != null && m.openTime > 0) return m.openTime;
  return null;
}

export function utilizationFromMetrics(m: VehicleMetrics | undefined): number | null {
  if (!m || !(m.onlineHours > 0) || m.onTripHours == null) return null;
  return (m.onTripHours / m.onlineHours) * 100;
}

export type CostBuckets = {
  fuel: number;
  tolls: number;
  maintenance: number;
  insurance: number;
  fixedOther: number;
  operating: number;
  cleaning: number;
  platformFees: number;
  total: number;
};

function emptyCosts(): CostBuckets {
  return {
    fuel: 0,
    tolls: 0,
    maintenance: 0,
    insurance: 0,
    fixedOther: 0,
    operating: 0,
    cleaning: 0,
    platformFees: 0,
    total: 0,
  };
}

function ledgerVehicleId(e: Record<string, unknown>): string | null {
  const id = e.vehicleId != null ? String(e.vehicleId).trim() : '';
  if (!id || id === 'unknown') return null;
  return id;
}

function isCleaningCategory(e: Record<string, unknown>): boolean {
  const cat = String(e.category || e.description || '').toLowerCase();
  return cat.includes('clean');
}

function isInsuranceCategory(e: Record<string, unknown>): boolean {
  const cat = String(e.category || '').toLowerCase();
  return cat.includes('insurance');
}

/**
 * Split ledger events into attributable (have vehicleId) vs unattributed fleet costs.
 * Uses the same fuel/toll netting and fee recognition as Business Finance.
 */
export function aggregateLedgerCosts(
  events: Record<string, unknown>[],
  period: BusinessFinancePeriod,
): {
  fleetCosts: CostBuckets;
  byVehicle: Map<string, CostBuckets>;
  unattributedTotal: number;
  attributedCostTotal: number;
  coveragePct: number | null;
  fleetGross: number;
  fleetFees: number;
  fleetOperatingProfit: number;
} {
  const scoped = (events || []).filter((e) => inPeriod(tollEventDate(e), period));
  const attributed = scoped.filter((e) => ledgerVehicleId(e));
  const unattributed = scoped.filter((e) => !ledgerVehicleId(e));

  const fleetRecognized = recognizePlatformGrossAndFees(scoped);
  const fleetFuel = computeFuelFleetLossNetting(scoped).net;
  const fleetToll = computeTollFleetLossNetting(scoped).net;

  let fleetMaint = 0;
  let fleetInsurance = 0;
  let fleetFixedOther = 0;
  let fleetOperating = 0;
  let fleetCleaning = 0;
  let driverPayouts = 0;
  let otherIncome = 0;

  for (const e of scoped) {
    const type = String(e.eventType || '');
    const amt = tollEventAmount(e);
    if (type === 'maintenance') fleetMaint += amt;
    else if (type === 'fixed_expense') {
      if (isInsuranceCategory(e)) fleetInsurance += amt;
      else fleetFixedOther += amt;
    } else if (type === 'operating_expense') {
      if (isCleaningCategory(e)) fleetCleaning += amt;
      else fleetOperating += amt;
    } else if (type === 'other_income') otherIncome += amt;
    else if (type === 'payout_cash' || type === 'driver_payout') driverPayouts += amt;
  }

  const fleetCosts: CostBuckets = {
    fuel: fleetFuel,
    tolls: fleetToll,
    maintenance: fleetMaint,
    insurance: fleetInsurance,
    fixedOther: fleetFixedOther,
    operating: fleetOperating,
    cleaning: fleetCleaning,
    platformFees: fleetRecognized.totalFees,
    total: 0,
  };
  fleetCosts.total =
    fleetCosts.fuel +
    fleetCosts.tolls +
    fleetCosts.maintenance +
    fleetCosts.insurance +
    fleetCosts.fixedOther +
    fleetCosts.operating +
    fleetCosts.cleaning +
    fleetCosts.platformFees;

  const netTrip = fleetRecognized.totalGross - fleetRecognized.totalFees;
  const fleetOperatingProfit =
    netTrip +
    otherIncome -
    fleetFuel -
    fleetToll -
    fleetMaint -
    fleetInsurance -
    fleetFixedOther -
    fleetOperating -
    fleetCleaning -
    driverPayouts;

  // Per-vehicle attributable costs (only events with vehicleId)
  const byVehicle = new Map<string, CostBuckets>();
  const attributedByVehicle = new Map<string, Record<string, unknown>[]>();
  for (const e of attributed) {
    const vid = ledgerVehicleId(e)!;
    if (!attributedByVehicle.has(vid)) attributedByVehicle.set(vid, []);
    attributedByVehicle.get(vid)!.push(e);
  }

  for (const [vid, vEvents] of attributedByVehicle) {
    const recognized = recognizePlatformGrossAndFees(vEvents);
    const fuel = computeFuelFleetLossNetting(vEvents).net;
    const tolls = computeTollFleetLossNetting(vEvents).net;
    let maintenance = 0;
    let insurance = 0;
    let fixedOther = 0;
    let operating = 0;
    let cleaning = 0;
    for (const e of vEvents) {
      const type = String(e.eventType || '');
      const amt = tollEventAmount(e);
      if (type === 'maintenance') maintenance += amt;
      else if (type === 'fixed_expense') {
        if (isInsuranceCategory(e)) insurance += amt;
        else fixedOther += amt;
      } else if (type === 'operating_expense') {
        if (isCleaningCategory(e)) cleaning += amt;
        else operating += amt;
      }
    }
    const costs: CostBuckets = {
      fuel,
      tolls,
      maintenance,
      insurance,
      fixedOther,
      operating,
      cleaning,
      platformFees: recognized.totalFees,
      total: 0,
    };
    costs.total =
      costs.fuel +
      costs.tolls +
      costs.maintenance +
      costs.insurance +
      costs.fixedOther +
      costs.operating +
      costs.cleaning +
      costs.platformFees;
    byVehicle.set(vid, costs);
  }

  let attributedCostTotal = 0;
  for (const c of byVehicle.values()) attributedCostTotal += c.total;

  // Unattributed = fleet total costs minus sum of attributed vehicle costs
  const unattributedTotal = Math.max(0, fleetCosts.total - attributedCostTotal);
  const coveragePct =
    fleetCosts.total > 0.005 ? (attributedCostTotal / fleetCosts.total) * 100 : null;

  // Silence unused warning for unattributed events list (coverage uses totals)
  void unattributed;

  return {
    fleetCosts,
    byVehicle,
    unattributedTotal,
    attributedCostTotal,
    coveragePct,
    fleetGross: fleetRecognized.totalGross,
    fleetFees: fleetRecognized.totalFees,
    fleetOperatingProfit,
  };
}

export type DailyCostPoint = {
  name: string;
  dateYmd: string;
  revenue: number;
  fuel: number;
  tolls: number;
  maintenance: number;
  fixed: number;
  operating: number;
  fees: number;
  totalCost: number;
};

/** Daily revenue (trips) overlaid with dated ledger cost categories. */
export function buildDailyCostBreakdown(
  trips: Trip[],
  events: Record<string, unknown>[],
  period: BusinessFinancePeriod,
): DailyCostPoint[] {
  let days: Date[];
  try {
    days = eachDayOfInterval({ start: parseISO(period.startYmd), end: parseISO(period.endYmd) });
  } catch {
    return [];
  }

  const map = new Map<string, DailyCostPoint>();
  for (const d of days) {
    const key = ymd(d);
    map.set(key, {
      name: format(d, 'MMM d'),
      dateYmd: key,
      revenue: 0,
      fuel: 0,
      tolls: 0,
      maintenance: 0,
      fixed: 0,
      operating: 0,
      fees: 0,
      totalCost: 0,
    });
  }

  for (const t of filterTripsInPeriod(trips, period)) {
    const key = tripDateYmd(t);
    const row = map.get(key);
    if (!row) continue;
    row.revenue += getTripGrossRevenue(t);
  }

  for (const e of events) {
    const key = String(tollEventDate(e) || '').slice(0, 10);
    const row = map.get(key);
    if (!row) continue;
    const type = String(e.eventType || '');
    const amt = tollEventAmount(e);
    if (type === 'fuel_expense') row.fuel += amt;
    else if (type === 'fuel_charge_offset') row.fuel -= amt;
    else if (type === 'toll_charge') row.tolls += amt;
    else if (type === 'toll_refund' || type === 'toll_charge_offset') row.tolls -= amt;
    else if (type === 'maintenance') row.maintenance += amt;
    else if (type === 'fixed_expense') row.fixed += amt;
    else if (type === 'operating_expense') row.operating += amt;
    else if (type === 'platform_fee') row.fees += Math.abs(amt);
  }

  return Array.from(map.values()).map((r) => {
    r.fuel = Math.max(0, r.fuel);
    r.tolls = Math.max(0, r.tolls);
    r.totalCost = r.fuel + r.tolls + r.maintenance + r.fixed + r.operating + r.fees;
    r.revenue = Number(r.revenue.toFixed(2));
    return r;
  });
}

export type CommissionRow = {
  vehicleId: string;
  label: string;
  gross: number;
  fees: number;
  feeRatePct: number | null;
};

/** Recognized platform fees by vehicle — only events with vehicleId. */
export function commissionByVehicle(
  events: Record<string, unknown>[],
  period: BusinessFinancePeriod,
  vehicles: Vehicle[],
): CommissionRow[] {
  const scoped = (events || []).filter((e) => inPeriod(tollEventDate(e), period) && ledgerVehicleId(e));
  const byVid = new Map<string, Record<string, unknown>[]>();
  for (const e of scoped) {
    const vid = ledgerVehicleId(e)!;
    if (!byVid.has(vid)) byVid.set(vid, []);
    byVid.get(vid)!.push(e);
  }
  const labelOf = (id: string) => {
    const v = vehicles.find((x) => x.id === id);
    return v?.licensePlate || id;
  };
  const rows: CommissionRow[] = [];
  for (const [vid, vEvents] of byVid) {
    const rec = recognizePlatformGrossAndFees(vEvents);
    if (rec.totalGross <= 0 && rec.totalFees <= 0) continue;
    rows.push({
      vehicleId: vid,
      label: labelOf(vid),
      gross: rec.totalGross,
      fees: rec.totalFees,
      feeRatePct: rec.totalGross > 0 ? (rec.totalFees / rec.totalGross) * 100 : null,
    });
  }
  return rows.sort((a, b) => b.fees - a.fees);
}

export type VehicleProfitRow = {
  vehicleId: string;
  label: string;
  revenue: number;
  attributedCosts: number;
  profit: number;
  marginPct: number;
  hasAttributedCosts: boolean;
};

export function profitByVehicle(
  trips: Trip[],
  costsByVehicle: Map<string, CostBuckets>,
  vehicles: Vehicle[],
  period: BusinessFinancePeriod,
): VehicleProfitRow[] {
  const periodTrips = filterTripsInPeriod(trips, period);
  const revByVid = new Map<string, number>();
  for (const t of periodTrips) {
    if (!t.vehicleId || t.vehicleId === 'unknown') continue;
    revByVid.set(t.vehicleId, (revByVid.get(t.vehicleId) || 0) + getTripGrossRevenue(t));
  }
  const ids = new Set([...revByVid.keys(), ...costsByVehicle.keys()]);
  const rows: VehicleProfitRow[] = [];
  for (const id of ids) {
    const v = vehicles.find((x) => x.id === id);
    const revenue = revByVid.get(id) || 0;
    const costs = costsByVehicle.get(id);
    const attributedCosts = costs?.total ?? 0;
    const hasAttributedCosts = !!costs && costs.total > 0.005;
    if (revenue <= 0 && !hasAttributedCosts) continue;
    const profit = revenue - attributedCosts;
    rows.push({
      vehicleId: id,
      label: v?.licensePlate || id,
      revenue,
      attributedCosts,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      hasAttributedCosts,
    });
  }
  return rows.sort((a, b) => b.revenue - a.revenue);
}

export type HeatCell = { intensity: number; count: number };
export type HeatmapData = {
  rows: string[];
  days: string[];
  cells: HeatCell[][];
  maxCount: number;
};

export const HEAT_ROWS = [
  { label: '06–10', from: 6, to: 10 },
  { label: '10–14', from: 10, to: 14 },
  { label: '14–18', from: 14, to: 18 },
  { label: '18–00', from: 18, to: 24 },
];
export const HEAT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function buildUtilizationHeatmap(trips: Trip[]): HeatmapData {
  const counts: number[][] = HEAT_ROWS.map(() => HEAT_DAYS.map(() => 0));
  trips.forEach((t) => {
    const when = new Date(t.requestTime || t.date);
    if (isNaN(when.getTime())) return;
    const hour = when.getHours();
    const dayIdx = (when.getDay() + 6) % 7;
    const rowIdx = HEAT_ROWS.findIndex((r) => hour >= r.from && hour < r.to);
    if (rowIdx === -1) return;
    counts[rowIdx][dayIdx] += 1;
  });
  const maxCount = Math.max(1, ...counts.flat());
  return {
    rows: HEAT_ROWS.map((r) => r.label),
    days: HEAT_DAYS,
    cells: counts.map((row) => row.map((count) => ({ count, intensity: count / maxCount }))),
    maxCount,
  };
}

export function tripsInHeatCell(
  trips: Trip[],
  rowIdx: number,
  dayIdx: number,
): Trip[] {
  const band = HEAT_ROWS[rowIdx];
  if (!band) return [];
  return trips.filter((t) => {
    const when = new Date(t.requestTime || t.date);
    if (isNaN(when.getTime())) return false;
    const hour = when.getHours();
    const dIdx = (when.getDay() + 6) % 7;
    return dIdx === dayIdx && hour >= band.from && hour < band.to;
  });
}

export function sparklineBuckets(
  trips: Trip[],
  period: BusinessFinancePeriod,
  valueFn: (t: Trip) => number,
): number[] {
  let days: Date[];
  try {
    days = eachDayOfInterval({ start: parseISO(period.startYmd), end: parseISO(period.endYmd) });
  } catch {
    return [];
  }
  // Cap sparkline to last 14 day points for readability on long custom ranges
  const slice = days.length > 14 ? days.slice(-14) : days;
  return slice.map((d) => {
    const key = ymd(d);
    return trips
      .filter((t) => tripDateYmd(t) === key)
      .reduce((s, t) => s + valueFn(t), 0);
  });
}

export { getEffectiveTripEarnings, getTripGrossRevenue, emptyCosts };
