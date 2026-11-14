/**
 * WRA-51: the pay tier adds fares from the 1st of the month. Fares must be
 * dated on their real (Jamaica) day — a week that starts in August must still
 * count its September days in September.
 * Real case: Kenny, week of 21 Sep 2026, High Performer policy.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { computeWeekCommissionShare } from "../../../../packages/finance-core/src/periodShareCash.ts";
import {
  rangeSummaryToCanonicalEvents,
  weekSummaryToCanonicalEvents,
  type RangeSummaryRow,
  type WeekSummaryRow,
} from "./readApi.ts";

const ORG = "8cfa606a-f6ea-4ccb-a2b2-1d2cc323a823";
const DRIVER = "73e5b1dc-01b4-45ee-a34a-25a3256b9841";

// High Performer tiers (live policy): 31% to 300,000, 33% from 300,001.
const TIERS = [
  { id: "gold", minEarnings: 150001, maxEarnings: 225000, sharePercentage: 29 },
  { id: "diamond", minEarnings: 225001, maxEarnings: 300000, sharePercentage: 31 },
  { id: "platinum", minEarnings: 300001, maxEarnings: 375000, sharePercentage: 33 },
  { id: "boss", minEarnings: 375001, maxEarnings: 1000000, sharePercentage: 35 },
];

function day(d: string, majorGross: number): RangeSummaryRow {
  const minor = Math.round(majorGross * 100);
  return {
    organization_id: ORG,
    day: d,
    driver_id: DRIVER,
    product: "roam_driver",
    entry_type: "fare_earning",
    platform: "uber",
    direction: "inflow",
    sum_minor: minor,
    abs_sum_minor: minor,
    gross_minor: minor,
    entry_count: 1,
  };
}

function week(weekStart: string, majorGross: number): WeekSummaryRow {
  const minor = Math.round(majorGross * 100);
  return {
    organization_id: ORG,
    week_start: weekStart,
    driver_id: DRIVER,
    product: "roam_driver",
    entry_type: "fare_earning",
    platform: "uber",
    direction: "inflow",
    sum_minor: minor,
    abs_sum_minor: minor,
    gross_minor: minor,
    entry_count: 1,
    reconciled_count: 0,
    last_entry_at: null,
  };
}

// Live totals: 31 Aug 300.00, 1–6 Sep 76,609.30, then the three September weeks.
const DAYS: RangeSummaryRow[] = [
  day("2026-08-31", 300),
  day("2026-09-03", 76609.3),
  day("2026-09-10", 99402.4),
  day("2026-09-17", 88926.85),
  day("2026-09-24", 102688.43),
];
const WEEKS: WeekSummaryRow[] = [
  week("2026-08-31", 76909.3),
  week("2026-09-07", 99402.4),
  week("2026-09-14", 88926.85),
  week("2026-09-21", 102688.43),
];

function share(fareEntries: Record<string, unknown>[]) {
  return computeWeekCommissionShare({
    fareEntries: fareEntries as never,
    periodAnchor: "2026-09-21",
    periodEnd: "2026-09-27",
    tiers: TIERS,
    timezone: "America/Jamaica",
  });
}

Deno.test("WRA-51: day-dated fares keep 1–6 Sep in September → 33%", () => {
  const out = share(rangeSummaryToCanonicalEvents(DAYS));
  assertEquals(out.grossRevenue, 102688.43);
  assertEquals(out.driverSharePercent, 33);
  assertEquals(out.driverShare, 33887.18);
});

Deno.test("WRA-51: Monday-dated week sums drop 1–6 Sep into August (the bug) → 31%", () => {
  const out = share(weekSummaryToCanonicalEvents(WEEKS));
  assertEquals(out.grossRevenue, 102688.43);
  assertEquals(out.driverSharePercent, 31);
});

Deno.test("WRA-51: day events carry the Jamaica day as their date", () => {
  const [e] = rangeSummaryToCanonicalEvents([day("2026-09-01", 10)]);
  assertEquals(e.date, "2026-09-01");
  assertEquals(e.grossAmount, 10);
  assertEquals(e.eventType, "fare_earning");
});
