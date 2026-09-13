import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Eye,
  Pencil,
  AlertTriangle,
  ExternalLink,
  RotateCcw,
  Receipt,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { format, isValid } from 'date-fns';
import { TollLogEntry, tollLogNeedsReconciliationReset } from '../../types/tollLog';
import { parseTollDate } from '../../utils/tollWeekPeriod';
import { formatJMD } from '../../utils/formatJMD';
import { cn } from '../ui/utils';
import { useIsMobile } from '../ui/use-mobile';
import { TollSourceBadge, deriveTollSource } from '../toll-tags/reconciliation/TollSourceBadge';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortColumn = 'date' | 'vehicle' | 'amount' | 'status';
type SortDir = 'asc' | 'desc';

interface TollLogTableProps {
  logs: TollLogEntry[];
  loading: boolean;
  onRowClick: (log: TollLogEntry) => void;
  onEdit?: (log: TollLogEntry) => void;
  onFlagDisputed?: (log: TollLogEntry) => void;
  /** Opens confirm flow to reset ledger row for Toll Reconciliation → Unmatched */
  onResetForReconciliation?: (log: TollLogEntry) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (pageIds: string[]) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string): string {
  try {
    const d = parseTollDate(iso);
    return isValid(d) ? format(d, 'dd MMM yyyy') : iso;
  } catch {
    return iso;
  }
}

function fmtTime(time: string | null): string {
  if (!time) return '';
  // Already HH:mm:ss or HH:mm — just return the first 5 chars
  return time.length >= 5 ? time.slice(0, 5) : time;
}

function fmtJMD(value: number): string {
  return formatJMD(value, value % 1 === 0 ? 0 : 2);
}

/** Status → badge variant/colour */
function statusBadge(status: string) {
  switch (status) {
    case 'Completed':
    case 'Approved':
    case 'Verified':
      return { className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
    case 'Pending':
      return { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
    case 'Flagged':
    case 'Rejected':
    case 'Failed':
      return { className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' };
    case 'Reconciled':
      return { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800' };
    case 'Void':
    case 'Voided':
      return { className: 'bg-slate-100 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
    default:
      return { className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  }
}

/** Payment method → badge colour */
function paymentBadge(method: string) {
  switch (method) {
    case 'E-Tag':
      return { className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800' };
    case 'Cash':
      return { className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
    case 'Card':
      return { className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
    default:
      return { className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
  }
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <TableRow key={`skel-${i}`} className="animate-pulse">
          <TableCell className="w-[40px]">
            <div className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-24 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mt-1 h-3 w-12 rounded bg-slate-100 dark:bg-slate-800" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-16 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-5 w-14 rounded-full bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="ml-auto h-4 w-12 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="h-5 w-16 rounded-full bg-slate-200 dark:bg-slate-700" />
          </TableCell>
          <TableCell>
            <div className="ml-auto h-7 w-7 rounded bg-slate-200 dark:bg-slate-700" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function TollLogRowActions({
  log,
  onRowClick,
  onEdit,
  onFlagDisputed,
  onResetForReconciliation,
}: {
  log: TollLogEntry;
  onRowClick: (log: TollLogEntry) => void;
  onEdit?: (log: TollLogEntry) => void;
  onFlagDisputed?: (log: TollLogEntry) => void;
  onResetForReconciliation?: (log: TollLogEntry) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="min-h-11 min-w-11 p-0 text-slate-400 hover:text-slate-600 md:h-7 md:w-7 md:min-h-0 md:min-w-0"
          aria-label="Row actions"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onRowClick(log)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        {onEdit && (
          <DropdownMenuItem onClick={() => onEdit(log)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {onFlagDisputed && (
          <DropdownMenuItem onClick={() => onFlagDisputed(log)}>
            <AlertTriangle className="mr-2 h-4 w-4" />
            Flag as Disputed
          </DropdownMenuItem>
        )}
        {onResetForReconciliation && tollLogNeedsReconciliationReset(log) && (
          <DropdownMenuItem onClick={() => onResetForReconciliation(log)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Send back to reconciliation
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <ExternalLink className="mr-2 h-4 w-4" />
          Open in Reconciliation
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// Sortable Header
// ---------------------------------------------------------------------------

function SortableHead({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  className,
}: {
  label: React.ReactNode;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDir;
  onSort: (col: SortColumn) => void;
  className?: string;
}) {
  const isActive = column === activeColumn;
  return (
    <TableHead
      className={cn('cursor-pointer select-none whitespace-nowrap', className)}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
        )}
      </span>
    </TableHead>
  );
}

function MobileSortLabel({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = 'left',
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDir;
  onSort: (col: SortColumn) => void;
  align?: 'left' | 'center' | 'right';
}) {
  const isActive = column === activeColumn;
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-0.5 text-xs font-medium text-slate-500',
        align === 'center' && 'w-full justify-center',
        align === 'right' && 'w-full justify-end',
      )}
      onClick={() => onSort(column)}
    >
      {label}
      {isActive ? (
        direction === 'asc' ? (
          <ChevronUp className="h-3 w-3 shrink-0 text-indigo-500" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-indigo-500" />
        )
      ) : (
        <ChevronsUpDown className="h-3 w-3 shrink-0 text-slate-300" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function TollLogTable({
  logs,
  loading,
  onRowClick,
  onEdit,
  onFlagDisputed,
  onResetForReconciliation,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: TollLogTableProps) {
  const isMobile = useIsMobile();

  // --- Sorting state ---
  const [sortCol, setSortCol] = useState<SortColumn>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // --- Pagination state ---
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Toggle sort
  const handleSort = (col: SortColumn) => {
    if (col === sortCol) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
    setCurrentPage(1); // reset to page 1 on sort change
  };

  // Sorted data
  const sorted = useMemo(() => {
    const arr = [...logs];
    const dir = sortDir === 'asc' ? 1 : -1;

    arr.sort((a, b) => {
      switch (sortCol) {
        case 'date':
          return dir * (parseTollDate(a.date, a.time).getTime() - parseTollDate(b.date, b.time).getTime());
        case 'vehicle':
          return dir * a.vehicleName.localeCompare(b.vehicleName);
        case 'amount':
          return dir * (a.absAmount - b.absAmount);
        case 'status':
          return dir * a.statusDisplay.localeCompare(b.statusDisplay);
        default:
          return 0;
      }
    });
    return arr;
  }, [logs, sortCol, sortDir]);

  // Paginated data
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageData = sorted.slice(startIdx, startIdx + pageSize);

  // Selection helpers
  const allOnPageSelected =
    pageData.length > 0 && selectedIds
      ? pageData.every(l => selectedIds.has(l.id))
      : false;

  // Reset page when logs change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [logs.length]);

  const paginationFooter = (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 sm:flex-row dark:border-slate-700 dark:bg-slate-800/30">
      <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <span>
          Showing{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {logs.length === 0 ? 0 : startIdx + 1}–{Math.min(startIdx + pageSize, sorted.length)}
          </span>{' '}
          of{' '}
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {sorted.length}
          </span>
        </span>
        <span className="text-slate-300 dark:text-slate-600">|</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs">Rows:</span>
          <Select
            value={String(pageSize)}
            onValueChange={val => {
              setPageSize(Number(val));
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="h-7 w-[62px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={safePage <= 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="sr-only text-xs sm:not-sr-only sm:ml-1">Prev</span>
        </Button>

        <span className="px-2 text-xs text-slate-500 dark:text-slate-400">
          Page {safePage} of {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2"
          disabled={safePage >= totalPages}
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
        >
          <span className="sr-only text-xs sm:not-sr-only sm:mr-1">Next</span>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // --- Loading state ---
  if (loading) {
    if (isMobile) {
      return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="grid grid-cols-4 gap-x-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <div className="h-3 w-10 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="mx-auto h-3 w-12 rounded bg-slate-200 dark:bg-slate-700" />
            <div className="ml-auto h-3 w-8 rounded bg-slate-200 dark:bg-slate-700" />
            <div />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`skel-m-${i}`} className="grid grid-cols-4 items-center gap-x-2 border-b border-slate-100 px-3 py-3 dark:border-slate-800">
              <div>
                <div className="h-4 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="mt-1 h-3 w-10 rounded bg-slate-100 dark:bg-slate-800" />
              </div>
              <div className="mx-auto h-4 w-14 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="ml-auto h-4 w-12 rounded bg-slate-200 dark:bg-slate-700" />
              <div className="mx-auto h-7 w-7 rounded bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]" />
                <TableHead>Date & Time</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Plaza / Location</TableHead>
                <TableHead>Highway</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Amount (JMD)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SkeletonRows />
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-20 text-center dark:border-slate-700 dark:bg-slate-800/30">
        <Receipt className="mb-3 h-12 w-12 text-slate-300 dark:text-slate-600" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          No toll transactions found.
        </p>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
          Import toll data or log a toll usage to get started.
        </p>
      </div>
    );
  }

  // Phone: equal-width CSS grid — HTML tables leave a dead middle gap with short plates
  if (isMobile) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid grid-cols-4 items-center gap-x-2 border-b border-slate-200 px-3 py-2.5 dark:border-slate-700">
          <MobileSortLabel
            label="Date"
            column="date"
            activeColumn={sortCol}
            direction={sortDir}
            onSort={handleSort}
          />
          <MobileSortLabel
            label="Vehicle"
            column="vehicle"
            activeColumn={sortCol}
            direction={sortDir}
            onSort={handleSort}
            align="center"
          />
          <MobileSortLabel
            label="Amt"
            column="amount"
            activeColumn={sortCol}
            direction={sortDir}
            onSort={handleSort}
            align="right"
          />
          <span className="sr-only">Actions</span>
        </div>

        <div>
          {pageData.map(log => {
            const isFuture = parseTollDate(log.date, log.time) > new Date();
            return (
              <div
                key={log.id}
                role="button"
                tabIndex={0}
                className="grid grid-cols-4 items-center gap-x-2 border-b border-slate-100 px-3 py-3 last:border-b-0 active:bg-slate-50 dark:border-slate-800 dark:active:bg-slate-800/60"
                onClick={() => onRowClick(log)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onRowClick(log);
                  }
                }}
              >
                <div className="min-w-0">
                  <div
                    className={cn(
                      'truncate text-sm font-medium',
                      isFuture ? 'text-red-600' : 'text-slate-900 dark:text-slate-100',
                    )}
                  >
                    {fmtDate(log.date)}
                  </div>
                  {log.time && (
                    <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      {fmtTime(log.time)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 text-center text-sm text-slate-700 dark:text-slate-300">
                  <span className="block truncate">{log.vehicleName}</span>
                </div>

                <div className="min-w-0 text-right tabular-nums">
                  <span
                    className={cn(
                      'text-sm font-semibold',
                      log.isUsage
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-emerald-600 dark:text-emerald-400',
                    )}
                  >
                    {log.isUsage ? '-' : '+'}
                    {fmtJMD(log.absAmount)}
                  </span>
                </div>

                <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                  <TollLogRowActions
                    log={log}
                    onRowClick={onRowClick}
                    onEdit={onEdit}
                    onFlagDisputed={onFlagDisputed}
                    onResetForReconciliation={onResetForReconciliation}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {paginationFooter}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px] px-3">
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={() => onToggleSelectAll?.(pageData.map(l => l.id))}
                  aria-label="Select all on page"
                  disabled={!onToggleSelectAll}
                />
              </TableHead>

              <SortableHead label="Date & Time" column="date" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHead label="Vehicle" column="vehicle" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <TableHead className="whitespace-nowrap">Driver</TableHead>
              <TableHead className="whitespace-nowrap">Plaza / Location</TableHead>
              <TableHead className="whitespace-nowrap">Highway</TableHead>
              <TableHead className="whitespace-nowrap">Type</TableHead>
              <TableHead className="whitespace-nowrap">Payment</TableHead>
              <SortableHead label="Amount (JMD)" column="amount" activeColumn={sortCol} direction={sortDir} onSort={handleSort} className="text-right" />
              <SortableHead label="Status" column="status" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <TableHead className="w-12 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {pageData.map(log => {
              const isSelected = selectedIds?.has(log.id) ?? false;
              return (
                <TableRow
                  key={log.id}
                  className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                    isSelected ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                  }`}
                  onClick={() => onRowClick(log)}
                >
                  <TableCell className="px-3" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(log.id)}
                      aria-label={`Select ${log.id}`}
                      disabled={!onToggleSelect}
                    />
                  </TableCell>

                  <TableCell className="whitespace-nowrap">
                    {(() => {
                      const isFuture = parseTollDate(log.date, log.time) > new Date();
                      return (
                        <>
                          <div className={`text-sm font-medium ${isFuture ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>
                            {fmtDate(log.date)}
                          </div>
                          {log.time && (
                            <div className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                              {fmtTime(log.time)}
                            </div>
                          )}
                          {isFuture && (
                            <span className="mt-0.5 inline-block rounded bg-red-50 px-1 py-0.5 text-[10px] font-medium text-red-500 dark:bg-red-900/20">
                              Future Date
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                    {log.vehicleName}
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                    {log.driverDisplayName}
                  </TableCell>

                  <TableCell className="max-w-[200px]">
                    {log.plazaName ? (
                      <span className="block truncate text-sm text-slate-700 dark:text-slate-300">
                        {log.plazaName}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="block max-w-[140px] truncate text-sm text-slate-500 dark:text-slate-400">
                          {log.locationRaw || '—'}
                        </span>
                        <Badge variant="outline" className="shrink-0 border-slate-200 px-1 py-0 text-[10px] font-normal text-slate-400 dark:border-slate-700 dark:text-slate-500">
                          Unmatched
                        </Badge>
                      </span>
                    )}
                    <TollSourceBadge source={deriveTollSource(log)} className="mt-1" />
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {log.highway || '—'}
                  </TableCell>

                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        log.isUsage
                          ? 'border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                          : 'border-emerald-200 bg-emerald-100 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                      }
                    >
                      {log.typeLabel}
                    </Badge>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={paymentBadge(log.paymentMethodDisplay).className}>
                      {log.paymentMethodDisplay}
                    </Badge>
                  </TableCell>

                  <TableCell className="whitespace-nowrap text-right tabular-nums">
                    <span
                      className={`text-sm font-semibold ${
                        log.isUsage
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {log.isUsage ? '-' : '+'}{fmtJMD(log.absAmount)}
                    </span>
                  </TableCell>

                  <TableCell>
                    <Badge variant="outline" className={statusBadge(log.statusDisplay).className}>
                      {log.statusDisplay}
                    </Badge>
                  </TableCell>

                  <TableCell className="px-2 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end">
                      <TollLogRowActions
                        log={log}
                        onRowClick={onRowClick}
                        onEdit={onEdit}
                        onFlagDisputed={onFlagDisputed}
                        onResetForReconciliation={onResetForReconciliation}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {paginationFooter}
    </div>
  );
}
