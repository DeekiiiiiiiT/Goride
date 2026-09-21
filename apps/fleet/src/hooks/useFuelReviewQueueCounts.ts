import { useQuery, useQueryClient } from '@tanstack/react-query';
import { countFuelReviewQueueWork } from '@roam/fuel-core';
import { api } from '../services/api';
import { fuelService } from '../services/fuelService';
import type { FinancialTransaction } from '../types/data';
import { fuelReviewQueueLookbackRange, FUEL_REVIEW_QUEUE_TX_PAGE_SIZE, FUEL_REVIEW_QUEUE_TX_MAX_PAGES } from '../utils/fuelReviewQueueLookback';

export const FUEL_REVIEW_QUEUE_COUNTS_KEY = ['fuel-review-queue-counts'] as const;

export type FuelReviewQueueNavCounts = ReturnType<typeof countFuelReviewQueueWork> & {
  unattributedFuelCount: number;
};

async function fetchReviewQueueCounts(): Promise<FuelReviewQueueNavCounts> {
  const { startDate, endDate } = fuelReviewQueueLookbackRange();
  const [txs, lineCounts] = await Promise.all([
    api.getAllTransactionsInRange({
      startDate,
      endDate,
      pageSize: FUEL_REVIEW_QUEUE_TX_PAGE_SIZE,
      maxPages: FUEL_REVIEW_QUEUE_TX_MAX_PAGES,
    }) as Promise<FinancialTransaction[]>,
    fuelService.getFuelEntryLineCounts({ startDate, endDate }).catch(() => ({
      all: 0,
      rideshare: 0,
      rush_delivery: 0,
      unattributed: 0,
    })),
  ]);
  const work = countFuelReviewQueueWork(txs);
  return {
    ...work,
    unattributedFuelCount: lineCounts.unattributed ?? 0,
  };
}

export function useFuelReviewQueueCounts(enabled = true) {
  return useQuery({
    queryKey: FUEL_REVIEW_QUEUE_COUNTS_KEY,
    queryFn: fetchReviewQueueCounts,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useInvalidateFuelReviewQueueCounts() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: FUEL_REVIEW_QUEUE_COUNTS_KEY });
  };
}
