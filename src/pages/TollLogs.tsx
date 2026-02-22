import React, { useState, useMemo, useCallback } from 'react';
import { Receipt, RefreshCw, Loader2, AlertTriangle, CheckCircle2, ShieldAlert, X, Download } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { useTollLogs } from '../hooks/useTollLogs';
import { TollLogStats } from '../components/toll/TollLogStats';
import { TollLogTable } from '../components/toll/TollLogTable';
import { TollLogFilters } from '../components/toll/TollLogFilters';
import { TollLogDetailPanel } from '../components/toll/TollLogDetailPanel';
import { TollLogEntry, TollLogFiltersState, DEFAULT_TOLL_LOG_FILTERS, TOLL_LOG_CSV_COLUMNS } from '../types/tollLog';
import { isWithinInterval, parseISO, startOfDay, endOfDay, format } from 'date-fns';
import { api } from '../services/api';
import { toast } from 'sonner@2.0.3';
import { jsonToCsv, downloadBlob } from '../utils/csv-helper';

// ---------------------------------------------------------------------------
// Bulk action types
// ---------------------------------------------------------------------------

type BulkAction = 'flag' | 'claimable' | 'completed';

const BULK_ACTION_CONFIG: Record<BulkAction, {
  label: string;
  status: string;
  dialogTitle: string;
  dialogVerb: string;
  toastVerb: string;
  icon: React.ReactNode;
  buttonClass: string;
  actionClass: string;
}> = {
  flag: {
    label: 'Flag as Disputed',
    status: 'Flagged',
    dialogTitle: 'Flag Transactions as Disputed',
    dialogVerb: 'flag',
    toastVerb: 'flagged as disputed',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    buttonClass: 'text-amber-700 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/20',
    actionClass: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  claimable: {
    label: 'Mark Claimable',
    status: 'Flagged', // Uses Flagged status + metadata marker for claims pipeline
    dialogTitle: 'Mark Transactions as Claimable',
    dialogVerb: 'mark as claimable',
    toastVerb: 'marked as claimable',
    icon: <ShieldAlert className="h-3.5 w-3.5" />,
    buttonClass: 'text-blue-700 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-900/20',
    actionClass: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
  completed: {
    label: 'Mark Completed',
    status: 'Completed',
    dialogTitle: 'Mark Transactions as Completed',
    dialogVerb: 'mark as completed',
    toastVerb: 'marked as completed',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    buttonClass: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-900/20',
    actionClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtJMD(value: number): string {
  return value.toLocaleString('en-JM', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function TollLogsPage() {
  const { logs, loading, refresh, vehicles, drivers, plazas } = useTollLogs();
  const [selectedLog, setSelectedLog] = useState<TollLogEntry | null>(null);
  const [filters, setFilters] = useState<TollLogFiltersState>(DEFAULT_TOLL_LOG_FILTERS);

  // --- Bulk selection state ---
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  // --- Derive a clean driver option list for the filter dropdown ---
  const driverOptions = useMemo(() => {
    return (drivers || [])
      .filter((d: any) => d.id && d.name)
      .map((d: any) => ({ id: d.id, name: d.name }));
  }, [drivers]);

  // --- Apply filters ---
  const filteredLogs = useMemo(() => {
    let result = logs;

    // 1. Free-text search
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(l =>
        (l.plazaName && l.plazaName.toLowerCase().includes(q)) ||
        l.description.toLowerCase().includes(q) ||
        (l.referenceNumber && l.referenceNumber.toLowerCase().includes(q)) ||
        l.vehicleName.toLowerCase().includes(q) ||
        l.driverDisplayName.toLowerCase().includes(q) ||
        (l.locationRaw && l.locationRaw.toLowerCase().includes(q)) ||
        (l.tollTagId && l.tollTagId.toLowerCase().includes(q))
      );
    }

    // 2. Date range
    if (filters.dateRange?.from) {
      const from = startOfDay(filters.dateRange.from);
      const to = filters.dateRange.to
        ? endOfDay(filters.dateRange.to)
        : endOfDay(filters.dateRange.from);
      result = result.filter(l => {
        try {
          const d = parseISO(l.date);
          return isWithinInterval(d, { start: from, end: to });
        } catch {
          return false;
        }
      });
    }

    // 3. Vehicle
    if (filters.vehicleId !== 'all') {
      result = result.filter(l => l.vehicleId === filters.vehicleId);
    }

    // 4. Driver
    if (filters.driverId !== 'all') {
      result = result.filter(l => l.driverId === filters.driverId);
    }

    // 5. Plaza
    if (filters.plazaId !== 'all') {
      result = result.filter(l => l.plazaId === filters.plazaId);
    }

    // 6. Highway
    if (filters.highway !== 'all') {
      result = result.filter(l => l.highway === filters.highway);
    }

    // 7. Payment method
    if (filters.paymentMethod !== 'all') {
      result = result.filter(l => l.paymentMethodDisplay === filters.paymentMethod);
    }

    // 8. Status
    if (filters.status !== 'all') {
      result = result.filter(l => l.statusDisplay === filters.status);
    }

    // 9. Type
    if (filters.type !== 'all') {
      if (filters.type === 'usage') {
        result = result.filter(l => l.isUsage);
      } else {
        result = result.filter(l => !l.isUsage);
      }
    }

    return result;
  }, [logs, filters]);

  // --- Selection handlers ---
  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback((pageIds: string[]) => {
    setSelectedIds(prev => {
      const allSelected = pageIds.every(id => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        // Deselect all on current page
        pageIds.forEach(id => next.delete(id));
      } else {
        // Select all on current page
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // --- Bulk action helpers ---
  const selectedLogs = useMemo(() => {
    return filteredLogs.filter(l => selectedIds.has(l.id));
  }, [filteredLogs, selectedIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedLogs.reduce((sum, l) => sum + l.absAmount, 0);
  }, [selectedLogs]);

  const openBulkDialog = (action: BulkAction) => {
    setBulkAction(action);
    setBulkDialogOpen(true);
  };

  const executeBulkAction = async () => {
    if (!bulkAction) return;

    const config = BULK_ACTION_CONFIG[bulkAction];
    setBulkProcessing(true);

    let succeeded = 0;
    let failed = 0;
    const failures: string[] = [];

    for (const log of selectedLogs) {
      try {
        const updatedTx: any = {
          ...log._raw,
          status: config.status,
        };
        // For "Mark Claimable", add a metadata flag so the Claims pipeline can pick it up
        if (bulkAction === 'claimable') {
          updatedTx.metadata = {
            ...(updatedTx.metadata || {}),
            claimable: true,
            claimableMarkedAt: new Date().toISOString(),
          };
        }
        await api.saveTransaction(updatedTx);
        succeeded++;
      } catch (err) {
        failed++;
        failures.push(log.referenceNumber || log.id.slice(0, 8));
        console.error(`[TollLogs] Bulk update failed for ${log.id}:`, err);
      }
    }

    setBulkProcessing(false);
    setBulkDialogOpen(false);
    setBulkAction(null);
    setSelectedIds(new Set());

    if (failed === 0) {
      toast.success(`${succeeded} transaction${succeeded === 1 ? '' : 's'} ${config.toastVerb}.`);
    } else if (succeeded > 0) {
      toast.warning(
        `${succeeded} updated, ${failed} failed. Failed: ${failures.join(', ')}`
      );
    } else {
      toast.error(`All ${failed} updates failed. Please try again.`);
    }

    // Refresh data to reflect new statuses
    refresh();
  };

  // --- Other handlers ---
  const handleRowClick = (log: TollLogEntry) => {
    setSelectedLog(log);
  };

  const handleFlagDisputed = (log: TollLogEntry) => {
    // Single-row flag — reuse the bulk machinery
    setSelectedIds(new Set([log.id]));
    openBulkDialog('flag');
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_TOLL_LOG_FILTERS);
  };

  const actionConfig = bulkAction ? BULK_ACTION_CONFIG[bulkAction] : null;

  const handleExportCsv = () => {
    if (filteredLogs.length === 0) {
      toast.info('No transactions to export with current filters.');
      return;
    }

    const csvContent = jsonToCsv(filteredLogs, TOLL_LOG_CSV_COLUMNS);

    // Build filename — include date range if a filter is active
    let filename: string;
    if (filters.dateRange?.from) {
      const fromStr = format(filters.dateRange.from, 'yyyy-MM-dd');
      const toStr = filters.dateRange.to
        ? format(filters.dateRange.to, 'yyyy-MM-dd')
        : fromStr;
      filename = `toll-logs-${fromStr}-to-${toStr}.csv`;
    } else {
      filename = `toll-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    }

    downloadBlob(csvContent, filename);
    toast.success(`Exported ${filteredLogs.length} toll transaction${filteredLogs.length === 1 ? '' : 's'} to CSV.`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
            <Receipt className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Toll Logs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Complete ledger of all toll transactions across your fleet.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={loading}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Stat Chips — driven by filtered data */}
      {!loading && <TollLogStats logs={filteredLogs} />}

      {/* Filters */}
      {!loading && (
        <TollLogFilters
          filters={filters}
          onFiltersChange={setFilters}
          vehicles={vehicles}
          drivers={driverOptions}
          plazas={plazas}
          onClearAll={handleClearFilters}
        />
      )}

      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-900/20 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Badge className="bg-indigo-600 text-white text-xs px-2 py-0.5">
              {selectedIds.size}
            </Badge>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              selected
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              ({fmtJMD(selectedTotalAmount)} total)
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${BULK_ACTION_CONFIG.flag.buttonClass}`}
              onClick={() => openBulkDialog('flag')}
            >
              {BULK_ACTION_CONFIG.flag.icon}
              Flag Disputed
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${BULK_ACTION_CONFIG.claimable.buttonClass}`}
              onClick={() => openBulkDialog('claimable')}
            >
              {BULK_ACTION_CONFIG.claimable.icon}
              Mark Claimable
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`h-7 gap-1.5 text-xs ${BULK_ACTION_CONFIG.completed.buttonClass}`}
              onClick={() => openBulkDialog('completed')}
            >
              {BULK_ACTION_CONFIG.completed.icon}
              Mark Completed
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-slate-500 hover:text-slate-700"
              onClick={handleClearSelection}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Main Transaction Table — driven by filtered data */}
      <TollLogTable
        logs={filteredLogs}
        loading={loading}
        onRowClick={handleRowClick}
        onFlagDisputed={handleFlagDisputed}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleSelectAll={handleToggleSelectAll}
      />

      {/* Detail Side Panel */}
      <TollLogDetailPanel
        log={selectedLog}
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        onFlagDisputed={handleFlagDisputed}
      />

      {/* Bulk Action Confirmation Dialog */}
      <AlertDialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {actionConfig?.dialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  You are about to {actionConfig?.dialogVerb}{' '}
                  <span className="font-semibold text-slate-900 dark:text-slate-100">
                    {selectedIds.size} transaction{selectedIds.size === 1 ? '' : 's'}
                  </span>
                  . This action will update their status.
                </p>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-3 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Transactions</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {selectedIds.size}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Total amount</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {fmtJMD(selectedTotalAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">New status</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {actionConfig?.status}
                    </Badge>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkProcessing}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className={actionConfig?.actionClass}
              disabled={bulkProcessing}
              onClick={(e) => {
                e.preventDefault(); // Prevent auto-close; we close after processing
                executeBulkAction();
              }}
            >
              {bulkProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Processing…
                </>
              ) : (
                <>Confirm</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}