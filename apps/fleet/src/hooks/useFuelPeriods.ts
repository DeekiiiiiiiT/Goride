/**
 * Client hooks for server-owned fuel reconciliation periods (Phase 2).
 * Falls back gracefully when the edge routes are not yet deployed.
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

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  // Prefer dedicated API helpers when present; otherwise soft-fail for progressive rollout
  const anyApi = api as any;
  if (typeof anyApi.getFuelReconciliationPeriods === 'function' && path.includes('?')) {
    return anyApi.getFuelReconciliationPeriods(Object.fromEntries(new URLSearchParams(path.split('?')[1])));
  }
  throw new Error('Fuel period API not available yet');
}

export function useFuelPeriods(opts: { from?: string; to?: string; enabled?: boolean }) {
  return useQuery({
    queryKey: [FUEL_PERIODS_KEY, opts.from, opts.to],
    enabled: opts.enabled !== false && Boolean(opts.from && opts.to),
    queryFn: async (): Promise<FuelPeriodRow[]> => {
      try {
        const anyApi = api as any;
        if (typeof anyApi.listFuelReconciliationPeriods === 'function') {
          return await anyApi.listFuelReconciliationPeriods({ from: opts.from, to: opts.to });
        }
        return [];
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
      const anyApi = api as any;
      if (typeof anyApi.getFuelReconciliationPeriod === 'function') {
        return await anyApi.getFuelReconciliationPeriod(periodId);
      }
      return null;
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
    }) => {
      const anyApi = api as any;
      if (typeof anyApi.enqueueFuelPeriodFinalize !== 'function') {
        throw new Error('Finalize job API not deployed yet');
      }
      return anyApi.enqueueFuelPeriodFinalize(args);
    },
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: async (args: {
      periodId: string;
      version: number;
      reason: string;
      idempotencyKey: string;
    }) => {
      const anyApi = api as any;
      if (typeof anyApi.enqueueFuelPeriodReopen !== 'function') {
        throw new Error('Reopen job API not deployed yet');
      }
      return anyApi.enqueueFuelPeriodReopen(args);
    },
    onSuccess: invalidate,
  });

  const reviewLeakage = useMutation({
    mutationFn: async (args: { periodId: string; note?: string }) => {
      const anyApi = api as any;
      if (typeof anyApi.reviewFuelPeriodLeakage === 'function') {
        return anyApi.reviewFuelPeriodLeakage(args);
      }
      return { ok: false };
    },
    onSuccess: invalidate,
  });

  return { finalize, reopen, reviewLeakage, invalidate };
}

// silence unused until routes land
void fetchJson;
