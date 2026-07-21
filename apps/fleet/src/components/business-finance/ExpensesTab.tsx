import React from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../ui/button';
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
import { formatMoney } from './money';
import type { ExpensesSnapshot } from './types';
import { usePermissions } from '../../hooks/usePermissions';
import { api } from '../../services/api';
import { LogBusinessExpenseDialog } from './LogBusinessExpenseDialog';

export function ExpensesTab({
  expenses,
  onNavigatePage,
  onChanged,
}: {
  expenses: ExpensesSnapshot;
  onNavigatePage?: (page: string) => void;
  onChanged?: () => void;
}) {
  const { can } = usePermissions();
  const [logOpen, setLogOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);

  const syncHistoricalExpenses = async () => {
    setSyncing(true);
    try {
      const result = await api.syncBusinessFinanceExpenses(false);
      const fixed = result.stats.fixed_expenses;
      const generic = result.stats.generic_transactions;
      toast.success(
        `Expense sync complete: ${(fixed?.appended || 0) + (generic?.appended || 0)} posted, ${(fixed?.skipped || 0) + (generic?.skipped || 0)} already current`,
      );
      onChanged?.();
    } catch (error) {
      console.error('[ExpensesTab] historical sync failed', error);
      toast.error(error instanceof Error ? error.message : 'Expense sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Business expenses</h2>
          <p className="text-xs text-slate-500">
            Ledger-posted actuals. Recurring schedules are managed on each vehicle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('data.backfill') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={syncing}
              onClick={() => void syncHistoricalExpenses()}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync historical
            </Button>
          )}
          {can('transactions.edit') && (
            <Button type="button" size="sm" onClick={() => setLogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Log expense
            </Button>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {expenses.categories.map((c) => (
          <Card key={c.id} className="border-slate-200 dark:border-slate-800 rounded-md">
            <CardHeader className="py-3 pb-1">
              <CardTitle className="text-sm font-semibold">{c.label}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div className="text-xl font-bold tabular-nums">
                {c.tracked && c.amount != null ? formatMoney(c.amount) : 'Not tracked yet'}
              </div>
              {c.note && <div className="text-xs text-slate-500 dark:text-slate-400">{c.note}</div>}
              {c.deepLinkPage && c.deepLinkLabel && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => onNavigatePage?.(c.deepLinkPage!)}
                >
                  {c.deepLinkLabel}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Expense detail</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 py-8">
                    No expense ledger lines in this period.
                  </TableCell>
                </TableRow>
              ) : (
                expenses.rows.map((r) => (
                  <TableRow key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="whitespace-nowrap text-sm">{r.dateYmd}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.description}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        r.amount < 0 && 'text-emerald-700 dark:text-emerald-400',
                      )}
                    >
                      {formatMoney(r.amount)}
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">{r.source}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <LogBusinessExpenseDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        onSaved={() => onChanged?.()}
      />
    </div>
  );
}
