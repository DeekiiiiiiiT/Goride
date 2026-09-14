import { useQuery, useQueryClient } from '@tanstack/react-query';
import { countFuelReviewQueueWork } from '@roam/fuel-core';
import { api } from '../services/api';
import type { FinancialTransaction } from '../types/data';
import { fuelReviewQueueLookbackRange, FUEL_REVIEW_QUEUE_TX_PAGE_SIZE, FUEL_REVIEW_QUEUE_TX_MAX_PAGES } from '../utils/fuelReviewQueueLookback';

export const FUEL_REVIEW_QUEUE_COUNTS_KEY = ['fuel-review-queue-counts'] as const;

async function fetchReviewQueueCounts() {
  const { startDate, endDate } = fuelReviewQueueLookbackRange();
  const txs = (await api.getAllTransactionsInRange({
    startDate,
    endDate,
    pageSize: FUEL_REVIEW_QUEUE_TX_PAGE_SIZE,
    maxPages: FUEL_REVIEW_QUEUE_TX_MAX_PAGES,
  })) as FinancialTransaction[];
  return countFuelReviewQueueWork(txs);
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
