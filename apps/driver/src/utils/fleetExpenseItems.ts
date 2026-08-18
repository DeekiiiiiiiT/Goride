/**
 * Read-model for Fleet Settlement → Earnings tab.
 * Earned = driverShare; Fuel/Toll from periods SSOT; Maint/Misc from expense ledger.
 * Net = earned − deductions.
 */

import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import type { FinancialTransaction } from '../types/data';
import type { DriverFinancialPeriodClient } from '../types/driverPayoutPeriod';
import { isTollCategory } from './tollCategoryHelper';

export type FleetExpenseType = 'fuel' | 'toll' | 'maintenance' | 'misc';

export interface FleetExpenseCategorySummary {
  type: FleetExpenseType;
  total: number;
  count: number;
}

export interface FleetExpenseWeekGroup {
  weekKey: string;
  start: Date;
  end: Date;
  /** Driver share for the week. */
  earned: number;
  /** Sum of Fuel / Toll / Maintenance / Misc. */
  deductionsTotal: number;
  /** earned − deductionsTotal. */
  net: number;
  /** Tips the fleet kept because quota was missed. 0 when quota was met. */
  tipsWithheld: number;
  quotaMet: boolean | null;
  /** @deprecated Prefer deductionsTotal — kept for any leftover callers. */
  total: number;
  /** Always Fuel / Toll / Maintenance / Misc (zeros included). */
  categories: FleetExpenseCategorySummary[];
}

const CATEGORY_ORDER: FleetExpenseType[] = ['fuel', 'toll', 'maintenance', 'misc'];

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function weekBounds(weekKey: string): { start: Date; end: Date } {
  const start = parseISO(`${weekKey}T00:00:00`);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return { start, end };
}

function isSettlementCredit(t: FinancialTransaction): boolean {
  const cat = String(t.category || t.type || '').toLowerCase();
  const desc = `${t.merchant || ''} ${t.description || ''}`.toLowerCase();
  if (cat.includes('cash collection') || cat.includes('payment_received')) return true;
  if (cat.includes('fuel settlement') || cat.includes('fuel reimbursement')) return true;
  if (cat.includes('credit') && (cat.includes('fuel') || cat.includes('settlement'))) return true;
  if (desc.includes('fuel settlement') || desc.includes('cash collection')) return true;
  return false;
}

function isFuelOrTollLedger(t: FinancialTransaction): boolean {
  const c = String(t.category || '').toLowerCase().trim();
  if (c === 'fuel deduction' || c === 'fuel reimbursement') return true;
  if (c.includes('fuel')) return true;
  if (isTollCategory(t.category)) return true;
  if (c === 'toll charge') return true;
  if (c.includes('toll')) return true;
  return false;
}

/** Maintenance / Misc only — Fuel & Toll are period SSOT. */
function isMaintenanceOrMiscExpense(t: FinancialTransaction): boolean {
  if (!t || t.type !== 'Expense') return false;
  if (isSettlementCredit(t) || isFuelOrTollLedger(t)) return false;
  return true;
}

function classifyMaintMisc(t: FinancialTransaction): 'maintenance' | 'misc' {
  const c = (t.category || '').toLowerCase();
  if (c.includes('maintenance') || c.includes('service') || c.includes('repair')) {
    return 'maintenance';
  }
  return 'misc';
}

function weekKeyFor(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

function rollupMaintMisc(
  transactions: FinancialTransaction[],
  weekKey: string,
): { maintenance: { total: number; count: number }; misc: { total: number; count: number } } {
  const out = {
    maintenance: { total: 0, count: 0 },
    misc: { total: 0, count: 0 },
  };
  for (const t of transactions) {
    if (!isMaintenanceOrMiscExpense(t)) continue;
    const txDate = t.date ? new Date(t.date) : t.createdAt ? new Date(t.createdAt) : null;
    if (!txDate || isNaN(txDate.getTime())) continue;
    if (weekKeyFor(txDate) !== weekKey) continue;
    const amt = Math.abs(Number(t.amount) || 0);
    if (amt < 0.005) continue;
    const bucket = classifyMaintMisc(t);
    out[bucket].total += amt;
    out[bucket].count += 1;
  }
  out.maintenance.total = round2(out.maintenance.total);
  out.misc.total = round2(out.misc.total);
  return out;
}

/**
 * Last N weeks from financial periods.
 * Earned = driverShare; Fuel = finalized fuelDeduction; Toll = tollChargedToDriver.
 */
export function buildEarningsWeeksFromPeriods(input: {
  periods: DriverFinancialPeriodClient[];
  transactions: FinancialTransaction[];
  limit?: number;
}): FleetExpenseWeekGroup[] {
  const limit = input.limit ?? 5;
  const periods = [...(input.periods || [])].sort((a, b) =>
    String(b.periodAnchor).localeCompare(String(a.periodAnchor)),
  );

  let anchors: string[] = periods
    .slice(0, Math.max(0, limit))
    .map((p) => String(p.periodAnchor).slice(0, 10));

  if (anchors.length === 0) {
    const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < limit; i++) {
      anchors.push(format(subWeeks(thisMonday, i), 'yyyy-MM-dd'));
    }
  }

  const periodByAnchor = new Map(
    periods.map((p) => [String(p.periodAnchor).slice(0, 10), p] as const),
  );

  return anchors.map((weekKey) => {
    const { start, end } = weekBounds(weekKey);
    const period = periodByAnchor.get(weekKey);
    const maintMisc = rollupMaintMisc(input.transactions || [], weekKey);

    const earned = round2(Math.max(0, Number(period?.driverShare) || 0));

    // Fuel: only after finalize — same number fleet shows as Fuel Deduction.
    const fuelTotal =
      period && period.fuelFinalized ? round2(Math.max(0, Number(period.fuelDeduction) || 0)) : 0;
    const fuelCount = fuelTotal > 0.005 ? 1 : 0;

    // Toll: only what was charged to the driver (unreconciled weeks stay $0).
    const tollTotal = round2(Math.max(0, Number(period?.tollChargedToDriver) || 0));
    const tollCount = tollTotal > 0.005 ? 1 : 0;

    const categories: FleetExpenseCategorySummary[] = [
      { type: 'fuel', total: fuelTotal, count: fuelCount },
      { type: 'toll', total: tollTotal, count: tollCount },
      { type: 'maintenance', total: maintMisc.maintenance.total, count: maintMisc.maintenance.count },
      { type: 'misc', total: maintMisc.misc.total, count: maintMisc.misc.count },
    ];

    const deductionsTotal = round2(categories.reduce((s, c) => s + c.total, 0));
    const net = round2(earned - deductionsTotal);
    const fc =
      period?.metadata && typeof period.metadata.financeCore === 'object'
        ? (period.metadata.financeCore as Record<string, unknown>)
        : {};
    const tipsWithheld = round2(Math.max(0, Number(fc.tipsWithheld) || 0));
    const quotaMet = typeof fc.quotaMet === 'boolean' ? fc.quotaMet : null;

    return {
      weekKey,
      start: period ? parseISO(`${String(period.periodAnchor).slice(0, 10)}T00:00:00`) : start,
      end: period ? parseISO(`${String(period.periodEnd).slice(0, 10)}T23:59:59`) : end,
      earned,
      deductionsTotal,
      net,
      tipsWithheld,
      quotaMet,
      total: deductionsTotal,
      categories,
    };
  });
}

/** @deprecated Use buildEarningsWeeksFromPeriods. */
export const buildExpenseWeeksFromPeriods = buildEarningsWeeksFromPeriods;
