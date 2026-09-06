/**
 * Settlement desk helpers — invalidate queries after direct API commands.
 * Mutations intentionally omitted: DriverSettlementsPage calls settlementCommandsApi
 * imperatively; unused useMutation hooks crashed under Vite HMR (ROAM-FLEET-1B/1C).
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { DRIVER_FINANCIAL_PERIODS_KEY } from './useDriverFinancialPeriods';
import { settlementKeys } from './useSettlementQueue';
import { SETTLEMENT_APPROVAL_THRESHOLD, requiresApproval } from '../utils/settlementEnterprise';

export { SETTLEMENT_APPROVAL_THRESHOLD, requiresApproval };

/** Client-generated idempotency key for settlement commands. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

const LEGACY_QUEUE_KEYS = [
  'companyOwesPeriods',
  'driverOwesPeriods',
  'cashHeldPeriods',
  'reconciledPeriods',
  'driverSettlementsTransactions',
] as const;

export function invalidateSettlementQueries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: settlementKeys.all });
  void qc.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
  for (const key of LEGACY_QUEUE_KEYS) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}

/** Thin hook for desk pages that only need invalidate + idempotency helpers. */
export function useSettlementCommands() {
  const qc = useQueryClient();
  const invalidate = useCallback(() => invalidateSettlementQueries(qc), [qc]);
  return {
    invalidate,
    newIdempotencyKey,
  };
}
