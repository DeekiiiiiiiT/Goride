/**
 * Settlement desk mutations — idempotent commands + shared invalidation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DRIVER_FINANCIAL_PERIODS_KEY } from './useDriverFinancialPeriods';
import { settlementKeys } from './useSettlementQueue';
import {
  settlementCommandsApi,
  type SettlementCollectBody,
  type SettlementPayBody,
  type SettlementReverseBody,
  type SettlementRunBody,
  type SettlementWriteOffBody,
} from '../services/settlementCommandsApi';
import {
  requiresApproval,
  SETTLEMENT_APPROVAL_THRESHOLD,
} from '../utils/settlementEnterprise';

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

export function useSettlementCommands() {
  const qc = useQueryClient();
  const onSuccess = () => invalidateSettlementQueries(qc);

  const collect = useMutation({
    mutationFn: (body: SettlementCollectBody) => settlementCommandsApi.collect(body),
    onSuccess,
  });

  const pay = useMutation({
    mutationFn: async (body: SettlementPayBody) => {
      // Maker-checker: amounts >= SETTLEMENT_APPROVAL_THRESHOLD flag for approval queue.
      const needsApproval = requiresApproval(body.amount, SETTLEMENT_APPROVAL_THRESHOLD);
      const result = await settlementCommandsApi.pay(body);
      return { result, requiresApproval: needsApproval };
    },
    onSuccess,
  });

  const writeOff = useMutation({
    mutationFn: (body: SettlementWriteOffBody) => settlementCommandsApi.writeOff(body),
    onSuccess,
  });

  const reverse = useMutation({
    mutationFn: (body: SettlementReverseBody) => settlementCommandsApi.reverse(body),
    onSuccess,
  });

  const startRun = useMutation({
    mutationFn: (body: SettlementRunBody) => settlementCommandsApi.createRun(body),
    onSuccess,
  });

  return { collect, pay, writeOff, reverse, startRun, invalidate: onSuccess, newIdempotencyKey };
}
