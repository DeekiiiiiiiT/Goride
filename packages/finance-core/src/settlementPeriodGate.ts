/**
 * Fleet Mon–Sun calendar gate: no settlement money / week recon / close until
 * the week has fully ended (first allowed day = periodEnd + 1 in fleet TZ).
 */
import { DEFAULT_FLEET_TZ, fleetCalendarDay, periodEndForAnchor } from './periodKey.ts';

export type SettlementPeriodGateInput = {
  /** Inclusive Sunday YYYY-MM-DD, or Monday anchor (end derived). */
  periodEnd?: string | null;
  periodAnchor?: string | null;
  weekAnchor?: string | null;
  /** Instant or bare YYYY-MM-DD; defaults to now. */
  now?: Date | string;
  timezone?: string;
};

function resolvePeriodEnd(input: SettlementPeriodGateInput): string | null {
  const end = String(input.periodEnd || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) return end;
  const anchor = String(input.periodAnchor || input.weekAnchor || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return periodEndForAnchor(anchor);
  return null;
}

function resolveToday(input: SettlementPeriodGateInput): string {
  const tz = input.timezone || DEFAULT_FLEET_TZ;
  const now = input.now ?? new Date();
  if (typeof now === 'string') return fleetCalendarDay(now, tz);
  return fleetCalendarDay(now.toISOString(), tz);
}

/** First calendar day recon/settlement may run (periodEnd + 1), or null. */
export function reconciliationUnlockDay(input: SettlementPeriodGateInput): string | null {
  const periodEnd = resolvePeriodEnd(input);
  if (!periodEnd) return null;
  const [y, m, d] = periodEnd.split('-').map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + 1);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, '0');
  const dd = String(local.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * True when the settlement week is complete and may accept Collect / Pay /
 * Write-off / batch runs / fuel+toll recon. False while today is still on or before periodEnd.
 */
export function isSettlementPeriodEnded(input: SettlementPeriodGateInput): boolean {
  const periodEnd = resolvePeriodEnd(input);
  if (!periodEnd) return false;
  return resolveToday(input) > periodEnd;
}

/** Inverse of isSettlementPeriodEnded — week still in progress. */
export function isSettlementPeriodOpen(input: SettlementPeriodGateInput): boolean {
  return !isSettlementPeriodEnded(input);
}

export function settlementPeriodOpenMessage(input: SettlementPeriodGateInput): string {
  const periodEnd = resolvePeriodEnd(input) || 'this week';
  return `Settlement week ending ${periodEnd} is still open. Money movements open the next calendar day.`;
}

/** Fuel / toll Week Reconciliation copy — same calendar rule as settlement. */
export function reconciliationPeriodOpenMessage(input: SettlementPeriodGateInput): string {
  const periodEnd = resolvePeriodEnd(input) || 'this week';
  const unlock = reconciliationUnlockDay(input);
  if (unlock) {
    return `Week ending ${periodEnd} is still open. Reconciliation opens the next calendar day (${unlock}).`;
  }
  return `Week ending ${periodEnd} is still open. Reconciliation opens the next calendar day.`;
}
