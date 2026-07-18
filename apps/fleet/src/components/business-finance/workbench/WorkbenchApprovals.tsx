/**
 * Workbench Approvals — reuses ExpenseApprovals writers (api.saveTransaction).
 */
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { api } from '../../../services/api';
import { ExpenseApprovals } from '../../finance/ExpenseApprovals';
import type { FinancialTransaction } from '../../../types/data';
import type { BusinessFinancePeriod } from '../types';
import { inPeriod } from '../periodRange';

function txDateYmd(t: FinancialTransaction): string {
  return String((t as any).date || (t as any).createdAt || '').slice(0, 10);
}

export function WorkbenchApprovals({
  onBack,
  period,
}: {
  onBack: () => void;
  period: BusinessFinancePeriod;
}) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const q = useQuery({
    queryKey: ['workbench-pending-expenses'],
    queryFn: async () => {
      const res = await api.getTransactions(undefined, { limit: 500, offset: 0 });
      const list: FinancialTransaction[] = Array.isArray(res)
        ? res
        : Array.isArray((res as any)?.data)
          ? (res as any).data
          : Array.isArray((res as any)?.transactions)
            ? (res as any).transactions
            : [];
      return list;
    },
    staleTime: 30_000,
  });

  const pendingAll = useMemo(
    () => (q.data || []).filter((t) => t.type === 'Expense' && t.status === 'Pending'),
    [q.data],
  );

  const pendingInPeriod = useMemo(
    () => pendingAll.filter((t) => inPeriod(txDateYmd(t), period)),
    [pendingAll, period],
  );

  const outsideCount = pendingAll.length - pendingInPeriod.length;
  const displayList = showAll
    ? q.data || []
    : (q.data || []).filter((t) => {
        if (!(t.type === 'Expense' && t.status === 'Pending')) return true;
        return inPeriod(txDateYmd(t), period);
      });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Approvals queue</h2>
          <p className="text-xs text-slate-500">
            {showAll ? 'All pending expenses (any week).' : 'Pending in selected period.'} Approve or reject
            pending expenses.
          </p>
          {!showAll && outsideCount > 0 && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
              {outsideCount} pending outside this period.{' '}
              <button type="button" className="underline font-medium" onClick={() => setShowAll(true)}>
                Show all pending
              </button>
            </p>
          )}
          {showAll && (
            <button
              type="button"
              className="text-xs text-indigo-600 underline mt-1"
              onClick={() => setShowAll(false)}
            >
              Show selected period only
            </button>
          )}
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          Back to Workbench
        </Button>
      </div>
      {q.isLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading expenses…
        </div>
      ) : (
        <ExpenseApprovals
          transactions={displayList}
          onUpdate={() => {
            void qc.invalidateQueries({ queryKey: ['workbench-pending-expenses'] });
          }}
        />
      )}
    </div>
  );
}
