/**
 * Read-model for Fleet Settlement → Expenses tab.
 * Weeks align to the same financial periods as Cash Settlement (last N Mondays).
 * Misc = inventory damage / fleet charge-backs outside Fuel, Toll, Maintenance.
 */

import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import type { FinancialTransaction } from '../types/data';
import type { PayoutPeriodRow } from '../types/driverPayoutPeriod';
import { isTollCategory } from './tollCategoryHelper';

export type FleetExpenseType = 'fuel' | 'toll' | 'maintenance' | 'misc';

export interface FleetExpenseItem {
  id: string;
  type: FleetExpenseType;
  date: Date;
  amount: number;
  description: string;
  status: string;
  weekKey: string; // Monday yyyy-MM-dd
  receiptUrl?: string;
}

export interface FleetExpenseCategorySummary {
  type: FleetExpenseType;
  total: number;
  count: number;
}

export interface FleetExpenseWeekGroup {
  weekKey: string;
  start: Date;
  end: Date;
  total: number;
  items: FleetExpenseItem[];
  /** Always Fuel / Toll / Maintenance / Misc (zeros included). */
  categories: FleetExpenseCategorySummary[];
}

const CATEGORY_ORDER: FleetExpenseType[] = ['fuel', 'toll', 'maintenance', 'misc'];

/** Always return all four buckets so week cards stay consistent. */
function rollupCategories(items: FleetExpenseItem[]): FleetExpenseCategorySummary[] {
  const map = new Map<FleetExpenseType, { total: number; count: number }>();
  for (const type of CATEGORY_ORDER) {
    map.set(type, { total: 0, count: 0 });
  }
  for (const item of items) {
    const cur = map.get(item.type) || { total: 0, count: 0 };
    cur.total += Math.abs(Number(item.amount) || 0);
    cur.count += 1;
    map.set(item.type, cur);
  }
  return CATEGORY_ORDER.map((type) => {
    const cur = map.get(type)!;
    return {
      type,
      total: Math.round(cur.total * 100) / 100,
      count: cur.count,
    };
  });
}

function emptyWeekGroup(weekKey: string): FleetExpenseWeekGroup {
  const start = parseISO(`${weekKey}T00:00:00`);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  return {
    weekKey,
    start,
    end,
    total: 0,
    items: [],
    categories: rollupCategories([]),
  };
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

/** Settlement ledger mirrors — not driver-logged expenses. */
function isFuelSettlementLedger(t: FinancialTransaction): boolean {
  const c = String(t.category || '').toLowerCase().trim();
  return c === 'fuel deduction' || c === 'fuel reimbursement';
}

function isTollTopUpOrRefund(t: FinancialTransaction): boolean {
  const c = String(t.category || '').toLowerCase().trim();
  const ty = String(t.type || '').toLowerCase().trim();
  return (
    c === 'toll top-up' ||
    c === 'toll refund' ||
    ty === 'top-up' ||
    ty === 'top_up'
  );
}

/**
 * Same inclusion gate as fleet DriverExpensesHistory:
 * Expense / negative Adjustment / toll-category rows; no fuel settlement mirrors.
 */
function isExpenseLedgerRow(t: FinancialTransaction): boolean {
  if (!t) return false;
  if (isSettlementCredit(t) || isFuelSettlementLedger(t) || isTollTopUpOrRefund(t)) return false;
  if (t.type === 'Expense') return true;
  if (t.type === 'Adjustment' && Number(t.amount) < 0) return true;
  if (isTollCategory(t.category)) return true;
  if (String(t.category || '').toLowerCase().trim() === 'toll charge') return true;
  return false;
}

function fuelExpenseMirror(t: FinancialTransaction): boolean {
  const c = (t.category || '').toLowerCase();
  if (c.includes('fuel') && !c.includes('credit') && !c.includes('deduction')) return true;
  const d = `${t.merchant || ''} ${t.description || ''}`.toLowerCase();
  return d.includes('fuel expense') || d.includes('fuel:') || d.includes('fuel —');
}

function classifyTx(t: FinancialTransaction): FleetExpenseType {
  if (fuelExpenseMirror(t)) return 'fuel';
  const c = (t.category || '').toLowerCase();
  if (c.includes('toll')) return 'toll';
  if (c.includes('maintenance') || c.includes('service') || c.includes('repair')) return 'maintenance';
  return 'misc';
}

function isRejectedFuelStatus(status: string): boolean {
  const s = status.toLowerCase().trim();
  return (
    s === 'rejected' ||
    s === 'cancelled' ||
    s === 'canceled' ||
    s === 'void' ||
    s === 'deleted'
  );
}

function txAmountAbs(t: FinancialTransaction) {
  return Math.abs(Number(t.amount) || 0);
}

function fuelDayKey(f: { date?: string | Date }): string {
  if (!f.date) return '';
  const raw = f.date;
  if (typeof raw === 'string') return raw.split('T')[0];
  return format(raw instanceof Date ? raw : parseISO(String(raw)), 'yyyy-MM-dd');
}

function collectLinkedFuelTxIds(fuelEntries: any[]): Set<string> {
  const ids = new Set<string>();
  for (const f of fuelEntries) {
    const m =
      f?.metadata && typeof f.metadata === 'object'
        ? (f.metadata as Record<string, unknown>)
        : {};
    for (const v of [
      f?.transactionId,
      f?.transaction_id,
      m.originalTransactionId,
      m.original_transaction_id,
      m.transactionId,
      m.transaction_id,
    ]) {
      if (v != null && String(v).trim()) ids.add(String(v).trim());
    }
  }
  return ids;
}

function fuelLogOverlapsExpense(
  t: FinancialTransaction,
  txDate: Date,
  fuelEntries: any[],
): boolean {
  const tDay = format(txDate, 'yyyy-MM-dd');
  const a = txAmountAbs(t);
  return fuelEntries.some((f) => {
    const fd = fuelDayKey(f);
    const fa = Math.abs(Number(f.amount ?? f.cost ?? 0));
    return fd === tDay && Math.abs(fa - a) < 0.02;
  });
}

function weekKeyFor(date: Date): string {
  return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

/**
 * Build expense items from fuel_entry rows + expense/toll ledger rows.
 * Caller must pass only this driver's fuel entries.
 */
export function buildFleetExpenseItems(input: {
  transactions: FinancialTransaction[];
  fuelEntries: any[];
}): FleetExpenseItem[] {
  const fuelEntries = Array.isArray(input.fuelEntries) ? input.fuelEntries.filter(Boolean) : [];
  const linkedFuelTxIds = collectLinkedFuelTxIds(fuelEntries);
  const items: FleetExpenseItem[] = [];

  for (const f of fuelEntries) {
    const status = String(f.auditStatus || f.status || 'pending');
    if (isRejectedFuelStatus(status)) continue;

    const rawDate = f.date
      ? typeof f.date === 'string'
        ? parseISO(f.date)
        : new Date(f.date)
      : f.createdAt
        ? new Date(f.createdAt)
        : null;
    if (!rawDate || isNaN(rawDate.getTime())) continue;

    const amount = Number(f.cost ?? f.amount ?? 0) || 0;
    if (Math.abs(amount) < 0.005) continue;

    items.push({
      id: String(f.id),
      type: 'fuel',
      date: rawDate,
      amount,
      description: f.station || f.stationName || 'Fuel Purchase',
      status,
      weekKey: weekKeyFor(rawDate),
      receiptUrl: f.receiptUrl,
    });
  }

  const expenseTx = (input.transactions || []).filter(isExpenseLedgerRow);

  for (const t of expenseTx) {
    if (linkedFuelTxIds.has(String(t.id))) continue;

    const txDate = t.date
      ? new Date(t.date)
      : t.createdAt
        ? new Date(t.createdAt)
        : null;
    if (!txDate || isNaN(txDate.getTime())) continue;

    if (fuelExpenseMirror(t)) {
      const st = String(t.status || 'pending').toLowerCase().trim();
      if (st !== 'pending') continue;
      if (fuelLogOverlapsExpense(t, txDate, fuelEntries)) continue;
    }

    const amount = Number(t.amount) || 0;
    if (Math.abs(amount) < 0.005) continue;

    items.push({
      id: String(t.id),
      type: classifyTx(t),
      date: txDate,
      amount,
      description: t.merchant || t.description || t.category || 'Expense',
      status: String(t.status || 'pending'),
      weekKey: weekKeyFor(txDate),
      receiptUrl: t.receiptUrl,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
}

function weekGroupFromItems(
  weekKey: string,
  weekItems: FleetExpenseItem[],
): FleetExpenseWeekGroup {
  const start = parseISO(`${weekKey}T00:00:00`);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  const sortedItems = [...weekItems].sort((a, b) => b.date.getTime() - a.date.getTime());
  const categories = rollupCategories(sortedItems);
  const total =
    Math.round(categories.reduce((s, c) => s + c.total, 0) * 100) / 100;
  return {
    weekKey,
    start,
    end,
    total,
    items: sortedItems,
    categories,
  };
}

/** Group items by Mon–Sun week, newest first, with category totals. */
export function groupFleetExpensesByWeek(items: FleetExpenseItem[]): FleetExpenseWeekGroup[] {
  const map = new Map<string, FleetExpenseItem[]>();
  for (const item of items) {
    const list = map.get(item.weekKey) || [];
    list.push(item);
    map.set(item.weekKey, list);
  }

  const groups: FleetExpenseWeekGroup[] = [];
  for (const [weekKey, weekItems] of map) {
    groups.push(weekGroupFromItems(weekKey, weekItems));
  }

  groups.sort((a, b) => b.start.getTime() - a.start.getTime());
  return groups;
}

/**
 * Last N weeks matching Cash Settlement periods.
 * Always returns N cards (zeros when a week has no expenses).
 */
export function selectExpenseWeeksForPeriods(
  items: FleetExpenseItem[],
  periodRows: PayoutPeriodRow[],
  limit = 5,
): FleetExpenseWeekGroup[] {
  const byWeek = new Map<string, FleetExpenseItem[]>();
  for (const item of items) {
    const list = byWeek.get(item.weekKey) || [];
    list.push(item);
    byWeek.set(item.weekKey, list);
  }

  let anchors: string[] = [];
  if (periodRows.length > 0) {
    anchors = [...periodRows]
      .sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime())
      .slice(0, Math.max(0, limit))
      .map((r) => format(r.periodStart, 'yyyy-MM-dd'));
  } else {
    // No financial periods yet — still show calendar last N Mondays.
    const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
    for (let i = 0; i < limit; i++) {
      anchors.push(format(subWeeks(thisMonday, i), 'yyyy-MM-dd'));
    }
  }

  return anchors.map((weekKey) => {
    const weekItems = byWeek.get(weekKey) || [];
    return weekItems.length > 0 ? weekGroupFromItems(weekKey, weekItems) : emptyWeekGroup(weekKey);
  });
}

/** @deprecated Prefer selectExpenseWeeksForPeriods so empty recent weeks still appear. */
export function selectRecentExpenseWeeks(
  groups: FleetExpenseWeekGroup[],
  limit = 5,
): FleetExpenseWeekGroup[] {
  return [...groups]
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, Math.max(0, limit));
}
