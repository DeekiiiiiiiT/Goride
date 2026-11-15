/**
 * Week result for a closed week (owner, 15 Nov 2026): Revenue − Expenses = Profit,
 * shared as Fleet profit + Driver profit. Added up over every driver's closed
 * statements for the week, so it reads only frozen numbers.
 *
 *   Revenue        = Σ earnings.gross (fares + tips)
 *   Expenses       = Σ fuel.totalSpend + Σ (toll.totalSpend − toll.reimbursed)
 *   Profit         = Revenue − Expenses
 *   Driver profit  = Σ (earnings.driverShare + earnings.tipsPaidToDriver
 *                       − fuel.driverShare − toll.chargedToDriver)
 *   Fleet profit   = Profit − Driver profit
 * All sums are in minor units (cents) so the parts always add up exactly.
 */

export type WeekStatementRow = {
  kind: string;
  driverId: string | null;
  version: number;
  amountsMinor: Record<string, unknown> | null;
};

export type WeekResult = {
  revenueMinor: number;
  expensesMinor: number;
  fuelMinor: number;
  tollsMinor: number;
  profitMinor: number;
  fleetProfitMinor: number;
  driverProfitMinor: number;
  /** Whole percent of revenue; null when revenue is 0. */
  marginPercent: number | null;
  /** Whole percents of profit; null when profit is 0 or below. */
  fleetSharePercent: number | null;
  driverSharePercent: number | null;
  driverCount: number;
};

function minor(a: Record<string, unknown> | null | undefined, key: string): number {
  const n = Number(a?.[key]);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Latest closed statement per (driver, kind); callers pass closed rows only. */
function latestByDriverKind(rows: WeekStatementRow[]): Map<string, WeekStatementRow> {
  const out = new Map<string, WeekStatementRow>();
  for (const r of rows) {
    const key = `${r.driverId ?? ''}|${r.kind}`;
    const cur = out.get(key);
    if (!cur || Number(r.version) > Number(cur.version)) out.set(key, r);
  }
  return out;
}

export function computeWeekResult(rows: WeekStatementRow[]): WeekResult {
  let revenue = 0;
  let fuel = 0;
  let tolls = 0;
  let driverProfit = 0;
  const drivers = new Set<string>();
  for (const r of latestByDriverKind(rows).values()) {
    const a = r.amountsMinor;
    if (r.kind === 'earnings') {
      revenue += minor(a, 'gross');
      driverProfit += minor(a, 'driverShare') + minor(a, 'tipsPaidToDriver');
      if (r.driverId) drivers.add(r.driverId);
    } else if (r.kind === 'fuel') {
      fuel += minor(a, 'totalSpend');
      driverProfit -= minor(a, 'driverShare');
    } else if (r.kind === 'toll') {
      tolls += minor(a, 'totalSpend') - minor(a, 'reimbursed');
      driverProfit -= minor(a, 'chargedToDriver');
    }
  }
  const expenses = fuel + tolls;
  const profit = revenue - expenses;
  const fleetProfit = profit - driverProfit;
  const pct = (part: number, whole: number) => Math.round((part / whole) * 100);
  const fleetSharePercent = profit > 0 ? pct(fleetProfit, profit) : null;
  return {
    revenueMinor: revenue,
    expensesMinor: expenses,
    fuelMinor: fuel,
    tollsMinor: tolls,
    profitMinor: profit,
    fleetProfitMinor: fleetProfit,
    driverProfitMinor: driverProfit,
    marginPercent: revenue !== 0 ? pct(profit, revenue) : null,
    fleetSharePercent,
    // The two share chips always add up to 100.
    driverSharePercent: fleetSharePercent == null ? null : 100 - fleetSharePercent,
    driverCount: drivers.size,
  };
}
