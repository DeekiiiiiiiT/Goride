import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../ui/dialog";
import {
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Filter,
  ArrowUpRight,
  ArrowDownLeft,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  X,
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AlertTriangle,
  Database,
  CalendarDays,
  FileText,
  Clock,
  User,
  Car,
  CreditCard,
  Tag,
  Link2,
  Info,
  Copy,
  ExternalLink,
} from "lucide-react";
import { api } from "../../services/api";
import { LedgerEntry, LedgerFilterParams, PaginatedLedgerResponse, LedgerEventType } from "../../types/data";
import { format, subDays, startOfMonth, startOfWeek } from "date-fns";
import { toast } from "sonner@2.0.3";
import { cn } from "../ui/utils";

// ─── Constants ────────────────────────────────────────────────────────

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  fare_earning:       { label: 'Fare Earning',      color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  tip:                { label: 'Tip',               color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  surge_bonus:        { label: 'Surge/Bonus',       color: 'text-emerald-700', bgColor: 'bg-emerald-50 border-emerald-200' },
  fuel_expense:       { label: 'Fuel Expense',      color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200' },
  fuel_reimbursement: { label: 'Fuel Reimburse',    color: 'text-blue-700',    bgColor: 'bg-blue-50 border-blue-200' },
  toll_charge:        { label: 'Toll Charge',       color: 'text-amber-700',   bgColor: 'bg-amber-50 border-amber-200' },
  toll_refund:        { label: 'Toll Refund',       color: 'text-blue-700',    bgColor: 'bg-blue-50 border-blue-200' },
  maintenance:        { label: 'Maintenance',       color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200' },
  insurance:          { label: 'Insurance',         color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200' },
  driver_payout:      { label: 'Driver Payout',     color: 'text-purple-700',  bgColor: 'bg-purple-50 border-purple-200' },
  cash_collection:    { label: 'Cash Collection',   color: 'text-amber-700',   bgColor: 'bg-amber-50 border-amber-200' },
  platform_fee:       { label: 'Platform Fee',      color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200' },
  wallet_credit:      { label: 'Wallet Credit',     color: 'text-blue-700',    bgColor: 'bg-blue-50 border-blue-200' },
  wallet_debit:       { label: 'Wallet Debit',      color: 'text-red-700',     bgColor: 'bg-red-50 border-red-200' },
  cancelled_trip_loss:{ label: 'Cancelled Trip',    color: 'text-slate-700',   bgColor: 'bg-slate-50 border-slate-200' },
  adjustment:         { label: 'Adjustment',        color: 'text-slate-700',   bgColor: 'bg-slate-100 border-slate-300' },
  other:              { label: 'Other',             color: 'text-slate-700',   bgColor: 'bg-slate-50 border-slate-200' },
};

const PLATFORM_COLORS: Record<string, string> = {
  uber:    'bg-black text-white',
  indrive: 'bg-green-600 text-white',
  roam:    'bg-indigo-600 text-white',
};

const DATE_PRESETS = [
  { label: 'Today', getValue: () => ({ startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This Week', getValue: () => ({ startDate: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'This Month', getValue: () => ({ startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'Last 30 Days', getValue: () => ({ startDate: format(subDays(new Date(), 30), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd') }) },
  { label: 'All Time', getValue: () => ({ startDate: undefined, endDate: undefined }) },
];

// ─── Props ────────────────────────────────────────────────────────────

interface LedgerViewProps {
  /** Optional: pre-filter to a specific driver */
  driverId?: string;
  /** Optional: pre-filter to a specific vehicle */
  vehicleId?: string;
  /** Optional: compact mode hides some columns */
  compact?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────

function LedgerViewInner({ driverId, vehicleId, compact = false }: LedgerViewProps) {
  // Data state
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Filters
  const [filters, setFilters] = useState<LedgerFilterParams>(() => ({
    driverId,
    vehicleId,
  }));
  const [searchTermInput, setSearchTermInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDatePreset, setActiveDatePreset] = useState('All Time');

  // Custom date range picker state
  const [customDateOpen, setCustomDateOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Selection & actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reconciling, setReconciling] = useState<string | null>(null);
  const [bulkReconciling, setBulkReconciling] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Summary
  const [summary, setSummary] = useState<{ totalInflow: number; totalOutflow: number; netBalance: number; totalEntries: number } | null>(null);

  // Detail modal state
  const [detailEntry, setDetailEntry] = useState<LedgerEntry | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [sourceData, setSourceData] = useState<any>(null);
  const [sourceLoading, setSourceLoading] = useState(false);

  // Backfill state
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ ledgerCreated: number; tripsProcessed: number; txProcessed: number } | null>(null);
  const [backfillDismissed, setBackfillDismissed] = useState(false);
  const [refreshCounter, setRefreshCounter] = useState(0);

  // Debounced search
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearchTermInput(value);
    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchTerm(value);
      setPage(1);
    }, 400);
  }, []);

  // ─── Data fetching ────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await api.getLedgerEntries({
          ...filters,
          searchTerm: searchTerm || undefined,
          limit: pageSize,
          offset: (page - 1) * pageSize,
          sortBy: 'date',
          sortDir: 'desc',
        });
        if (!cancelled) {
          setEntries(result.data || []);
          setTotal(result.total || 0);
        }
      } catch (err) {
        console.error('[LedgerView] Fetch failed:', err);
        if (!cancelled) {
          toast.error('Failed to load ledger entries');
          setEntries([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [page, pageSize, filters, searchTerm, refreshCounter]);

  // Fetch summary (for the top stat cards — across all pages)
  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        const result = await api.getLedgerSummary({
          ...filters,
          driverId: filters.driverId,
          startDate: filters.startDate,
          endDate: filters.endDate,
          eventType: filters.eventType,
          direction: filters.direction,
          platform: filters.platform,
        });
        if (!cancelled) {
          setSummary(result.summary || null);
        }
      } catch (err) {
        console.error('[LedgerView] Summary fetch failed:', err);
        if (!cancelled) setSummary(null);
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };
    fetchSummary();
    return () => { cancelled = true; };
  }, [filters, refreshCounter]);

  // ─── Backfill handler ─────────────────────────────────────────────

  const handleBackfill = useCallback(async () => {
    setBackfillRunning(true);
    setBackfillResult(null);
    toast.info('Backfilling historical data into the ledger... This may take a minute.');
    try {
      const result = await api.runLedgerBackfill();
      const stats = result.stats;
      setBackfillResult({
        ledgerCreated: stats.ledgerCreated,
        tripsProcessed: stats.tripsProcessed,
        txProcessed: stats.txProcessed,
      });
      toast.success(`Backfill complete! Created ${stats.ledgerCreated} ledger entries from ${stats.tripsProcessed} trips and ${stats.txProcessed} transactions.`);
      // Force data refresh
      setRefreshCounter(c => c + 1);
    } catch (err: any) {
      console.error('[LedgerView] Backfill failed:', err);
      toast.error(`Backfill failed: ${err.message}`);
    } finally {
      setBackfillRunning(false);
    }
  }, []);

  // Detect if backfill is needed (very few entries with no date filter = historical data missing)
  const showBackfillBanner = useMemo(() => {
    if (backfillDismissed || backfillRunning) return false;
    if (backfillResult && backfillResult.ledgerCreated > 0) return false;
    if (loading || summaryLoading) return false;
    // Show banner when "All Time" has 5 or fewer entries — historical data likely missing
    if (!filters.startDate && !filters.endDate && !filters.eventType && !filters.direction && !filters.platform && !driverId && !vehicleId) {
      return total <= 5;
    }
    return false;
  }, [backfillDismissed, backfillRunning, backfillResult, loading, summaryLoading, filters, total, driverId, vehicleId]);

  // ─── Filter handlers ──────────────────────────────────────────────

  const updateFilter = useCallback((key: keyof LedgerFilterParams, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined }));
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const handleDatePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const { startDate, endDate } = preset.getValue();
    setFilters(prev => ({ ...prev, startDate, endDate }));
    setActiveDatePreset(preset.label);
    setPage(1);
    setSelectedIds(new Set());
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({ driverId, vehicleId });
    setSearchTermInput('');
    setSearchTerm('');
    setActiveDatePreset('All Time');
    setPage(1);
    setSelectedIds(new Set());
  }, [driverId, vehicleId]);

  const hasActiveFilters = useMemo(() => {
    return !!(filters.startDate || filters.endDate || filters.eventType || filters.direction || filters.platform || filters.isReconciled !== undefined || searchTerm);
  }, [filters, searchTerm]);

  // ─── Selection handlers ───────────────────────────────────────────

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === entries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  }, [entries, selectedIds]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ─── Reconciliation handlers ──────────────────────────────────────

  const handleReconcile = useCallback(async (id: string, reconcile: boolean) => {
    setReconciling(id);
    try {
      await api.updateLedgerEntry(id, {
        isReconciled: reconcile,
        reconciledAt: reconcile ? new Date().toISOString() : undefined,
      });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, isReconciled: reconcile, reconciledAt: reconcile ? new Date().toISOString() : undefined } : e));
      toast.success(reconcile ? 'Marked as reconciled' : 'Marked as unreconciled');
    } catch (err) {
      console.error('[LedgerView] Reconcile failed:', err);
      toast.error('Failed to update reconciliation status');
    } finally {
      setReconciling(null);
    }
  }, []);

  const handleBulkReconcile = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkReconciling(true);
    let successCount = 0;
    try {
      for (const id of selectedIds) {
        try {
          await api.updateLedgerEntry(id, {
            isReconciled: true,
            reconciledAt: new Date().toISOString(),
          });
          successCount++;
        } catch (err) {
          console.error(`[LedgerView] Bulk reconcile failed for ${id}:`, err);
        }
      }
      toast.success(`Reconciled ${successCount} of ${selectedIds.size} entries`);
      // Refresh data
      setSelectedIds(new Set());
      setPage(p => p); // force re-fetch via effect (no-op state change won't work, so we'll use a counter)
    } finally {
      setBulkReconciling(false);
    }
    // Re-fetch
    try {
      const result = await api.getLedgerEntries({
        ...filters,
        searchTerm: searchTerm || undefined,
        limit: 5000,
        offset: 0,
        sortBy: 'date',
        sortDir: 'desc',
      });
      setEntries(result.data || []);
      setTotal(result.total || 0);
    } catch { /* already have toast */ }
  }, [selectedIds, filters, searchTerm, pageSize, page]);

  // ─── Export handler ───────────────────────────────────────────────

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await api.getLedgerEntries({
        ...filters,
        searchTerm: searchTerm || undefined,
        limit: 5000,
        offset: 0,
        sortBy: 'date',
        sortDir: 'desc',
      });
      const rows = result.data || [];
      if (rows.length === 0) {
        toast.error('No entries to export');
        return;
      }
      const headers = ['Date', 'Time', 'Driver', 'Event Type', 'Category', 'Platform', 'Description', 'Gross Amount', 'Net Amount', 'Direction', 'Payment Method', 'Reconciled', 'Source Type', 'Source ID'];
      const csvRows = rows.map(e => [
        e.date,
        e.time || '',
        e.driverName || e.driverId,
        getEventLabel(e.eventType),
        e.category,
        e.platform || '',
        `"${(e.description || '').replace(/"/g, '""')}"`,
        e.grossAmount?.toFixed(2) || '0.00',
        e.netAmount?.toFixed(2) || '0.00',
        e.direction,
        e.paymentMethod || '',
        e.isReconciled ? 'Yes' : 'No',
        e.sourceType,
        e.sourceId,
      ].join(','));

      const csv = [headers.join(','), ...csvRows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roam-fleet-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} ledger entries`);
    } catch (err) {
      console.error('[LedgerView] Export failed:', err);
      toast.error('Failed to export ledger data');
    } finally {
      setExporting(false);
    }
  }, [filters, searchTerm]);

  // ─── Derived values ───────────────────────────────────────────────

  const totalPages = Math.ceil(total / pageSize);
  const startEntry = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, total);

  // ─── Helpers ──────────────────────────────────────────────────────

  function getEventLabel(eventType: string): string {
    return EVENT_TYPE_CONFIG[eventType]?.label || eventType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function getEventBadge(eventType: string): React.ReactNode {
    const config = EVENT_TYPE_CONFIG[eventType] || { label: eventType, color: 'text-slate-700', bgColor: 'bg-slate-50 border-slate-200' };
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border', config.bgColor, config.color)}>
        {config.label}
      </span>
    );
  }

  function getPlatformBadge(platform?: string): React.ReactNode {
    if (!platform) return null;
    const key = platform.toLowerCase();
    const colorClass = PLATFORM_COLORS[key] || 'bg-slate-200 text-slate-700';
    return (
      <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', colorClass)}>
        {platform}
      </span>
    );
  }

  function formatCurrency(amount: number | undefined | null): string {
    if (amount == null || isNaN(amount)) return '$0.00';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(Math.abs(amount));
  }

  function formatLedgerDate(dateStr: string): string {
    try {
      // dateStr is YYYY-MM-DD
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return format(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])), 'MMM dd, yyyy');
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Summary Cards ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Inflow</span>
            </div>
            <p className="text-xl font-bold text-emerald-700">
              {summaryLoading ? (
                <span className="inline-block w-20 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                formatCurrency(summary?.totalInflow || 0)
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-red-50">
                <TrendingDown className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Outflow</span>
            </div>
            <p className="text-xl font-bold text-red-700">
              {summaryLoading ? (
                <span className="inline-block w-20 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                formatCurrency(summary?.totalOutflow || 0)
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-indigo-50">
                <DollarSign className="h-4 w-4 text-indigo-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Net Balance</span>
            </div>
            <p className={cn("text-xl font-bold", (summary?.netBalance || 0) >= 0 ? 'text-emerald-700' : 'text-red-700')}>
              {summaryLoading ? (
                <span className="inline-block w-20 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                <>
                  {(summary?.netBalance || 0) >= 0 ? '+' : '-'}{formatCurrency(summary?.netBalance || 0)}
                </>
              )}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-slate-100">
                <BarChart3 className="h-4 w-4 text-slate-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Entries</span>
            </div>
            <p className="text-xl font-bold text-slate-800">
              {summaryLoading ? (
                <span className="inline-block w-16 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                (summary?.totalEntries || total || 0).toLocaleString()
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Backfill Banner ──────────────────────────────────────── */}
      {showBackfillBanner && (
        <Card className="border-amber-300 bg-amber-50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 mt-0.5">
                <Database className="h-5 w-5 text-amber-700" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-amber-900">Historical Data Not Yet Imported</h4>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  The ledger only contains {total} {total === 1 ? 'entry' : 'entries'}. Your existing trips and transactions need to be
                  backfilled into the new ledger system. This is a one-time operation that converts your historical data
                  into standardized ledger entries, enabling accurate date filtering and financial reporting.
                </p>
                <p className="text-xs text-amber-600 mt-1.5 italic">
                  This process is safe and non-destructive — it reads your existing data and creates new ledger records alongside it.
                  It uses built-in deduplication, so running it multiple times is harmless.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <Button
                    size="sm"
                    onClick={handleBackfill}
                    disabled={backfillRunning}
                    className="bg-amber-700 hover:bg-amber-800 text-white text-xs h-8 px-4"
                  >
                    {backfillRunning ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Backfilling...
                      </>
                    ) : (
                      <>
                        <Database className="h-3.5 w-3.5 mr-1.5" />
                        Import Historical Data
                      </>
                    )}
                  </Button>
                  <button
                    onClick={() => setBackfillDismissed(true)}
                    className="text-xs text-amber-600 hover:text-amber-800 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Backfill Result Banner ───────────────────────────────── */}
      {backfillResult && (
        <Card className="border-emerald-300 bg-emerald-50 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Backfill Complete</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Created <span className="font-bold">{backfillResult.ledgerCreated.toLocaleString()}</span> ledger entries
                  from {backfillResult.tripsProcessed.toLocaleString()} trips and {backfillResult.txProcessed.toLocaleString()} transactions.
                  All date filters and summary cards are now fully operational.
                </p>
              </div>
              <button
                onClick={() => setBackfillResult(null)}
                className="text-emerald-500 hover:text-emerald-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Filters Bar ──────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Top row: search + actions */}
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search descriptions, drivers..."
                value={searchTermInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 h-9 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={handleBulkReconcile}
                  disabled={bulkReconciling}
                >
                  {bulkReconciling ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                  Reconcile ({selectedIds.size})
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={handleExport}
                disabled={exporting || total === 0}
              >
                {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                Export CSV
              </Button>
            </div>
          </div>

          {/* Date presets row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-slate-400 mr-1" />
            {DATE_PRESETS.map(preset => (
              <button
                key={preset.label}
                onClick={() => handleDatePreset(preset)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  activeDatePreset === preset.label
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                )}
              >
                {preset.label}
              </button>
            ))}

            {/* Custom date range picker */}
            <Popover open={customDateOpen} onOpenChange={setCustomDateOpen}>
              <PopoverTrigger asChild>
                <button
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                    activeDatePreset === 'Custom'
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                  )}
                >
                  <CalendarDays className="h-3 w-3" />
                  {activeDatePreset === 'Custom' && filters.startDate && filters.endDate
                    ? `${formatLedgerDate(filters.startDate)} – ${formatLedgerDate(filters.endDate)}`
                    : activeDatePreset === 'Custom' && filters.startDate
                    ? `From ${formatLedgerDate(filters.startDate)}`
                    : activeDatePreset === 'Custom' && filters.endDate
                    ? `Until ${formatLedgerDate(filters.endDate)}`
                    : 'Custom'}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0" sideOffset={6}>
                <div className="p-4 space-y-4 min-w-[280px]">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <CalendarDays className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-sm font-semibold text-slate-800">Custom Date Range</h4>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
                      <input
                        type="date"
                        value={customStartDate}
                        max={customEndDate || format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
                      <input
                        type="date"
                        value={customEndDate}
                        min={customStartDate || undefined}
                        max={format(new Date(), 'yyyy-MM-dd')}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="w-full h-9 px-3 rounded-md border border-slate-200 bg-slate-50 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Quick single-day shortcut */}
                  <p className="text-[10px] text-slate-400 italic">
                    Tip: Set both dates to the same day to view a single day.
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1 h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                      disabled={!customStartDate && !customEndDate}
                      onClick={() => {
                        setFilters(prev => ({
                          ...prev,
                          startDate: customStartDate || undefined,
                          endDate: customEndDate || undefined,
                        }));
                        setActiveDatePreset('Custom');
                        setPage(1);
                        setSelectedIds(new Set());
                        setCustomDateOpen(false);
                      }}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        setCustomStartDate('');
                        setCustomEndDate('');
                      }}
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Event type filter */}
            <Select
              value={filters.eventType || '__all__'}
              onValueChange={(val) => updateFilter('eventType', val === '__all__' ? undefined : val as LedgerEventType)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[120px] text-xs bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {Object.entries(EVENT_TYPE_CONFIG).map(([key, cfg]) => (
                  <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Direction filter */}
            <Select
              value={filters.direction || '__all__'}
              onValueChange={(val) => updateFilter('direction', val === '__all__' ? undefined : val)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[100px] text-xs bg-slate-50 border-slate-200">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All</SelectItem>
                <SelectItem value="inflow">Inflows</SelectItem>
                <SelectItem value="outflow">Outflows</SelectItem>
              </SelectContent>
            </Select>

            {/* Platform filter */}
            <Select
              value={filters.platform || '__all__'}
              onValueChange={(val) => updateFilter('platform', val === '__all__' ? undefined : val)}
            >
              <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Platforms</SelectItem>
                <SelectItem value="Uber">Uber</SelectItem>
                <SelectItem value="InDrive">InDrive</SelectItem>
                <SelectItem value="Roam">Roam</SelectItem>
              </SelectContent>
            </Select>

            {/* Reconciliation filter */}
            <Select
              value={filters.isReconciled === undefined ? '__all__' : filters.isReconciled ? 'true' : 'false'}
              onValueChange={(val) => updateFilter('isReconciled', val === '__all__' ? undefined : val === 'true')}
            >
              <SelectTrigger className="h-7 w-auto min-w-[110px] text-xs bg-slate-50 border-slate-200">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Status</SelectItem>
                <SelectItem value="true">Reconciled</SelectItem>
                <SelectItem value="false">Unreconciled</SelectItem>
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Table ────────────────────────────────────────────────── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50/80">
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={entries.length > 0 && selectedIds.size === entries.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Date</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Type</TableHead>
                {!compact && (
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</TableHead>
                )}
                {!compact && (
                  <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Platform</TableHead>
                )}
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider text-right">Amount</TableHead>
                <TableHead className="text-xs font-semibold text-slate-600 uppercase tracking-wider text-center">Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                // Loading skeleton rows
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    <TableCell className="px-3"><div className="w-4 h-4 bg-slate-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="w-24 h-4 bg-slate-100 rounded animate-pulse" /></TableCell>
                    <TableCell><div className="w-20 h-5 bg-slate-100 rounded-full animate-pulse" /></TableCell>
                    {!compact && <TableCell><div className="w-40 h-4 bg-slate-100 rounded animate-pulse" /></TableCell>}
                    {!compact && <TableCell><div className="w-16 h-5 bg-slate-100 rounded animate-pulse" /></TableCell>}
                    <TableCell><div className="w-20 h-4 bg-slate-100 rounded animate-pulse ml-auto" /></TableCell>
                    <TableCell><div className="w-16 h-5 bg-slate-100 rounded-full animate-pulse mx-auto" /></TableCell>
                    <TableCell />
                  </TableRow>
                ))
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={compact ? 6 : 8} className="text-center py-12 text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <BarChart3 className="h-8 w-8 text-slate-300" />
                      <p className="font-medium">No ledger entries found</p>
                      <p className="text-xs text-slate-400">
                        {hasActiveFilters ? 'Try adjusting your filters' : 'Ledger entries will appear here after importing trips or logging transactions'}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const isInflow = entry.direction === 'inflow';
                  const isSelected = selectedIds.has(entry.id);
                  const isReconcilingThis = reconciling === entry.id;

                  return (
                    <TableRow
                      key={entry.id}
                      className={cn(
                        'transition-colors',
                        isSelected && 'bg-indigo-50/50',
                        isReconcilingThis && 'opacity-60'
                      )}
                    >
                      {/* Checkbox */}
                      <TableCell className="px-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(entry.id)}
                        />
                      </TableCell>

                      {/* Date / Time */}
                      <TableCell className="py-2">
                        <div className="text-sm font-medium text-slate-800">{formatLedgerDate(entry.date)}</div>
                        {entry.time && (
                          <div className="text-xs text-slate-400 mt-0.5">{entry.time}</div>
                        )}
                      </TableCell>

                      {/* Event Type Badge */}
                      <TableCell className="py-2">
                        {getEventBadge(entry.eventType)}
                      </TableCell>

                      {/* Description */}
                      {!compact && (
                        <TableCell className="py-2 max-w-[280px]">
                          <div className="text-sm text-slate-700 truncate">{entry.description}</div>
                          {entry.driverName && (
                            <div className="text-xs text-slate-400 mt-0.5 truncate">{entry.driverName}</div>
                          )}
                        </TableCell>
                      )}

                      {/* Platform */}
                      {!compact && (
                        <TableCell className="py-2">
                          {getPlatformBadge(entry.platform)}
                        </TableCell>
                      )}

                      {/* Amount */}
                      <TableCell className="py-2 text-right">
                        <div className={cn(
                          'text-sm font-semibold tabular-nums',
                          isInflow ? 'text-emerald-700' : 'text-red-600'
                        )}>
                          <span className="inline-flex items-center gap-0.5">
                            {isInflow ? (
                              <ArrowUpRight className="h-3 w-3 flex-shrink-0" />
                            ) : (
                              <ArrowDownLeft className="h-3 w-3 flex-shrink-0" />
                            )}
                            {isInflow ? '+' : '-'}{formatCurrency(entry.netAmount)}
                          </span>
                        </div>
                        {entry.grossAmount !== undefined && entry.grossAmount !== entry.netAmount && Math.abs(entry.grossAmount) > 0 && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            Gross: {formatCurrency(entry.grossAmount)}
                          </div>
                        )}
                      </TableCell>

                      {/* Reconciliation Status */}
                      <TableCell className="py-2 text-center">
                        {isReconcilingThis ? (
                          <Loader2 className="h-4 w-4 animate-spin mx-auto text-slate-400" />
                        ) : entry.isReconciled ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Reconciled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                            Pending
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="px-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs">Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setDetailEntry(entry);
                                setDetailDialogOpen(true);
                              }}
                              className="text-xs"
                            >
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleReconcile(entry.id, !entry.isReconciled)}
                              className="text-xs"
                            >
                              {entry.isReconciled ? 'Mark Unreconciled' : 'Mark Reconciled'}
                            </DropdownMenuItem>
                            {entry.sourceId && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setDetailEntry(entry);
                                  setDetailDialogOpen(true);
                                }}
                                className="text-xs"
                              >
                                View Source ({entry.sourceType})
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ── Pagination ───────────────────────────────────────────── */}
        {total > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Showing {startEntry.toLocaleString()}{'-'}{endEntry.toLocaleString()} of {total.toLocaleString()} entries
            </div>
            <div className="flex items-center gap-2">
              {/* Page size selector */}
              <Select
                value={String(pageSize)}
                onValueChange={(val) => {
                  setPageSize(Number(val));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-7 w-auto text-xs bg-white border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>

              {/* Page navigation */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page <= 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs text-slate-600 px-2 min-w-[60px] text-center">
                  Page {page} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── Detail Dialog ──────────────────────────────────────────── */}
      <Dialog open={detailDialogOpen} onOpenChange={(open) => { setDetailDialogOpen(open); if (!open) setDetailEntry(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailEntry && (() => {
            const e = detailEntry;
            const isInflow = e.direction === 'inflow';
            const DetailRow = ({ icon: Icon, label, value, mono, copyable }: { icon: any; label: string; value: React.ReactNode; mono?: boolean; copyable?: string }) => (
              <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
                <div className="p-1.5 rounded-md bg-slate-50 mt-0.5 flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">{label}</p>
                  <div className={cn("text-sm text-slate-800 mt-0.5 break-words", mono && "font-mono text-xs")}>
                    {value || <span className="text-slate-300 italic">Not available</span>}
                  </div>
                </div>
                {copyable && (
                  <button
                    onClick={() => { navigator.clipboard.writeText(copyable); toast.success('Copied to clipboard'); }}
                    className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 mt-1 flex-shrink-0"
                    title="Copy"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );

            return (
              <>
                <DialogHeader className="pb-0">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl",
                      isInflow ? "bg-emerald-50" : "bg-red-50"
                    )}>
                      {isInflow
                        ? <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                        : <ArrowDownLeft className="h-5 w-5 text-red-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-base font-semibold text-slate-900">
                        {getEventLabel(e.eventType)}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        {e.description}
                      </DialogDescription>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        "text-xl font-bold tabular-nums",
                        isInflow ? "text-emerald-700" : "text-red-600"
                      )}>
                        {isInflow ? '+' : '-'}{formatCurrency(e.netAmount)}
                      </p>
                      {e.grossAmount !== undefined && e.grossAmount !== e.netAmount && Math.abs(e.grossAmount) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">Gross: {formatCurrency(e.grossAmount)}</p>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                {/* Type + Status badges row */}
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-3 border-t border-slate-100">
                  {getEventBadge(e.eventType)}
                  {getPlatformBadge(e.platform)}
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                    isInflow
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  )}>
                    {isInflow ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                    {e.direction === 'inflow' ? 'Inflow' : 'Outflow'}
                  </span>
                  {e.isReconciled ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="h-3 w-3" />
                      Reconciled
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-50 text-slate-500 border border-slate-200">
                      Pending
                    </span>
                  )}
                </div>

                {/* Detail rows */}
                <div className="mt-4 rounded-lg border border-slate-200 bg-white overflow-hidden">
                  <div className="px-4">
                    <DetailRow icon={CalendarDays} label="Date" value={`${formatLedgerDate(e.date)}${e.time ? ` at ${e.time}` : ''}`} />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={User}
                      label="Driver"
                      value={
                        <div>
                          <span className="font-medium">{e.driverName || 'Unknown Driver'}</span>
                          {e.driverId && <span className="ml-2 text-[11px] text-slate-400 font-mono">{e.driverId.substring(0, 12)}...</span>}
                        </div>
                      }
                      copyable={e.driverId}
                    />
                  </div>
                  {(e.vehicleId || e.vehiclePlate) && (
                    <div className="px-4">
                      <DetailRow
                        icon={Car}
                        label="Vehicle"
                        value={
                          <div>
                            {e.vehiclePlate && <span className="font-medium">{e.vehiclePlate}</span>}
                            {e.vehicleId && <span className={cn("text-[11px] text-slate-400 font-mono", e.vehiclePlate && "ml-2")}>{e.vehicleId.substring(0, 12)}...</span>}
                          </div>
                        }
                      />
                    </div>
                  )}
                  <div className="px-4">
                    <DetailRow icon={Tag} label="Category" value={e.category} />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={DollarSign}
                      label="Financial Details"
                      value={
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Gross Amount</span>
                            <p className="font-semibold tabular-nums">{formatCurrency(e.grossAmount)}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Net Amount</span>
                            <p className={cn("font-semibold tabular-nums", isInflow ? "text-emerald-700" : "text-red-600")}>{isInflow ? '+' : '-'}{formatCurrency(e.netAmount)}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Currency</span>
                            <p>{e.currency || 'USD'}</p>
                          </div>
                          {e.paymentMethod && (
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase">Payment Method</span>
                              <p>{e.paymentMethod}</p>
                            </div>
                          )}
                        </div>
                      }
                    />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={Link2}
                      label="Source Record"
                      value={
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">{e.sourceType}</span>
                            <span className="font-mono text-xs text-slate-600">{e.sourceId}</span>
                          </div>
                          {e.batchId && <p className="text-[11px] text-slate-400 mt-1">Batch: {e.batchName || e.batchId}</p>}
                        </div>
                      }
                      copyable={e.sourceId}
                    />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={CheckCircle2}
                      label="Reconciliation"
                      value={
                        <div className="flex items-center gap-2">
                          {e.isReconciled ? <span className="text-emerald-700 font-medium">Reconciled</span> : <span className="text-amber-600 font-medium">Pending</span>}
                          {e.reconciledAt && <span className="text-[11px] text-slate-400">on {formatLedgerDate(e.reconciledAt.split('T')[0])}</span>}
                        </div>
                      }
                    />
                  </div>
                  <div className="px-4">
                    <DetailRow icon={Clock} label="Created" value={e.createdAt ? format(new Date(e.createdAt), 'MMM dd, yyyy h:mm a') : 'Unknown'} />
                  </div>
                  <div className="px-4">
                    <DetailRow icon={FileText} label="Ledger Entry ID" value={<span className="font-mono text-xs">{e.id}</span>} mono copyable={e.id} />
                  </div>
                  {e.metadata && Object.keys(e.metadata).length > 0 && (
                    <div className="px-4">
                      <DetailRow
                        icon={Info}
                        label="Additional Metadata"
                        value={
                          <div className="bg-slate-50 rounded-md p-2 mt-1 max-h-32 overflow-y-auto">
                            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono">{JSON.stringify(e.metadata, null, 2)}</pre>
                          </div>
                        }
                      />
                    </div>
                  )}
                </div>

                {/* Action buttons at bottom */}
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      handleReconcile(e.id, !e.isReconciled);
                      setDetailEntry({ ...e, isReconciled: !e.isReconciled });
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    {e.isReconciled ? 'Mark Unreconciled' : 'Mark Reconciled'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(e, null, 2));
                      toast.success('Full entry data copied to clipboard');
                    }}
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" />
                    Copy JSON
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setDetailDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Error Boundary (Phase 11) ────────────────────────────────────────

class LedgerErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  state = { hasError: false, errorMsg: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorMsg: String(error) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[LedgerView] Error boundary caught:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center text-slate-500 border border-dashed rounded-lg">
          <p className="font-medium mb-1">Something went wrong loading the ledger.</p>
          <p className="text-xs">Please refresh the page. If the issue persists, check the console for details.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function LedgerView(props: LedgerViewProps) {
  return (
    <LedgerErrorBoundary>
      <LedgerViewInner {...props} />
    </LedgerErrorBoundary>
  );
}