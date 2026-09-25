/**
 * Shared Collect-cash logic for the Settlements desk and the Dashboard quick action.
 * Rideshare Layer B only — delivery COD is Roam's receivable (see Layer A′ remittance).
 */
import { useMemo, useState } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { useSettlementQueue, type SettlementQueueRow } from './useSettlementQueue';
import { newIdempotencyKey, invalidateSettlementQueries } from './useSettlementCommands';
import {
  settlementCommandsApi,
  isPeriodFrozenError,
  isMoneyLockedError,
} from '../services/settlementCommandsApi';
import { isSettlementPeriodEnded } from '../utils/settlementPeriodGate';

export const MONEY_EPS = 0.005;

export type CashWeek = SettlementQueueRow & { owedMajor: number };
export type CashDriver = {
  driverId: string;
  driverName: string;
  totalOwed: number;
  weeks: CashWeek[];
  blockedCount: number;
};

export type CashCollectInput = {
  driverId: string;
  weekAnchor: string;
  amount: number;
  expectedOutstanding: number;
  method?: string;
  reference?: string;
  note?: string;
};

export type CashCollectResult = {
  period?: Record<string, unknown>;
  afterOwed: number | null;
};

export class CashGateError extends Error {
  constructor(
    readonly code: 'PERIOD_FROZEN' | 'MONEY_LOCKED',
    readonly weekAnchor: string,
  ) {
    super(code);
    this.name = 'CashGateError';
  }
}

export function owedMajor(r: SettlementQueueRow): number {
  return r.amountOwed != null && Number.isFinite(r.amountOwed)
    ? Math.max(0, Number(r.amountOwed))
    : Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
}

/** Every refusal the desk applies, in one place. Returns null when collectable. */
export function collectBlockReason(r: SettlementQueueRow): string | null {
  if (!isSettlementPeriodEnded({ periodAnchor: r.periodAnchor, periodEnd: r.periodEnd })) {
    return 'Week still open — settle after it ends';
  }
  if (r.sealBroken === true) return 'Close seal broken — resolve in Close Week';
  if (r.periodFrozen === true) return 'Week closed — reopen it in Close Week';
  if (r.moneyUnlocked !== true) return 'Fuel/toll not cleared for this week';
  return null;
}

/** Group raw queue rows into drivers with only collectable weeks. Keeps SettlementQueueRow flags. */
export function groupCashDrivers(rows: SettlementQueueRow[]): CashDriver[] {
  const byDriver = new Map<string, CashDriver>();
  for (const row of rows) {
    const amount = owedMajor(row);
    if (amount <= MONEY_EPS) continue;
    const key = row.driverId;
    const entry =
      byDriver.get(key) ??
      {
        driverId: key,
        driverName: row.driverName || key,
        totalOwed: 0,
        weeks: [],
        blockedCount: 0,
      };
    if (collectBlockReason(row)) entry.blockedCount += 1;
    else {
      entry.weeks.push({ ...row, owedMajor: amount });
      entry.totalOwed += amount;
    }
    byDriver.set(key, entry);
  }
  return [...byDriver.values()]
    .filter((d) => d.weeks.length > 0)
    .map((d) => ({
      ...d,
      weeks: d.weeks.sort((a, b) => b.periodAnchor.localeCompare(a.periodAnchor)),
    }))
    .sort((a, b) => b.totalOwed - a.totalOwed);
}

/** Shape weeks for LogCashPaymentModal's `periods` prop. */
export function periodsForCashDriver(d: CashDriver) {
  return d.weeks.map((w) => ({
    start: parseISO(`${w.periodAnchor}T12:00:00`),
    end: parseISO(`${w.periodEnd}T12:00:00`),
    amountOwed: w.owedMajor,
    amountPaid: 0,
    balance: w.owedMajor,
    status: 'Unpaid',
  }));
}

function afterOwedFromPeriod(period: Record<string, unknown> | undefined): number | null {
  if (!period) return null;
  const owed = Math.max(
    0,
    Number(period.amountOwed) ||
      Math.abs(Number(period.settlementAmount) || 0) ||
      Number(period.cashStillHeld) ||
      0,
  );
  return Number.isFinite(owed) ? owed : null;
}

/**
 * Single write path for cash *payment* collections.
 * Throws CashGateError / rethrows so callers keep modal open on failure.
 */
export async function collectCashPayment(
  qc: QueryClient,
  input: CashCollectInput,
): Promise<CashCollectResult> {
  const overCollect = input.amount > input.expectedOutstanding + MONEY_EPS;
  const reason = input.note?.match(/\[Over-collection\]\s*(.+)/i)?.[1]?.trim();
  try {
    const res = await settlementCommandsApi.collect({
      driverId: input.driverId,
      weekAnchor: input.weekAnchor,
      amount: Math.abs(Number(input.amount) || 0),
      method: input.method || 'Cash',
      reference: input.reference,
      note: input.note,
      idempotencyKey: newIdempotencyKey(),
      expectedOutstanding: input.expectedOutstanding,
      ...(overCollect ? { allowOverCollect: true, reason: reason || 'Over-collection' } : {}),
    });
    const period = (res as { period?: Record<string, unknown> })?.period;
    invalidateSettlementQueries(qc);
    await qc.refetchQueries({ queryKey: ['settlements', 'queue'] });
    return { period, afterOwed: afterOwedFromPeriod(period) };
  } catch (err) {
    if (isPeriodFrozenError(err)) throw new CashGateError('PERIOD_FROZEN', input.weekAnchor);
    if (isMoneyLockedError(err)) throw new CashGateError('MONEY_LOCKED', input.weekAnchor);
    throw err;
  }
}

export function useCashCollection(opts: { enabled?: boolean; loadWhenOpen?: boolean } = {}) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadWhenOpen = opts.loadWhenOpen !== false;
  const baseEnabled = opts.enabled ?? true;

  // Lazy: nothing is fetched until the operator opens the picker (or caller forces enabled).
  const queue = useSettlementQueue(
    { view: 'collect', minAmount: 0, pageSize: 200, groupBy: 'week', scope: 'rideshare' },
    { enabled: baseEnabled && (!loadWhenOpen || pickerOpen) },
  );

  const drivers: CashDriver[] = useMemo(
    () => groupCashDrivers(queue.data?.rows ?? []),
    [queue.data?.rows],
  );

  /** True when queue returned rows but none are collectable (all gated). */
  const hasBlockedOutstanding = useMemo(() => {
    const rows = queue.data?.rows ?? [];
    if (rows.length === 0) return false;
    let anyOwed = false;
    for (const row of rows) {
      if (owedMajor(row) <= MONEY_EPS) continue;
      anyOwed = true;
      if (!collectBlockReason(row)) return false;
    }
    return anyOwed && drivers.length === 0;
  }, [queue.data?.rows, drivers.length]);

  const periodsFor = (d: CashDriver) => periodsForCashDriver(d);

  const collect = (input: CashCollectInput) => collectCashPayment(qc, input);

  const findDriver = (driverId: string): CashDriver | undefined =>
    drivers.find((d) => d.driverId === driverId);

  /** Best human reason when a driver has owed cash but no collectable week. */
  const blockReasonForDriver = (driverId: string): string | null => {
    const rows = (queue.data?.rows ?? []).filter((r) => r.driverId === driverId);
    const owed = rows.filter((r) => owedMajor(r) > MONEY_EPS);
    if (owed.length === 0) return 'No cash outstanding for this driver';
    for (const r of owed) {
      const reason = collectBlockReason(r);
      if (reason) return reason;
    }
    return null;
  };

  return {
    pickerOpen,
    setPickerOpen,
    drivers,
    periodsFor,
    collect,
    findDriver,
    blockReasonForDriver,
    hasBlockedOutstanding,
    rawRows: queue.data?.rows ?? [],
    isLoading: queue.isLoading,
    isFetching: queue.isFetching,
    refetch: queue.refetch,
  };
}
