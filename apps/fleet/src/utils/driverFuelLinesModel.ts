/**
 * Driver Settlements → Fuel card (fuel audit Part E screen 4, Part J screens 13, 14).
 * Display helpers for GET /fuel/driver-week-lines.
 */
import type { DriverWeekFuel } from '@roam/fuel-core';
import { formatFuelMoney } from './formatFuelMoney';
import { dayLabel, fleetYmd } from './fuelChecksModel';
import { PURPOSE_LABEL, type WhoPaysPurpose } from './fuelWhoPaysModel';

export type DriverWeekFuelResponse = DriverWeekFuel & {
  driverId: string;
  weekStart: string;
  plates: Record<string, string>;
  actorNames: Record<string, string>;
};

export function purposeLabel(purpose: string): string {
  return PURPOSE_LABEL[purpose as WhoPaysPurpose] || purpose;
}

/** "Tue 24 Nov, 9:12 AM" in fleet time (America/Jamaica, UTC−5). */
export function fleetDayTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t - 5 * 3_600_000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${dayLabel(fleetYmd(iso))}, ${h12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

export function reversedChip(reversedAt: string | null): string {
  return reversedAt ? `Reversed ${dayLabel(fleetYmd(reversedAt))} (week reopened)` : 'Reversed (week reopened)';
}

/** Green when the current lines equal the statement; red naming the difference when not. */
export function matchLine(data: Pick<DriverWeekFuel, 'matches' | 'currentTotal' | 'statementDriverPays'>): {
  ok: boolean;
  text: string;
} | null {
  if (data.matches == null) return null;
  if (data.matches) return { ok: true, text: 'Matches the fuel statement for this week.' };
  const st = Number(data.statementDriverPays) || 0;
  const diff = Math.abs(data.currentTotal - st);
  return {
    ok: false,
    text: `Doesn't match the fuel statement for this week: the lines add up to ${formatFuelMoney(
      data.currentTotal,
    )}, the statement says ${formatFuelMoney(st)} (${formatFuelMoney(diff)} apart).`,
  };
}

export function reopenedLine(data: Pick<DriverWeekFuelResponse, 'reopened' | 'actorNames'>): string | null {
  const r = data.reopened;
  if (!r) return null;
  const who = (r.by && data.actorNames[r.by]) || '';
  return `Reopened${who ? ` by ${who}` : ''} · ${fleetDayTime(r.at)}`;
}
