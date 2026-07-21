import React from 'react';
import { Loader2, Plus, Save } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { cn } from '../ui/utils';
import { api } from '../../services/api';
import { formatMoney } from './money';
import type { BusinessFinancePeriod, ExpensesSnapshot } from './types';

type BudgetRow = {
  id?: string;
  month: string;
  category: string;
  limit: number;
};

const DEFAULT_CATEGORIES = ['Fuel', 'Tolls', 'Maintenance', 'Insurance', 'Fleet Cleaning'];

/**
 * Budget-vs-actual overlay. Budgets are monthly targets (never ledger events);
 * actuals come from the canonical ledger via the bundle's Expenses snapshot.
 * Categories with no ledger actual yet are shown honestly as "not tracked",
 * never as $0 (see business-finance-recognition-policy.md).
 */
export function BudgetsTab({
  expenses,
  period,
}: {
  expenses: ExpensesSnapshot;
  period: BusinessFinancePeriod;
}) {
  const month = period.endYmd.slice(0, 7); // YYYY-MM of the period end
  const [rows, setRows] = React.useState<BudgetRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const all: BudgetRow[] = (await api.getBudgets()) || [];
      const forMonth = all.filter((b) => b.month === month);
      if (forMonth.length > 0) {
        setRows(forMonth);
      } else {
        setRows(DEFAULT_CATEGORIES.map((category) => ({ month, category, limit: 0 })));
      }
    } catch (e) {
      console.error('[BudgetsTab] failed to load budgets', e);
      toast.error('Failed to load budgets');
      setRows(DEFAULT_CATEGORIES.map((category) => ({ month, category, limit: 0 })));
    } finally {
      setLoading(false);
    }
  }, [month]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const setLimit = (idx: number, value: string) => {
    const limit = Number(value);
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, limit: Number.isFinite(limit) ? limit : 0 } : r)));
  };

  const saveRow = async (idx: number) => {
    const row = rows[idx];
    if (!row.category.trim()) {
      toast.error('Category is required');
      return;
    }
    setSavingKey(`${idx}`);
    try {
      const saved = await api.saveBudget({
        id: row.id,
        month: row.month,
        category: row.category.trim(),
        limit: Number(row.limit) || 0,
      });
      const savedRow = (saved?.data || saved) as BudgetRow;
      setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, id: savedRow?.id ?? r.id } : r)));
      toast.success(`Saved ${row.category} budget`);
    } catch (e) {
      console.error('[BudgetsTab] failed to save budget', e);
      toast.error('Failed to save budget');
    } finally {
      setSavingKey(null);
    }
  };

  const addRow = () => {
    setRows((prev) => [...prev, { month, category: '', limit: 0 }]);
  };

  const setCategory = (idx: number, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, category: value } : r)));
  };

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">Budget vs actual</CardTitle>
            <p className="text-xs text-slate-500 mt-1">
              Monthly targets for {month}. Actuals are ledger-sourced for the selected period; untracked categories are labeled, never shown as $0.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={addRow}>
            <Plus className="h-4 w-4 mr-1" />
            Add category
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading budgets…
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Budget (monthly)</TableHead>
                  <TableHead className="text-right">Actual (period)</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Save</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const actual = actualForCategory(row.category, expenses);
                  const hasActual = typeof actual === 'number';
                  const variance = hasActual ? row.limit - (actual as number) : null;
                  return (
                    <TableRow key={row.id ?? `new-${idx}`}>
                      <TableCell>
                        {row.id ? (
                          <span className="font-medium">{row.category}</span>
                        ) : (
                          <Input
                            value={row.category}
                            placeholder="e.g. Insurance"
                            className="h-8 w-40"
                            onChange={(e) => setCategory(idx, e.target.value)}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          value={String(row.limit)}
                          className="h-8 w-32 ml-auto text-right tabular-nums"
                          onChange={(e) => setLimit(idx, e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {hasActual ? (
                          formatMoney(actual as number)
                        ) : (
                          <span className="text-xs text-slate-400">Not tracked yet</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          variance != null && variance < 0 && 'text-rose-600 dark:text-rose-400',
                          variance != null && variance >= 0 && 'text-emerald-700 dark:text-emerald-400',
                        )}
                      >
                        {variance != null ? formatMoney(variance) : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          disabled={savingKey === `${idx}`}
                          onClick={() => void saveRow(idx)}
                        >
                          {savingKey === `${idx}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="text-xs text-slate-500">
        Fuel and Tolls actuals are live from the ledger. Insurance, Lease, and other fixed
        costs populate here once recurring expenses are wired into the ledger.
      </p>
    </div>
  );
}

/**
 * Map a budget category to its ledger actual.
 * number = tracked actual, null/undefined = no ledger actual yet (labeled honestly).
 */
function actualForCategory(
  category: string,
  expenses: ExpensesSnapshot,
): number | null | undefined {
  const key = category.trim().toLowerCase();
  const find = (id: string) => expenses.categories.find((c) => c.id === id);
  if (key === 'fuel') {
    const c = find('fuel');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'toll' || key === 'tolls') {
    const c = find('toll');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'maintenance') {
    const c = find('maintenance');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'insurance') {
    const c = find('insurance');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'lease' || key === 'lease / financing' || key === 'vehicle payment') {
    const c = find('lease');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'software' || key === 'software/subscription') {
    const c = find('software');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'security' || key === 'gps' || key === 'tracking') {
    const c = find('security');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'permits' || key === 'registration') {
    const c = find('permits');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  if (key === 'equipment') {
    const c = find('equipment');
    return c?.tracked ? c.amount ?? undefined : undefined;
  }
  return undefined;
}
