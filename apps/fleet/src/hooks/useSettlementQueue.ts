/**
 * Settlement desk queue query — key factory + React Query hook.
 * Calls GET /settlements/queue (falls back to legacy period endpoints until Phase 4).
 */
import { useQuery } from '@tanstack/react-query';
import { settlementCommandsApi } from '../services/settlementCommandsApi';
import type { AgingBucket } from '../utils/settlementAging';

export type SettlementQueueView = 'collect' | 'pay' | 'reconciled';
export type SettlementGroupBy = 'driver' | 'week';

export type SettlementQueueRow = {
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  periodEnd: string;
  /** Residual in minor units (cents). */
  amountOwedMinor: number;
  /** Major-unit convenience for UI that still uses MONEY(). */
  amountOwed?: number;
  settlementAmount?: number;
  settlementPaid?: number;
  cashCollected?: number;
  cashReturned?: number;
  cashStillHeld?: number;
  tripCount?: number;
  settlementStatus?: string;
  fuelFinalized?: boolean;
  /** H-1: reconciliation-close gate. When false, `collect` must be blocked. */
  moneyUnlocked?: boolean;
  /** Close Week freeze — Pay/Collect disabled until reopen. */
  periodFrozen?: boolean;
  collectKind?: 'driver_owes' | 'cash_held';
  overpaidAmount?: number;
  cashSourceMismatch?: number;
  metadata?: Record<string, unknown> | null;
  /** Reconciled view extras (optional). */
  earningsGross?: number;
  driverShare?: number;
  fleetShare?: number;
  driverSharePercent?: number;
  fuelDeduction?: number;
  fuelFleetShare?: number;
  tollChargedToDriver?: number;
  tollCashSpend?: number;
  cashWrittenOff?: number;
  payoutNet?: number;
  tipsPaidToDriver?: number;
  tipsWithheld?: number;
  /** Present when API (or client) rolls up by driver. */
  weekCount?: number;
  oldestPeriodEnd?: string;
  agingBucket?: AgingBucket;
  children?: SettlementQueueRow[];
};

export type SettlementQueueResponse = {
  rows: SettlementQueueRow[];
  totals: {
    amountOwedMinor: number;
    amountDisplayedMinor?: number;
    rowCount: number;
  };
  aggregates?: {
    byAge?: Partial<Record<AgingBucket, number>>;
    byDriver?: Record<string, number>;
  };
  page: {
    total: number;
    hasMore: boolean;
    truncated?: boolean;
    page?: number;
    pageSize?: number;
  };
};

export type SettlementQueueParams = {
  view: SettlementQueueView;
  weekFrom?: string;
  weekTo?: string;
  minAmount?: number;
  scope?: string;
  search?: string;
  page?: number;
  pageSize?: number;
  groupBy?: SettlementGroupBy;
  ageBucket?: AgingBucket;
  sort?: string;
};

export type SettlementMovementsParams = {
  weekFrom?: string;
  weekTo?: string;
  scope?: string;
  search?: string;
  kind?: 'collect' | 'pay' | 'all';
  approvalState?: string;
  page?: number;
};

export const settlementKeys = {
  all: ['settlements'] as const,
  queues: () => [...settlementKeys.all, 'queue'] as const,
  queue: (p: SettlementQueueParams) =>
    [
      ...settlementKeys.queues(),
      {
        view: p.view,
        weekFrom: p.weekFrom ?? '',
        weekTo: p.weekTo ?? '',
        minAmount: p.minAmount ?? null,
        scope: p.scope ?? '',
        search: p.search ?? '',
        page: p.page ?? 1,
        pageSize: p.pageSize ?? null,
        groupBy: p.groupBy ?? 'week',
        ageBucket: p.ageBucket ?? '',
        sort: p.sort ?? '',
      },
    ] as const,
  movements: (p: SettlementMovementsParams = {}) =>
    [
      ...settlementKeys.all,
      'movements',
      {
        weekFrom: p.weekFrom ?? '',
        weekTo: p.weekTo ?? '',
        scope: p.scope ?? '',
        search: p.search ?? '',
        kind: p.kind ?? 'all',
        approvalState: p.approvalState ?? '',
        page: p.page ?? 1,
      },
    ] as const,
  runs: (runId: string) => [...settlementKeys.all, 'runs', runId] as const,
  health: () => [...settlementKeys.all, 'health'] as const,
};

export function useSettlementQueue(params: SettlementQueueParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: settlementKeys.queue(params),
    queryFn: (): Promise<SettlementQueueResponse> => settlementCommandsApi.getQueue(params),
    enabled: options?.enabled !== false,
  });
}
