/**
 * Lightweight expenses-only loader for the Expense Hub desk.
 * Fetches just the canonical expense ledger — unlike useBusinessFinanceBundle,
 * it never touches driver periods, bank confirms, or reconciliation health,
 * so the Hub opens fast.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { resolvePeriod } from '../periodRange';
import { fetchAllCanonicalEvents, buildExpensesSnapshot } from '../expensesSnapshot';
import type { ExpensesSnapshot, PeriodPreset } from '../types';

export function useExpensesSnapshot(
  preset: PeriodPreset,
  customStart?: string,
  customEnd?: string,
) {
  const { organizationId } = useAuth();
  const period = React.useMemo(
    () => resolvePeriod(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );

  const query = useQuery<ExpensesSnapshot>({
    queryKey: ['expense-hub-snapshot', period.startYmd, period.endYmd, organizationId || null],
    queryFn: async () => {
      const events = await fetchAllCanonicalEvents(period.startYmd, period.endYmd);
      return buildExpensesSnapshot(events, period);
    },
    staleTime: 60_000,
  });

  return { period, ...query };
}
