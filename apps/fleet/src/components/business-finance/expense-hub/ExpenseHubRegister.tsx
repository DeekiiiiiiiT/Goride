/**
 * Expense Hub — Register subview.
 * Stitch "Expense Register" (Mobile 238445b8 / Desktop 86a95cb6) translated onto real
 * hub documents: breadcrumb header + action bar, quick tabs + filter card, dense desktop
 * table (allocation/receipt/status), stacked mobile cards, API-backed pagination.
 * Unsupported Stitch widgets (export, bulk actions, saved reports, sort control) omitted.
 */
import React from 'react';
import { ChevronLeft, ChevronRight, Plus, ReceiptText, Search, Truck } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
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
import type { ExpenseDocument } from '../../../types/expenseHub';
import { usePermissions } from '../../../hooks/usePermissions';
import { DocStatusBadge, HubEmpty, HubError, HubLoading } from './HubStates';
import { useVehicleOptions } from './useVehicleOptions';
import { ExpenseHubNewExpenseWizard } from './ExpenseHubNewExpenseWizard';
import { useRegisterDocuments, REGISTER_PAGE_SIZE } from './useRegisterDocuments';
import { formatYmd } from './formatYmd';

const STATUS_FILTERS = [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'posted',
  'partially_paid',
  'paid',
  'voided',
] as const;

function allocationLabel(
  doc: ExpenseDocument,
  vehicleLabels: Map<string, string>,
): string {
  const allocations = doc.allocations || [];
  if (allocations.length === 0) return 'Unallocated';
  if (allocations.length === 1) {
    const id = allocations[0].vehicleId;
    return vehicleLabels.get(id) || id;
  }
  return `${allocations.length} vehicles`;
}

function ReceiptIndicator({ doc, muted }: { doc: ExpenseDocument; muted?: boolean }) {
  const attached = (doc.evidenceUrls?.length || 0) > 0;
  if (!attached) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
        <ReceiptText className="h-4 w-4" aria-hidden="true" />
        No receipt
      </span>
    );
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        muted ? 'text-slate-500' : 'text-indigo-700 dark:text-indigo-400',
      )}
    >
      <ReceiptText className="h-4 w-4" aria-hidden="true" />
      Receipt attached
    </span>
  );
}

/** Compact page-number window (current ±1) like the Stitch footer pager. */
function pageWindow(page: number, pageCount: number): number[] {
  const start = Math.max(0, Math.min(page - 1, pageCount - 3));
  return Array.from({ length: Math.min(3, pageCount) }, (_, i) => start + i);
}

export function ExpenseHubRegister({
  initialVehicleId,
  onOpenDetail,
  onChanged,
  writesEnabled = true,
}: {
  initialVehicleId?: string;
  onOpenDetail: (id: string) => void;
  onChanged?: () => void;
  writesEnabled?: boolean;
}) {
  const { can } = usePermissions();
  const [status, setStatus] = React.useState('all');
  const [vehicleId, setVehicleId] = React.useState(initialVehicleId || 'all');
  const [searchInput, setSearchInput] = React.useState('');
  const [q, setQ] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  // Debounced free-text filter so we don't refetch per keystroke
  React.useEffect(() => {
    const t = setTimeout(() => setQ(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Any filter change restarts pagination at the first page.
  React.useEffect(() => {
    setPage(0);
  }, [status, vehicleId, q]);

  const vehicleOptions = useVehicleOptions();
  const vehicleLabels = React.useMemo(
    () => new Map((vehicleOptions.data || []).map((v) => [v.id, v.label])),
    [vehicleOptions.data],
  );

  const docsQuery = useRegisterDocuments({
    status: status === 'all' ? undefined : status,
    vehicleId: vehicleId === 'all' ? undefined : vehicleId,
    q: q || undefined,
    offset: page * REGISTER_PAGE_SIZE,
  });

  const items = docsQuery.data?.items || [];
  const total = docsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / REGISTER_PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : page * REGISTER_PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, page * REGISTER_PAGE_SIZE + items.length);
  const canCreate = can('expenses.create') && writesEnabled;

  const newExpenseButton = canCreate ? (
    <Button type="button" className="min-h-11" onClick={() => setWizardOpen(true)}>
      <Plus className="mr-2 h-4 w-4" />
      New expense
    </Button>
  ) : undefined;

  const pagination = (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
      <span className="text-xs text-slate-500 dark:text-slate-400">
        Showing <span className="font-semibold text-slate-900 dark:text-slate-100">{rangeStart}</span>
        –<span className="font-semibold text-slate-900 dark:text-slate-100">{rangeEnd}</span> of{' '}
        <span className="font-semibold text-slate-900 dark:text-slate-100">{total}</span> expenses
      </span>
      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Register pages">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 w-9 p-0"
            disabled={page === 0 || docsQuery.isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pageWindow(page, pageCount).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={p === page ? 'default' : 'outline'}
              className="h-9 w-9 p-0 tabular-nums"
              disabled={docsQuery.isFetching && p !== page}
              onClick={() => setPage(p)}
              aria-label={`Page ${p + 1}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p + 1}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9 w-9 p-0"
            disabled={page >= pageCount - 1 || docsQuery.isFetching}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </nav>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Breadcrumb-style header (desktop) */}
      <nav
        className="hidden items-center gap-1.5 text-xs font-medium text-slate-500 md:flex"
        aria-label="Breadcrumb"
      >
        <span>Finance</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Expense Hub</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-bold text-slate-900 dark:text-slate-100">Register</span>
      </nav>

      {/* Page header & action bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Expense Register
          </h2>
          <p className="text-xs text-slate-500">
            Manage and track all operational expenditures across the fleet.
          </p>
        </div>
        {newExpenseButton}
      </div>

      {/* Filters card: quick tabs + search/status/vehicle */}
      <Card className="rounded-lg border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center border-b border-slate-200 px-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setStatus('all')}
            className={cn(
              'min-h-11 px-4 text-xs font-semibold uppercase tracking-wide transition-colors',
              status === 'all'
                ? 'border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )}
          >
            All expenses
          </button>
          <button
            type="button"
            onClick={() => setStatus('submitted')}
            className={cn(
              'min-h-11 px-4 text-xs font-semibold uppercase tracking-wide transition-colors',
              status === 'submitted'
                ? 'border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-400'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-100',
            )}
          >
            Pending approval
          </button>
        </div>
        <CardContent className="grid grid-cols-1 gap-2 p-3 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search description or vendor…"
              className="h-11 pl-9"
              aria-label="Search expenses"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="min-h-11" aria-label="Status filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_FILTERS.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={vehicleId} onValueChange={setVehicleId}>
            <SelectTrigger className="min-h-11" aria-label="Vehicle filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vehicles</SelectItem>
              {(vehicleOptions.data || []).map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {docsQuery.isLoading ? (
        <HubLoading label="Loading expense documents…" />
      ) : docsQuery.isError ? (
        <HubError
          message={(docsQuery.error as Error)?.message}
          onRetry={() => void docsQuery.refetch()}
        />
      ) : items.length === 0 ? (
        <HubEmpty
          title="No expenses found"
          description={
            status !== 'all' || vehicleId !== 'all' || q
              ? 'Try adjusting your filters or search query to find what you are looking for.'
              : 'Create your first hub expense to start the approval and payment trail.'
          }
          action={newExpenseButton}
        />
      ) : (
        <>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {total} expense{total === 1 ? '' : 's'} recorded
          </p>

          {/* Desktop: dense table */}
          <Card
            className={cn(
              'hidden overflow-hidden rounded-lg border-slate-200 dark:border-slate-800 md:block',
              docsQuery.isFetching && 'opacity-70',
            )}
            aria-busy={docsQuery.isFetching}
          >
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                    <TableHead className="text-xs uppercase tracking-wider">Date</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Vendor</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Category</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Allocation</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-center text-xs uppercase tracking-wider">
                      Receipt
                    </TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wider">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((d) => (
                    <TableRow
                      key={d.id}
                      className="h-12 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      onClick={() => onOpenDetail(d.id)}
                    >
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatYmd(d.incurredDate)}
                      </TableCell>
                      <TableCell className="max-w-[240px]">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {d.vendorName || d.description}
                        </div>
                        {d.vendorName && (
                          <div className="truncate text-xs text-slate-500">{d.description}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs capitalize text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {String(d.category).replace('_', ' ')}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-slate-600 dark:text-slate-300">
                        {allocationLabel(d, vehicleLabels)}
                      </TableCell>
                      <TableCell>
                        <DocStatusBadge status={d.status} />
                      </TableCell>
                      <TableCell className="text-center">
                        <ReceiptIndicator doc={d} />
                      </TableCell>
                      <TableCell className="text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {formatMoney(d.netAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pagination}
            </CardContent>
          </Card>

          {/* Mobile: stacked cards */}
          <div
            className={cn('space-y-3 md:hidden', docsQuery.isFetching && 'opacity-70')}
            aria-busy={docsQuery.isFetching}
          >
            {items.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => onOpenDetail(d.id)}
                className="block w-full rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                      {d.vendorName || d.description}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      <span className="capitalize">{String(d.category).replace('_', ' ')}</span>
                      {' • '}
                      {formatYmd(d.incurredDate)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-base font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
                      {formatMoney(d.netAmount)}
                    </p>
                    <DocStatusBadge status={d.status} />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                  <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <Truck className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {allocationLabel(d, vehicleLabels)}
                  </span>
                  <ReceiptIndicator doc={d} />
                </div>
              </button>
            ))}
            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
              {pagination}
            </div>
          </div>
        </>
      )}

      <ExpenseHubNewExpenseWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={onChanged}
      />
    </div>
  );
}
