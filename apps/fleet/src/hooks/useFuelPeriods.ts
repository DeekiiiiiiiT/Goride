/**
 * Client hooks for server-owned fuel reconciliation periods (Phase 2 / Wave C).
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';

export const FUEL_PERIODS_KEY = 'fuelReconciliationPeriods';
export const FUEL_PERIOD_KEY = 'fuelReconciliationPeriod';
export const FUEL_PERIOD_JOB_KEY = 'fuelPeriodJob';

export type FuelPeriodRow = {
  id: string;
  orgId: string;
  weekStart: string;
  weekEnd: string;
  status: 'open' | 'in_review' | 'ready' | 'locked' | 'reopened';
  currentStep?: string | null;
  version: number;
  vehicleCount: number;
  driverCount: number;
  totalSpend: number;
  gasCardSpend: number;
  cashFromEarnings: number;
  companyShare: number;
  driverShare: number;
  unexplained: number;
  counts?: Record<string, { actionable: number; informational: number }>;
  leakageReviewedAt?: string | null;
  lockedAt?: string | null;
};

export function useFuelPeriods(opts: { from?: string; to?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: [FUEL_PERIODS_KEY, opts.from, opts.to],
    enabled: opts.enabled !== false && Boolean(opts.from && opts.to),
    queryFn: async (): Promise<FuelPeriodRow[]> => {
      try {
        return (await api.listFuelReconciliationPeriods({
          from: opts.from,
          to: opts.to,
        })) as FuelPeriodRow[];
      } catch {
        return [];
      }
    },
    staleTime: 15_000,
  });
}

export function useFuelPeriod(periodId: string | null) {
  return useQuery({
    queryKey: [FUEL_PERIOD_KEY, periodId],
    enabled: Boolean(periodId),
    queryFn: async (): Promise<FuelPeriodRow | null> => {
      if (!periodId) return null;
      try {
        return (await api.getFuelReconciliationPeriod(periodId)) as FuelPeriodRow | null;
      } catch {
        return null;
      }
    },
  });
}

export function useFuelPeriodMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: [FUEL_PERIODS_KEY] });
    void qc.invalidateQueries({ queryKey: [FUEL_PERIOD_KEY] });
  };

  const finalize = useMutation({
    mutationFn: async (args: {
      periodId: string;
      version: number;
      idempotencyKey: string;
    }) => api.enqueueFuelPeriodFinalize(args),
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: async (args: {
      periodId: string;
      version: number;
      reason: string;
      idempotencyKey: string;
    }) => api.enqueueFuelPeriodReopen(args),
    onSuccess: invalidate,
  });

  const reviewLeakage = useMutation({
    mutationFn: async (args: { periodId: string; note?: string }) =>
      api.reviewFuelPeriodLeakage(args),
    onSuccess: invalidate,
  });

  const updateStep = useMutation({
    mutationFn: async (args: { periodId: string; step: string }) =>
      api.updateFuelPeriodStep(args),
    onSuccess: invalidate,
  });

  return { finalize, reopen, reviewLeakage, updateStep, invalidate };
}
