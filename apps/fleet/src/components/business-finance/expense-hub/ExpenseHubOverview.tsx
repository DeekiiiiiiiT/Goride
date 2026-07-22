/**
 * Expense Hub — Overview subview.
 * Stitch "Expense Hub — Overview" (Mobile b70d3395 / Desktop d43f2232) translated onto
 * real data: hub summary KPIs, spend-over-time (as paid / spread), Fuel/Toll specialist-desk
 * cards, category actuals with share bars, and the dense ledger table.
 */
import React from 'react';
import {
  ArrowRight,
  Coins,
  FileCheck,
  FileText,
  Fuel,
  Laptop,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Shield,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Skeleton } from '../../ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../ui/table';
import { cn } from '../../ui/utils';
import { formatMoney } from '../money';
import type { ExpenseCategorySummary, ExpensesSnapshot } from '../types';
import { usePermissions } from '../../../hooks/usePermissions';
import { api } from '../../../services/api';
import { LogBusinessExpenseDialog } from '../LogBusinessExpenseDialog';
import {
  useExpenseHubSpendBreakdown,
  useExpenseHubSummary,
} from '../../../hooks/useExpenseHub';
import type { ExpenseSpendLens } from '../../../types/expenseHub';
import { runRateAverages } from '../../../utils/expenseCoverageRunRate';
import { formatYmd } from './formatYmd';
import { ExpenseHubSpendOverTime } from './ExpenseHubSpendOverTime';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  fuel: Fuel,
  toll: Coins,
  maintenance: Wrench,
  insurance: ShieldCheck,
  lease: FileText,
  security: Shield,
  software: Laptop,
  permits: FileCheck,
  equipment: Package,
  other: Receipt,
};

/** Map spend-breakdown category labels → Overview category ids. */
const CATEGORY_LABEL_TO_ID: Record<string, string> = {
  Fuel: 'fuel',
  Toll: 'toll',
  Tolls: 'toll',
  Maintenance: 'maintenance',
  Insurance: 'insurance',
  Lease: 'lease',
  Security: 'security',
  Tracking: 'security',
  Software: 'software',
  'Software/Subscription': 'software',
  Permits: 'permits',
  Registration: 'permits',
  Equipment: 'equipment',
  Other: 'other',
  Parking: 'other',
};

function categoryIcon(id: string): LucideIcon {
  return CATEGORY_ICONS[id] || Receipt;
}

function amountsByCategoryId(
  byCategory: Array<{ category: string; amount: number }> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of byCategory || []) {
    const id = CATEGORY_LABEL_TO_ID[row.category] || 'other';
    out[id] = (out[id] || 0) + row.amount;
  }
  return out;
}

/** Stitch KPI section: 3 stacked full-width cards + 2-up small grid on mobile, one row on desktop. */
function HubKpiStrip({ startYmd, endYmd }: { startYmd: string; endYmd: string }) {
  const { data, isLoading, isError } = useExpenseHubSummary(startYmd, endYmd);

  if (isError) {
    return (
      <p className="text-xs text-rose-600 dark:text-rose-400">
        Hub summary unavailable for this period.
      </p>
    );
  }

  if (isLoading || !data) {
    return (
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-busy="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
              i < 3 && 'col-span-2 lg:col-span-1',
            )}
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-7 w-20" />
          </div>
        ))}
      </section>
    );
  }

  const cardClass =
    'rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-1 dark:border-slate-800 dark:bg-slate-900';
  const labelClass =
    'text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400';

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <div className={cn(cardClass, 'col-span-2 lg:col-span-1')}>
        <p className={labelClass}>Posted this period</p>
        <p className="text-2xl font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
          {formatMoney(data.postedExpenseTotal)}
        </p>
      </div>
      <div className={cn(cardClass, 'col-span-2 lg:col-span-1')}>
        <p className={labelClass}>Paid this period</p>
        <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {formatMoney(data.paidThisPeriod)}
        </p>
      </div>
      <div className={cn(cardClass, 'col-span-2 lg:col-span-1')}>
        <p className={labelClass}>Pending approvals</p>
        <div className="flex items-center gap-2">
          <p className="text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {data.pendingApprovalCount}
          </p>
          {data.pendingApprovalCount > 0 && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-300">
              Requires action
            </span>
          )}
        </div>
      </div>
      <div className={cardClass}>
        <p className={labelClass}>Overdue unpaid</p>
        <p
          className={cn(
            'text-xl font-bold tabular-nums',
            data.overdueUnpaidCount > 0
              ? 'text-rose-700 dark:text-rose-400'
              : 'text-slate-900 dark:text-slate-100',
          )}
        >
          {data.overdueUnpaidCount}
        </p>
      </div>
      <div className={cardClass}>
        <p className={labelClass}>Active rules</p>
        <p className="text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
          {data.activeRuleCount}
        </p>
      </div>
    </section>
  );
}

/** Stitch "Operational Expenses" card — Fuel/Toll specialist desks with real amounts + deep links. */
function OperationalCard({
  category,
  onNavigatePage,
  runRateLine,
}: {
  category: ExpenseCategorySummary;
  onNavigatePage?: (page: string) => void;
  runRateLine?: string | null;
}) {
  const Icon = categoryIcon(category.id);
  return (
    <Card className="rounded-lg border-slate-200 dark:border-slate-800 overflow-hidden">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-400">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-base font-bold text-slate-900 dark:text-slate-100">
                {category.label}
              </p>
              {category.note && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{category.note}</p>
              )}
              {runRateLine && (
                <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                  {runRateLine}
                </p>
              )}
            </div>
          </div>
          <p className="text-lg font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {category.tracked && category.amount != null
              ? formatMoney(category.amount)
              : 'Not tracked yet'}
          </p>
        </div>
        <Button
          type="button"
          className="min-h-11 w-full"
          onClick={() => onNavigatePage?.(category.deepLinkPage!)}
        >
          {category.deepLinkLabel}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/** Stitch "Expenses by Category" compact row, with a desktop share bar (real amounts only). */
function CategoryRow({
  category,
  sharePercent,
  runRateLine,
}: {
  category: ExpenseCategorySummary;
  sharePercent: number | null;
  runRateLine?: string | null;
}) {
  const Icon = categoryIcon(category.id);
  const tracked = category.tracked && category.amount != null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-slate-400" />
        <div className="min-w-0">
          <p className="truncate text-sm text-slate-900 dark:text-slate-100">{category.label}</p>
          {category.note && (
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{category.note}</p>
          )}
          {runRateLine && (
            <p className="truncate text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {runRateLine}
            </p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {tracked && sharePercent != null && (
          <div className="hidden items-center gap-2 md:flex" aria-hidden="true">
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 dark:bg-indigo-500"
                style={{ width: `${sharePercent}%` }}
              />
            </div>
            <span className="w-9 text-right text-xs tabular-nums text-slate-500">
              {sharePercent}%
            </span>
          </div>
        )}
        <p
          className={cn(
            'text-sm font-bold tabular-nums',
            tracked ? 'text-slate-900 dark:text-slate-100' : 'font-normal text-slate-400',
          )}
        >
          {tracked ? formatMoney(category.amount) : 'Not tracked yet'}
        </p>
      </div>
    </div>
  );
}

function formatRunRateLine(
  amount: number | null | undefined,
  startYmd: string,
  endYmd: string,
): string | null {
  if (amount == null || !(amount > 0.005)) return null;
  const avg = runRateAverages(amount, startYmd, endYmd);
  return `≈ ${formatMoney(avg.perDay)} / day · ${formatMoney(avg.perWeek)} / week · ${formatMoney(avg.perMonth)} / month`;
}

export function ExpenseHubOverview({
  expenses,
  onNavigatePage,
  onChanged,
  period,
  hubEnabled,
}: {
  expenses: ExpensesSnapshot;
  onNavigatePage?: (page: string) => void;
  onChanged?: () => void;
  period?: { startYmd: string; endYmd: string };
  hubEnabled: boolean;
}) {
  const { can } = usePermissions();
  const [logOpen, setLogOpen] = React.useState(false);
  const [syncing, setSyncing] = React.useState(false);
  // Default Spread so months with no cash still show operating cost.
  const [lens, setLens] = React.useState<ExpenseSpendLens>('spread');

  const spendQuery = useExpenseHubSpendBreakdown(
    period?.startYmd || '',
    period?.endYmd || '',
  );

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
      console.error('[ExpenseHubOverview] historical sync failed', error);
      toast.error(error instanceof Error ? error.message : 'Expense sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const lensAmounts = React.useMemo(() => {
    if (!spendQuery.data) return null;
    const src = lens === 'spread' ? spendQuery.data.spread : spendQuery.data.asPaid;
    return amountsByCategoryId(src.byCategory);
  }, [spendQuery.data, lens]);

  const displayCategories = React.useMemo(() => {
    if (!lensAmounts) return expenses.categories;
    return expenses.categories.map((c) => {
      const nextAmount = lensAmounts[c.id] ?? 0;
      let note = c.note;
      if (c.id === 'insurance') {
        note =
          lens === 'spread'
            ? 'Coverage cost for this period (annual premiums spread across coverage dates).'
            : 'Scheduled recurring costs plus posted one-off insurance expenses.';
      }
      return { ...c, amount: nextAmount, note };
    });
  }, [expenses.categories, lensAmounts, lens]);

  // Stitch splits "Operational Expenses" (specialist desks) from plain category actuals.
  const operationalCategories = displayCategories.filter(
    (c) => c.deepLinkPage && c.deepLinkLabel,
  );
  const plainCategories = displayCategories.filter((c) => !(c.deepLinkPage && c.deepLinkLabel));
  const trackedTotal = displayCategories.reduce(
    (sum, c) => sum + (c.tracked && c.amount != null && c.amount > 0 ? c.amount : 0),
    0,
  );
  const shareOf = (c: ExpenseCategorySummary): number | null =>
    trackedTotal > 0 && c.tracked && c.amount != null && c.amount > 0
      ? Math.min(100, Math.round((c.amount / trackedTotal) * 100))
      : null;

  const runRateFor = (c: ExpenseCategorySummary) =>
    period ? formatRunRateLine(c.amount, period.startYmd, period.endYmd) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Expense Hub — Overview
          </h2>
          <p className="text-xs text-slate-500">
            Ledger-posted actuals. Recurring schedules are managed on each vehicle
            {hubEnabled ? ' and in Hub Rules' : ''}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {can('data.backfill') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-11"
              disabled={syncing}
              onClick={() => void syncHistoricalExpenses()}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync historical
            </Button>
          )}
          {can('transactions.edit') && (
            <Button type="button" size="sm" className="min-h-11" onClick={() => setLogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Log expense
            </Button>
          )}
        </div>
      </div>

      {hubEnabled && period && (
        <HubKpiStrip startYmd={period.startYmd} endYmd={period.endYmd} />
      )}

      {hubEnabled && period && (
        <ExpenseHubSpendOverTime
          startYmd={period.startYmd}
          endYmd={period.endYmd}
          lens={lens}
          onLensChange={setLens}
        />
      )}

      {operationalCategories.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Operational expenses
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {operationalCategories.map((c) => (
              <OperationalCard
                key={c.id}
                category={c}
                onNavigatePage={onNavigatePage}
                runRateLine={runRateFor(c)}
              />
            ))}
          </div>
        </section>
      )}

      {plainCategories.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Expenses by category
          </h3>
          <div className="space-y-2">
            {plainCategories.map((c) => (
              <CategoryRow
                key={c.id}
                category={c}
                sharePercent={shareOf(c)}
                runRateLine={runRateFor(c)}
              />
            ))}
          </div>
        </section>
      )}

      <Card className="rounded-lg border-slate-200 dark:border-slate-800 overflow-hidden">
        <CardHeader className="border-b border-slate-100 dark:border-slate-800 py-3">
          <CardTitle className="text-sm font-semibold">Expense detail</CardTitle>
          {lens === 'spread' && (
            <p className="text-xs font-normal text-slate-500">
              Table shows payments and due-dated posts; chart above uses the selected cost view.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Description</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wider">
                  Amount
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Source</TableHead>
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
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatYmd(r.dateYmd)}
                    </TableCell>
                    <TableCell className="capitalize">{r.category}</TableCell>
                    <TableCell className="max-w-[240px] truncate">{r.description}</TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
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
