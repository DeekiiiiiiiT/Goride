/**
 * Driver Settlements → a driver's fuel lines for one week (fuel audit Part E screen 4,
 * Part J screens 13, 14). Pure: the route loads the lines, the periods and the statement.
 * Lines are never edited: a reopen marks them reversed and the next lock writes new ones.
 */

export type DriverWeekLineRow = {
  id?: unknown;
  period_id?: unknown;
  vehicle_id?: unknown;
  driver_id?: unknown;
  purpose?: unknown;
  km?: unknown;
  cost_per_km_minor?: unknown;
  driver_pct?: unknown;
  driver_amount_minor?: unknown;
  reversed_by?: unknown;
  reversed_at?: unknown;
  reversal_reason?: unknown;
  created_at?: unknown;
};

export type DriverWeekFuelLine = {
  id: string;
  vehicleId: string;
  purpose: string;
  km: number;
  /** J$ per km (exact, unrounded); null for a line not priced by km. */
  costPerKm: number | null;
  driverPct: number;
  /** J$, from minor units. */
  driverPays: number;
  status: 'current' | 'reversed';
  reversedAt: string | null;
  reversedBy: string | null;
};

export type DriverWeekFuelState =
  /** Locked with fuel lines (fuel engine v3). */
  | 'lines'
  /** Locked before fuel lines existed (v2.2): one "Fuel deduction" amount. */
  | 'old_way'
  /** Not locked yet (or reopened): the charge appears when the week locks. */
  | 'open';

export type DriverWeekFuel = {
  state: DriverWeekFuelState;
  /** Reversed lines sit right above the current line for the same car and kind of driving. */
  lines: DriverWeekFuelLine[];
  /** Σ current lines' driver part, J$. */
  currentTotal: number;
  /** The driver's fuel statement for the week, J$ (null when there is none). */
  statementDriverPays: number | null;
  /** lines state only: do the current lines add up to the statement to the cent? */
  matches: boolean | null;
  /** old_way only: the single fuel deduction. */
  oldWayDeduction: number | null;
  /** The latest reopen that reversed this driver's lines. */
  reopened: { by: string | null; at: string } | null;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown) => (v == null ? '' : String(v));

export function buildDriverWeekFuel(input: {
  /** This driver's lines for every fuel period of the week (current and reversed). */
  lines: DriverWeekLineRow[];
  /** A fuel period of this week is locked. */
  weekLocked: boolean;
  /** Latest fuel statement driver share, minor units (null when none). */
  statementDriverMinor: number | null;
}): DriverWeekFuel {
  const mapped: DriverWeekFuelLine[] = input.lines.map((l) => {
    const cpk = l.cost_per_km_minor == null ? null : num(l.cost_per_km_minor) / 100;
    return {
      id: str(l.id),
      vehicleId: str(l.vehicle_id),
      purpose: str(l.purpose),
      km: num(l.km),
      costPerKm: cpk != null && cpk > 0 ? cpk : null,
      driverPct: num(l.driver_pct),
      driverPays: Math.round(num(l.driver_amount_minor)) / 100,
      status: l.reversed_at ? 'reversed' : 'current',
      reversedAt: l.reversed_at ? str(l.reversed_at) : null,
      reversedBy: l.reversed_by ? str(l.reversed_by) : null,
    };
  });

  // Order: current lines as written; each car + kind's reversed lines just above its current one.
  const key = (l: DriverWeekFuelLine) => `${l.vehicleId}|${l.purpose}`;
  const current = mapped.filter((l) => l.status === 'current');
  const reversed = mapped
    .filter((l) => l.status === 'reversed')
    .sort((a, b) => str(a.reversedAt).localeCompare(str(b.reversedAt)));
  const ordered: DriverWeekFuelLine[] = [];
  const placed = new Set<string>();
  for (const c of current) {
    for (const r of reversed) {
      if (key(r) === key(c) && !placed.has(r.id)) {
        ordered.push(r);
        placed.add(r.id);
      }
    }
    ordered.push(c);
  }
  for (const r of reversed) if (!placed.has(r.id)) ordered.push(r);

  const currentMinor = current.reduce((s, l) => s + Math.round(l.driverPays * 100), 0);
  const statementDriverPays = input.statementDriverMinor == null ? null : input.statementDriverMinor / 100;
  const state: DriverWeekFuelState = !input.weekLocked ? 'open' : current.length > 0 ? 'lines' : 'old_way';
  const lastReverse = reversed[reversed.length - 1];
  return {
    state,
    lines: ordered,
    currentTotal: currentMinor / 100,
    statementDriverPays,
    matches: state === 'lines' && input.statementDriverMinor != null ? currentMinor === input.statementDriverMinor : null,
    oldWayDeduction: state === 'old_way' ? statementDriverPays : null,
    reopened: lastReverse?.reversedAt ? { by: lastReverse.reversedBy, at: lastReverse.reversedAt } : null,
  };
}
