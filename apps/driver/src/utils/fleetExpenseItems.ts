/**
 * Read-model for Fleet Settlement → Expenses tab.
 * Mirrors DriverExpenses listing/dedupe rules without importing that screen.
 * Settlement credits (cash collection, fuel settlement credit) are excluded.
 * Misc = inventory damage / fleet charge-backs outside Fuel, Toll, Maintenance.
 */

import { format, parseISO, startOfWeek, endOfWeek } from 'date-fns';
import type { FinancialTransaction } from '../types/data';

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

function isSettlementCredit(t: FinancialTransaction): boolean {
  const cat = String(t.category || t.type || '').toLowerCase();
  const desc = `${t.merchant || ''} ${t.description || ''}`.toLowerCase();
  if (cat.includes('cash collection') || cat.includes('payment_received')) return true;
  if (cat.includes('fuel settlement') || cat.includes('fuel reimbursement')) return true;
  if (cat.includes('credit') && (cat.includes('fuel') || cat.includes('settlement'))) return true;
  if (desc.includes('fuel settlement') || desc.includes('cash collection')) return true;
  return false;
}

function fuelExpenseMirror(t: FinancialTransaction): boolean {
  const c = (t.category || '').toLowerCase();
  if (c.includes('fuel') && !c.includes('credit')) return true;
  const d = `${t.merchant || ''} ${t.description || ''}`.toLowerCase();
  return d.includes('fuel expense') || d.includes('fuel:') || d.includes('fuel —');
}

function classifyTx(t: FinancialTransaction): FleetExpenseType {
  if (fuelExpenseMirror(t)) return 'fuel';
  const c = (t.category || '').toLowerCase();
  if (c.includes('toll')) return 'toll';
  if (c.includes('maintenance') || c.includes('service') || c.includes('repair')) return 'maintenance';
  // Inventory charge-backs, fleet deductions, and anything outside the big three
  return 'misc';
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
 * Build expense items from fuel_entry rows + Expense transactions.
 * Pass all historical fuel for the driver (not only current week).
 */
export function buildFleetExpenseItems(input: {
  transactions: FinancialTransaction[];
  fuelEntries: any[];
}): FleetExpenseItem[] {
  const fuelEntries = Array.isArray(input.fuelEntries) ? input.fuelEntries.filter(Boolean) : [];
  const linkedFuelTxIds = collectLinkedFuelTxIds(fuelEntries);
  const items: FleetExpenseItem[] = [];

  for (const f of fuelEntries) {
    const rawDate = f.date
      ? typeof f.date === 'string'
        ? parseISO(f.date)
        : new Date(f.date)
      : f.createdAt
        ? new Date(f.createdAt)
        : null;
    if (!rawDate || isNaN(rawDate.getTime())) continue;
    items.push({
      id: String(f.id),
      type: 'fuel',
      date: rawDate,
      amount: Number(f.cost ?? f.amount ?? 0) || 0,
      description: f.station || f.stationName || 'Fuel Purchase',
      status: String(f.auditStatus || f.status || 'pending'),
      weekKey: weekKeyFor(rawDate),
      receiptUrl: f.receiptUrl,
    });
  }

  const expenseTx = (input.transactions || []).filter(
    (t) => t && t.type === 'Expense' && !isSettlementCredit(t),
  );

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

    items.push({
      id: String(t.id),
      type: classifyTx(t),
      date: txDate,
      amount: Number(t.amount) || 0,
      description: t.merchant || t.description || t.category || 'Expense',
      status: String(t.status || 'pending'),
      weekKey: weekKeyFor(txDate),
      receiptUrl: t.receiptUrl,
    });
  }

  items.sort((a, b) => b.date.getTime() - a.date.getTime());
  return items;
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
    const start = parseISO(weekKey);
    const end = endOfWeek(start, { weekStartsOn: 1 });
    const sortedItems = weekItems.sort((a, b) => b.date.getTime() - a.date.getTime());
    const categories = rollupCategories(sortedItems);
    const total = Math.round(
      categories.reduce((s, c) => s + c.total, 0) * 100,
    ) / 100;
    groups.push({
      weekKey,
      start,
      end,
      total,
      items: sortedItems,
      categories,
    });
  }

  groups.sort((a, b) => b.start.getTime() - a.start.getTime());
  return groups;
}

/** Newest weeks first, capped (default last 5). */
export function selectRecentExpenseWeeks(
  groups: FleetExpenseWeekGroup[],
  limit = 5,
): FleetExpenseWeekGroup[] {
  return [...groups]
    .sort((a, b) => b.start.getTime() - a.start.getTime())
    .slice(0, Math.max(0, limit));
}
