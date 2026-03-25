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
import { format, parseISO, isValid } from 'date-fns';
import { TollLogEntry, tollLogNeedsReconciliationReset } from '../../types/tollLog';

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
    const d = parseISO(iso);
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
  return value.toLocaleString('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
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
      return { className: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700' };
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
          <TableCell className="w-[40px]"><div className="h-4 w-4 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
          <TableCell><div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded" /><div className="h-3 w-12 bg-slate-100 dark:bg-slate-800 rounded mt-1" /></TableCell>
          <TableCell><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
          <TableCell><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
          <TableCell><div className="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
          <TableCell><div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
          <TableCell><div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" /></TableCell>
          <TableCell><div className="h-5 w-12 bg-slate-200 dark:bg-slate-700 rounded-full" /></TableCell>
          <TableCell><div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded ml-auto" /></TableCell>
          <TableCell><div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" /></TableCell>
          <TableCell><div className="h-4 w-6 bg-slate-200 dark:bg-slate-700 rounded" /></TableCell>
        </TableRow>
      ))}
    </>
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
}: {
  label: string;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDir;
  onSort: (col: SortColumn) => void;
}) {
  const isActive = column === activeColumn;
  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap"
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          direction === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5 text-indigo-500" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-indigo-500" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
        )}
      </span>
    </TableHead>
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
          return dir * (new Date(a.date).getTime() - new Date(b.date).getTime());
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

  // --- Loading state ---
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
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
                <TableHead className="w-[44px]" />
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
      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
        <Receipt className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          No toll transactions found.
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Import toll data or log a toll usage to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {/* Checkbox */}
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
              <SortableHead label="Amount (JMD)" column="amount" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <SortableHead label="Status" column="status" activeColumn={sortCol} direction={sortDir} onSort={handleSort} />
              <TableHead className="w-[44px]" />
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
                  {/* Checkbox */}
                  <TableCell className="px-3" onClick={e => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleSelect?.(log.id)}
                      aria-label={`Select ${log.id}`}
                      disabled={!onToggleSelect}
                    />
                  </TableCell>

                  {/* Date & Time */}
                  <TableCell className="whitespace-nowrap">
                    {(() => {
                      const isFuture = new Date(log.date) > new Date();
                      return (
                        <>
                          <div className={`text-sm font-medium ${isFuture ? 'text-red-600' : 'text-slate-900 dark:text-slate-100'}`}>
                            {fmtDate(log.date)}
                          </div>
                          {log.time && (
                            <div className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                              {fmtTime(log.time)}
                            </div>
                          )}
                          {isFuture && (
                            <span className="text-[10px] font-medium text-red-500 bg-red-50 dark:bg-red-900/20 px-1 py-0.5 rounded mt-0.5 inline-block">
                              Future Date
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>

                  {/* Vehicle */}
                  <TableCell className="whitespace-nowrap text-sm text-slate-700 dark:text-slate-300">
                    {log.vehicleName}
                  </TableCell>

                  {/* Driver */}
                  <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                    {log.driverDisplayName}
                  </TableCell>

                  {/* Plaza / Location */}
                  <TableCell className="max-w-[200px]">
                    {log.plazaName ? (
                      <span className="text-sm text-slate-700 dark:text-slate-300 truncate block">
                        {log.plazaName}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="text-sm text-slate-500 dark:text-slate-400 truncate block max-w-[140px]">
                          {log.locationRaw || '—'}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 shrink-0">
                          Unmatched
                        </Badge>
                      </span>
                    )}
                  </TableCell>

                  {/* Highway */}
                  <TableCell className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {log.highway || '—'}
                  </TableCell>

                  {/* Type */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        log.isUsage
                          ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
                      }
                    >
                      {log.typeLabel}
                    </Badge>
                  </TableCell>

                  {/* Payment Method */}
                  <TableCell>
                    <Badge variant="outline" className={paymentBadge(log.paymentMethodDisplay).className}>
                      {log.paymentMethodDisplay}
                    </Badge>
                  </TableCell>

                  {/* Amount */}
                  <TableCell className="text-right whitespace-nowrap">
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

                  {/* Status */}
                  <TableCell>
                    <Badge variant="outline" className={statusBadge(log.statusDisplay).className}>
                      {log.statusDisplay}
                    </Badge>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="px-2" onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-4 w-4 text-slate-400" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => onRowClick(log)}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>
                        {onEdit && (
                          <DropdownMenuItem onClick={() => onEdit(log)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                        )}
                        {onFlagDisputed && (
                          <DropdownMenuItem onClick={() => onFlagDisputed(log)}>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            Flag as Disputed
                          </DropdownMenuItem>
                        )}
                        {onResetForReconciliation && tollLogNeedsReconciliationReset(log) && (
                          <DropdownMenuItem onClick={() => onResetForReconciliation(log)}>
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Send back to reconciliation
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem disabled>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in Reconciliation
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <span>
            Showing{' '}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {startIdx + 1}–{Math.min(startIdx + pageSize, sorted.length)}
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
            <span className="sr-only sm:not-sr-only sm:ml-1 text-xs">Prev</span>
          </Button>

          <span className="text-xs text-slate-500 dark:text-slate-400 px-2">
            Page {safePage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            <span className="sr-only sm:not-sr-only sm:mr-1 text-xs">Next</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}