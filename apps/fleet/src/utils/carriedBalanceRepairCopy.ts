import { CORRECTIONS_LAND_ON } from '@roam/finance-core';
import { formatJMD } from './formatJMD';

function weekLabel(ymd: string): string {
  const d = String(ymd).slice(0, 10);
  const parts = d.split('-');
  if (parts.length !== 3) return d;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const m = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(m) || m < 1 || m > 12) return d;
  return `${months[m - 1]} ${day}`;
}

export function settlementOwesLine(driverName: string, settlementAmount: number | null | undefined): string {
  const n = Number(settlementAmount) || 0;
  if (n > 0.005) return `Fleet owes ${formatJMD(n, 2)}`;
  if (n < -0.005) return `${driverName} owes ${formatJMD(Math.abs(n), 2)}`;
  return 'No balance owed either way';
}

export function carriedBalanceWeekChangeCopy(
  driverName: string,
  currentLandingSettlement: number | null | undefined,
  expectedLandingSettlement: number | null | undefined,
  landOn: string = CORRECTIONS_LAND_ON,
): string {
  const from = settlementOwesLine(driverName, currentLandingSettlement);
  const to = settlementOwesLine(driverName, expectedLandingSettlement);
  return `Week of ${weekLabel(landOn)} changes from ${from} to ${to}`;
}

export function carriedBalanceSuccessToast(
  driverName: string,
  expectedLandingSettlement: number | null | undefined,
): string {
  return `Week of ${weekLabel(CORRECTIONS_LAND_ON)} is now ${settlementOwesLine(driverName, expectedLandingSettlement)}.`;
}