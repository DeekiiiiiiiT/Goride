/**
 * F-13: last 8 weeks km/L series for a vehicle (read route).
 */
import { addDaysYmd } from "../../../packages/fuel-core/src/fleetTime.ts";
import {
  buildWeekEconomyRows,
  economyDriftThreeWeeksRunning,
} from "../../../packages/fuel-core/src/fuelEconomyByWeek.ts";
import {
  referenceEfficiencyFromFills,
  type ReferenceFill,
} from "../../../packages/fuel-core/src/referenceEfficiency.ts";
import { queryFleet } from "./repos/baseRepo.ts";

function ymd(d: unknown): string {
  return String(d || "").slice(0, 10);
}

function weekStartMonday(dayYmd: string): string {
  const [y, m, d] = dayYmd.split("-").map(Number);
  if (!y || !m || !d) return dayYmd;
  const utc = new Date(Date.UTC(y, m - 1, d));
  const dow = utc.getUTCDay();
  const delta = dow === 0 ? -6 : 1 - dow;
  utc.setUTCDate(utc.getUTCDate() + delta);
  return utc.toISOString().slice(0, 10);
}

function priorEightWeekStarts(asOfWeekStart: string): string[] {
  let cur = asOfWeekStart;
  const out: string[] = [];
  for (let i = 0; i < 8; i++) {
    out.unshift(cur);
    cur = weekStartMonday(addDaysYmd(cur, -7));
  }
  return out;
}

export type EconomyFill = { date: string; odometer: number; liters: number };

/**
 * One row per real fill (audit A2: "card fills counted once"). Until F-07 ships, a gas-card
 * fill is stored twice (scan + statement line) with the same date and odometer; keep the
 * copy that carries litres.
 */
export function dedupeFills(fills: EconomyFill[]): EconomyFill[] {
  const byKey = new Map<string, EconomyFill>();
  for (const f of fills) {
    if (!(f.odometer > 0)) continue;
    const key = `${f.date}|${f.odometer}`;
    const prev = byKey.get(key);
    if (!prev || (!(prev.liters > 0) && f.liters > 0)) byKey.set(key, f);
  }
  return [...byKey.values()].sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
}

/**
 * Fill to fill: the litres put in at fill i paid for the km since fill i−1. A week's economy
 * = Σ km(i−1 → i) ÷ Σ litres(i) over the fills i dated in that week. A fill in the week with
 * no litres yet (waiting for its card statement) makes the week "—" (null), as Part E says.
 */
export function kmPerLiterForWeek(
  allFillsSorted: EconomyFill[],
  weekStart: string,
  weekEnd: string,
): number | null {
  let km = 0;
  let liters = 0;
  for (let i = 1; i < allFillsSorted.length; i++) {
    const f = allFillsSorted[i];
    if (f.date < weekStart || f.date > weekEnd) continue;
    if (!(f.liters > 0)) return null;
    km += f.odometer - allFillsSorted[i - 1].odometer;
    liters += f.liters;
  }
  if (!(liters > 0) || !(km > 0)) return null;
  return km / liters;
}

export async function loadVehicleEconomyWeeks(
  orgId: string,
  vehicleId: string,
  asOfWeekStart: string,
): Promise<{
  weeks: ReturnType<typeof buildWeekEconomyRows>;
  economyDriftAlert: boolean;
  referenceKmPerLiter: number | null;
}> {
  const anchor = weekStartMonday(asOfWeekStart);
  const weekStarts = priorEightWeekStarts(anchor);
  const from = addDaysYmd(weekStarts[0]!, -56);
  const to = addDaysYmd(weekStarts[weekStarts.length - 1]!, 6);

  const res = await queryFleet("fuel_entries", {
    org: orgId,
    dateFrom: from,
    dateTo: to,
    eq: { vehicleId },
    order: { col: "date", ascending: true },
    limit: 5000,
  });
  if (res.error) throw res.error;

  const fills = dedupeFills(
    (res.data as Array<Record<string, unknown>>).map((row) => ({
      date: ymd(row.date),
      odometer: Number(row.odometer) || 0,
      liters: Number(row.liters) || 0,
    })),
  );

  const ref = referenceEfficiencyFromFills(fills as ReferenceFill[], addDaysYmd(anchor, 7));
  const referenceKmPerLiter = ref.kmPerLiter;

  const weeks = weekStarts.map((weekStart) => ({
    weekStart,
    kmPerLiter: kmPerLiterForWeek(fills, weekStart, addDaysYmd(weekStart, 6)),
  }));

  const rows = buildWeekEconomyRows({ weeks, referenceKmPerLiter });
  return {
    weeks: rows,
    economyDriftAlert: economyDriftThreeWeeksRunning(rows),
    referenceKmPerLiter,
  };
}