/**
 * Shared Log Cash (receipt) logic for Settlements desk + Dashboard quick action.
 * Rideshare Layer B only — delivery COD is Roam's receivable (see Layer A′ remittance).
 *
 * Receipt-first: Log Cash is never blocked by fuel/toll unlock or residual match.
 * Only frozen / seal-broken weeks refuse. Settlement math updates after the write.
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
  SettlementCommandApiError,
} from '../services/settlementCommandsApi';

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
  /** Desk residual when the form loaded — server 409s if balance changed (R6-04). */
  expectedOutstanding?: number;
  method?: string;
  reference?: string;
  note?: string;
  /** Required by server when amount exceeds owed (or fat-finger floor). */
  reason?: string;
};

export type CashCollectResult = {
  period?: Record<string, unknown>;
  afterOwed: number | null;
  cashReturned?: number | null;
  cashStillHeld?: number | null;
};

export class CashGateError extends Error {
  constructor(
    readonly code: 'PERIOD_FROZEN' | 'MONEY_LOCKED' | 'SERVER_STALE' | 'STALE_RESIDUAL' | 'OVER_COLLECT',
    readonly weekAnchor: string,
    message?: string,
  ) {
    super(message || code);
    this.name = 'CashGateError';
  }
}

export function owedMajor(r: SettlementQueueRow): number {
  return r.amountOwed != null && Number.isFinite(r.amountOwed)
    ? Math.max(0, Number(r.amountOwed))
    : Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
}

/**
 * Receipt-first Log Cash refusals only. Unlock / open-week are not blocks.
 * @deprecated Prefer receiptBlockReason — alias kept for older imports.
 */
export function collectBlockReason(r: SettlementQueueRow): string | null {
  return receiptBlockReason(r);
}

/** Receipt-first: only frozen / seal-broken weeks refuse Log Cash. */
export function receiptBlockReason(r: SettlementQueueRow): string | null {
  if (r.sealBroken === true) return 'Close seal broken — resolve in Close Week';
  if (r.periodFrozen === true) return 'Week closed — reopen it in Close Week';
  return null;
}

/** Informational only — residual still provisional until fuel/tolls clear. */
export function receiptProvisionalHint(r: SettlementQueueRow): string | null {
  if (receiptBlockReason(r)) return null;
  if (r.moneyUnlocked !== true) {
    return 'Fuel/tolls not cleared — settlement residual still provisional';
  }
  return null;
}

/** Group queue rows into drivers with weeks that can receive Log Cash. */
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
    if (receiptBlockReason(row)) entry.blockedCount += 1;
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
  return d.weeks.map((w) => {
    const held = Number(w.cashStillHeld);
    const returned = Number(w.cashReturned);
    const amountOwed = w.owedMajor;
    const amountPaid = Number.isFinite(returned) && returned > 0 ? returned : 0;
    const balance =
      Number.isFinite(held) && held > MONEY_EPS
        ? held
        : Math.max(0, amountOwed - amountPaid);
    return {
      start: parseISO(`${w.periodAnchor}T12:00:00`),
      end: parseISO(`${w.periodEnd}T12:00:00`),
      amountOwed: Math.max(amountOwed, balance),
      amountPaid,
      balance,
      status: balance <= MONEY_EPS ? 'Paid' : amountPaid > MONEY_EPS ? 'Partial' : 'Unpaid',
    };
  });
}

function afterOwedFromPeriod(period: Record<string, unknown> | undefined): number | null {
  if (!period) return null;
  const held = Number(period.cashStillHeld);
  if (Number.isFinite(held)) return Math.max(0, held);
  const owed = Math.max(
    0,
    Number(period.amountOwed) || Math.abs(Number(period.settlementAmount) || 0) || 0,
  );
  return Number.isFinite(owed) ? owed : null;
}

/**
 * Single write path for Log Cash receipts.
 * Throws CashGateError for frozen weeks; MONEY_LOCKED from an old server → SERVER_STALE.
 */
export async function collectCashPayment(
  qc: QueryClient,
  input: CashCollectInput,
): Promise<CashCollectResult> {
  try {
    const expected =
      input.expectedOutstanding !== undefined && input.expectedOutstanding !== null
        ? Number(input.expectedOutstanding)
        : undefined;
    const res = await settlementCommandsApi.collect({
      driverId: input.driverId,
      weekAnchor: input.weekAnchor,
      amount: Math.abs(Number(input.amount) || 0),
      method: input.method || 'Cash',
      reference: input.reference,
      note: input.note,
      reason: input.reason,
      idempotencyKey: newIdempotencyKey(),
      ...(Number.isFinite(expected as number) ? { expectedOutstanding: expected } : {}),
    });
    const period = (res as { period?: Record<string, unknown> })?.period;
    invalidateSettlementQueries(qc);
    await qc.refetchQueries({ queryKey: ['settlements', 'queue'] });
    const cashReturned = period != null ? Number(period.cashReturned) : null;
    const cashStillHeld = period != null ? Number(period.cashStillHeld) : null;
    return {
      period,
      afterOwed: afterOwedFromPeriod(period),
      cashReturned: Number.isFinite(cashReturned as number) ? cashReturned : null,
      cashStillHeld: Number.isFinite(cashStillHeld as number) ? cashStillHeld : null,
    };
  } catch (err) {
    if (isPeriodFrozenError(err)) throw new CashGateError('PERIOD_FROZEN', input.weekAnchor);
    // Legacy deploy still returning MONEY_LOCKED — treat as redeploy needed, not fuel dialog.
    if (isMoneyLockedError(err)) throw new CashGateError('SERVER_STALE', input.weekAnchor);
    if (err instanceof SettlementCommandApiError) {
      const code = String(err.code || '');
      if (code === 'STALE_RESIDUAL' || err.status === 409 && code === 'STALE_RESIDUAL') {
        throw new CashGateError(
          'STALE_RESIDUAL',
          input.weekAnchor,
          'Balance changed since you loaded this week. Reload and try again.',
        );
      }
      if (code === 'OVER_COLLECT_CAP' || code === 'OVER_COLLECT_REASON_REQUIRED') {
        throw new CashGateError(
          'OVER_COLLECT',
          input.weekAnchor,
          err.message || 'Amount exceeds what is owed — add a reason to continue.',
        );
      }
      if (err.status === 409 && code === 'MONEY_LOCKED') {
        throw new CashGateError('SERVER_STALE', input.weekAnchor);
      }
    }
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

  /** True when queue returned rows but none are loggable (all frozen/seal-broken). */
  const hasBlockedOutstanding = useMemo(() => {
    const rows = queue.data?.rows ?? [];
    if (rows.length === 0) return false;
    let anyOwed = false;
    for (const row of rows) {
      if (owedMajor(row) <= MONEY_EPS) continue;
      anyOwed = true;
      if (!receiptBlockReason(row)) return false;
    }
    return anyOwed && drivers.length === 0;
  }, [queue.data?.rows, drivers.length]);

  const periodsFor = (d: CashDriver) => periodsForCashDriver(d);

  const collect = (input: CashCollectInput) => collectCashPayment(qc, input);

  const findDriver = (driverId: string): CashDriver | undefined =>
    drivers.find((d) => d.driverId === driverId);

  /** Best human reason when a driver has cash to log but every week is blocked. */
  const blockReasonForDriver = (driverId: string): string | null => {
    const rows = (queue.data?.rows ?? []).filter((r) => r.driverId === driverId);
    const owed = rows.filter((r) => owedMajor(r) > MONEY_EPS);
    if (owed.length === 0) return 'No cash outstanding for this driver';
    for (const r of owed) {
      const reason = receiptBlockReason(r);
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
