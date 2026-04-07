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

// ─── Detail Dialog Helper Components ─────────────────────────────────
// FIX (Phase 2): Extracted from IIFE to prevent recreation on every render

interface DetailRowProps {
  icon: any;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copyable?: string;
}

function DetailRow({ icon: Icon, label, value, mono, copyable }: DetailRowProps) {
  return (
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
}

// ─── Component ────────────────────────────────────────────────────────

function LedgerViewInner({ driverId, vehicleId, compact = false }: LedgerViewProps) {
  // Data state
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);

  // Performance monitoring (Phase 5): Track render cycles to catch future regressions
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    if (renderCount.current > 50) {
      console.warn('[LedgerView] High render count detected:', renderCount.current);
    }
  });

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

  const [sparseLedgerBannerDismissed, setSparseLedgerBannerDismissed] = useState(false);
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

  /** Local strings for amount range; committed to `filters` on blur or Enter. */
  const [amountMinStr, setAmountMinStr] = useState('');
  const [amountMaxStr, setAmountMaxStr] = useState('');

  const parseAmountInput = useCallback((raw: string): number | undefined => {
    const t = raw.trim().replace(/,/g, '');
    if (!t) return undefined;
    const n = parseFloat(t);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }, []);

  const applyAmountRangeToFilters = useCallback(() => {
    let minV = parseAmountInput(amountMinStr);
    let maxV = parseAmountInput(amountMaxStr);
    if (minV !== undefined && maxV !== undefined && minV > maxV) {
      const t = minV;
      minV = maxV;
      maxV = t;
      setAmountMinStr(String(minV));
      setAmountMaxStr(String(maxV));
    }
    setFilters((prev) => {
      if (prev.minAmount === minV && prev.maxAmount === maxV) return prev;
      return { ...prev, minAmount: minV, maxAmount: maxV };
    });
    setPage(1);
    setSelectedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, [amountMinStr, amountMaxStr, parseAmountInput]);

  // ─── Data fetching ────────────────────────────────────────────────

  // Memoize filter string to prevent infinite re-renders from object reference changes
  const filterKey = useMemo(() => {
    return JSON.stringify(filters);
  }, [
    filters.driverId,
    filters.vehicleId,
    filters.startDate,
    filters.endDate,
    filters.eventType,
    filters.direction,
    filters.platform,
    filters.isReconciled,
    filters.batchId,
    filters.sourceType,
    filters.driverIds,
    filters.eventTypes,
    filters.minAmount,
    filters.maxAmount,
  ]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      const startTime = performance.now();
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
        const duration = performance.now() - startTime;
        console.log(`[LedgerView] Data fetch completed in ${duration.toFixed(0)}ms, ${result.data?.length || 0} entries`);
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
  }, [page, pageSize, filterKey, searchTerm, refreshCounter]);

  // Fetch summary (for the top stat cards — across all pages)
  useEffect(() => {
    let cancelled = false;
    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        const result = await api.getLedgerSummary({
          ...filters,
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
  }, [filterKey, refreshCounter]);

  /** Few visible rows: often filters, date range, or genuinely sparse canonical history (use Imports — legacy mass backfill is retired). */
  const showSparseLedgerBanner = useMemo(() => {
    if (sparseLedgerBannerDismissed) return false;
    if (loading || summaryLoading) return false;
    if (!filters.startDate && !filters.endDate && !filters.eventType && !filters.direction && !filters.platform && !driverId && !vehicleId) {
      return total <= 5;
    }
    return false;
  }, [sparseLedgerBannerDismissed, loading, summaryLoading, filters.startDate, filters.endDate, filters.eventType, filters.direction, filters.platform, total, driverId, vehicleId]);

  // ─── Filter handlers ──────────────────────────────────────────────

  const updateFilter = useCallback((key: keyof LedgerFilterParams, value: any) => {
    const normalizedValue = value || undefined;
    setFilters(prev => {
      if (prev[key] === normalizedValue) return prev;
      return { ...prev, [key]: normalizedValue };
    });
    setPage(1);
    setSelectedIds(prev => prev.size === 0 ? prev : new Set());
  }, []);

  const handleDatePreset = useCallback((preset: typeof DATE_PRESETS[number]) => {
    const { startDate, endDate } = preset.getValue();
    setFilters(prev => ({ ...prev, startDate, endDate }));
    setActiveDatePreset(preset.label);
    setPage(1);
    setSelectedIds(prev => prev.size === 0 ? prev : new Set());
  }, []);

  const clearAllFilters = useCallback(() => {
    setFilters({ driverId, vehicleId });
    setSearchTermInput('');
    setSearchTerm('');
    setAmountMinStr('');
    setAmountMaxStr('');
    setActiveDatePreset('All Time');
    setPage(1);
    setSelectedIds(prev => prev.size === 0 ? prev : new Set());
  }, [driverId, vehicleId]);

  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.startDate ||
      filters.endDate ||
      filters.eventType ||
      filters.direction ||
      filters.platform ||
      filters.isReconciled !== undefined ||
      filters.minAmount !== undefined ||
      filters.maxAmount !== undefined ||
      searchTerm
    );
  }, [filterKey, searchTerm, filters.minAmount, filters.maxAmount]);

  // ─── Selection handlers ───────────────────────────────────────────

  // FIX (Phase 1): Removed entryIds memoization to prevent infinite re-render loop
  // Rationale: entryIds depended on entries array reference which changed on every
  // fetch, causing cascade of callback recreations that led to browser crashes.
  // Solution: Calculate IDs inside setState with stable primitive dependency (entries.length).

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(prev => {
      // Compute IDs inside setState - doesn't cause re-renders since it's inside the updater
      const currentEntryIds = entries.map(e => e.id);
      if (prev.size === entries.length && currentEntryIds.every(id => prev.has(id))) {
        return new Set();
      } else {
        return new Set(currentEntryIds);
      }
    });
  }, [entries.length]); // Stable dependency: only re-create when entry count changes

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
  }, [selectedIds, filterKey, searchTerm, pageSize, page]);

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
  }, [filterKey, filters, searchTerm]);

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
        <Card
          className={cn(
            "shadow-sm cursor-pointer transition-all hover:shadow-md",
            filters.direction === 'inflow'
              ? 'border-emerald-400 ring-2 ring-emerald-200 bg-emerald-50/30'
              : 'border-slate-200 hover:border-emerald-300'
          )}
          onClick={() => {
            const newDir = filters.direction === 'inflow' ? undefined : 'inflow';
            setFilters(prev => ({ ...prev, direction: newDir as any }));
            setPage(1);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-emerald-50">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Inflow</span>
              {filters.direction === 'inflow' && (
                <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full">FILTERED</span>
              )}
            </div>
            <p className="text-xl font-bold text-emerald-700">
              {summaryLoading ? (
                <span className="inline-block w-20 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                formatCurrency(summary?.totalInflow || 0)
              )}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {filters.direction === 'inflow' ? 'Click to show all' : 'Click to filter inflow only'}
            </p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "shadow-sm cursor-pointer transition-all hover:shadow-md",
            filters.direction === 'outflow'
              ? 'border-red-400 ring-2 ring-red-200 bg-red-50/30'
              : 'border-slate-200 hover:border-red-300'
          )}
          onClick={() => {
            const newDir = filters.direction === 'outflow' ? undefined : 'outflow';
            setFilters(prev => ({ ...prev, direction: newDir as any }));
            setPage(1);
          }}
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-md bg-red-50">
                <TrendingDown className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Outflow</span>
              {filters.direction === 'outflow' && (
                <span className="ml-auto text-[10px] font-semibold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-full">FILTERED</span>
              )}
            </div>
            <p className="text-xl font-bold text-red-700">
              {summaryLoading ? (
                <span className="inline-block w-20 h-6 bg-slate-100 rounded animate-pulse" />
              ) : (
                formatCurrency(summary?.totalOutflow || 0)
              )}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {filters.direction === 'outflow' ? 'Click to show all' : 'Click to filter outflow only'}
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

      {/* ── Sparse ledger hint (no legacy backfill CTA) ───────────── */}
      {showSparseLedgerBanner && (
        <Card className="border-slate-200 bg-slate-50/80 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-white border border-slate-200 mt-0.5">
                <Info className="h-5 w-5 text-slate-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900">Only a few ledger rows match</h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  With &quot;All time&quot; and no extra filters, this list shows {total} {total === 1 ? 'entry' : 'entries'}. Narrow filters
                  or a short date range can hide most events — try clearing filters or widening the range. To load historical money events from
                  files, use <span className="font-medium">Imports</span> (canonical append). Legacy mass backfill from this screen is retired.
                </p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setSparseLedgerBannerDismissed(true)}
                    className="text-xs text-slate-600 hover:text-slate-900 underline"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
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
                placeholder="Search descriptions, drivers…"
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

          {/* Amount range (|net amount| on ledger rows) */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3 pt-1 border-t border-slate-100">
            <span className="text-xs font-medium text-slate-500 sm:mr-1 sm:pb-2">Amount</span>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-0.5">
                <label htmlFor="ledger-amount-min" className="text-[11px] text-slate-500">
                  Min
                </label>
                <Input
                  id="ledger-amount-min"
                  inputMode="decimal"
                  placeholder="Any"
                  value={amountMinStr}
                  onChange={(e) => setAmountMinStr(e.target.value)}
                  onBlur={applyAmountRangeToFilters}
                  onKeyDown={(e) => e.key === 'Enter' && applyAmountRangeToFilters()}
                  className="h-9 w-[7.5rem] text-sm bg-white border-slate-200"
                />
              </div>
              <div className="space-y-0.5">
                <label htmlFor="ledger-amount-max" className="text-[11px] text-slate-500">
                  Max
                </label>
                <Input
                  id="ledger-amount-max"
                  inputMode="decimal"
                  placeholder="Any"
                  value={amountMaxStr}
                  onChange={(e) => setAmountMaxStr(e.target.value)}
                  onBlur={applyAmountRangeToFilters}
                  onKeyDown={(e) => e.key === 'Enter' && applyAmountRangeToFilters()}
                  className="h-9 w-[7.5rem] text-sm bg-white border-slate-200"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 sm:pb-2 max-w-md leading-snug">
              Absolute net amount. One value = lower or upper bound only; both = range. Match exact: same min and max.
            </p>
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
                        setSelectedIds(prev => prev.size === 0 ? prev : new Set());
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

            {/* Platform filter buttons */}
            {[
              { label: 'All Platforms', value: undefined },
              { label: 'Uber', value: 'Uber' },
              { label: 'InDrive', value: 'InDrive' },
              { label: 'Roam', value: 'Roam' },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  if (filters.platform === opt.value) return;
                  setFilters(prev => ({ ...prev, platform: opt.value }));
                  setPage(1);
                }}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  filters.platform === opt.value
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                )}
              >
                {opt.label}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Direction (Inflow / Outflow) filter buttons */}
            {[
              { label: 'All Flows', value: undefined as string | undefined, icon: null },
              { label: 'Inflow', value: 'inflow', icon: <ArrowDownLeft className="h-3 w-3" /> },
              { label: 'Outflow', value: 'outflow', icon: <ArrowUpRight className="h-3 w-3" /> },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => {
                  if (filters.direction === opt.value) return;
                  setFilters(prev => ({ ...prev, direction: opt.value as any }));
                  setPage(1);
                }}
                className={cn(
                  'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  filters.direction === opt.value
                    ? opt.value === 'inflow'
                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                      : opt.value === 'outflow'
                      ? 'bg-red-100 text-red-700 border border-red-300'
                      : 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-transparent'
                )}
              >
                {opt.icon}
                {opt.label}
              </button>
            ))}

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
          {detailEntry && (
              <>
                <DialogHeader className="pb-0">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "p-2.5 rounded-xl",
                      detailEntry.direction === 'inflow' ? "bg-emerald-50" : "bg-red-50"
                    )}>
                      {detailEntry.direction === 'inflow'
                        ? <ArrowUpRight className="h-5 w-5 text-emerald-600" />
                        : <ArrowDownLeft className="h-5 w-5 text-red-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <DialogTitle className="text-base font-semibold text-slate-900">
                        {getEventLabel(detailEntry.eventType)}
                      </DialogTitle>
                      <DialogDescription className="text-xs text-slate-500 mt-0.5">
                        {detailEntry.description}
                      </DialogDescription>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={cn(
                        "text-xl font-bold tabular-nums",
                        detailEntry.direction === 'inflow' ? "text-emerald-700" : "text-red-600"
                      )}>
                        {detailEntry.direction === 'inflow' ? '+' : '-'}{formatCurrency(detailEntry.netAmount)}
                      </p>
                      {detailEntry.grossAmount !== undefined && detailEntry.grossAmount !== detailEntry.netAmount && Math.abs(detailEntry.grossAmount) > 0 && (
                        <p className="text-xs text-slate-400 mt-0.5">Gross: {formatCurrency(detailEntry.grossAmount)}</p>
                      )}
                    </div>
                  </div>
                </DialogHeader>

                {/* Type + Status badges row */}
                <div className="flex flex-wrap items-center gap-2 mt-2 pt-3 border-t border-slate-100">
                  {getEventBadge(detailEntry.eventType)}
                  {getPlatformBadge(detailEntry.platform)}
                  <span className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
                    detailEntry.direction === 'inflow'
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-red-50 text-red-600 border-red-200"
                  )}>
                    {detailEntry.direction === 'inflow' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownLeft className="h-3 w-3" />}
                    {detailEntry.direction === 'inflow' ? 'Inflow' : 'Outflow'}
                  </span>
                  {detailEntry.isReconciled ? (
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
                    <DetailRow icon={CalendarDays} label="Date" value={`${formatLedgerDate(detailEntry.date)}${detailEntry.time ? ` at ${detailEntry.time}` : ''}`} />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={User}
                      label="Driver"
                      value={
                        <div>
                          <span className="font-medium">{detailEntry.driverName || 'Unknown Driver'}</span>
                          {detailEntry.driverId && <span className="ml-2 text-[11px] text-slate-400 font-mono">{detailEntry.driverId.substring(0, 12)}...</span>}
                        </div>
                      }
                      copyable={detailEntry.driverId}
                    />
                  </div>
                  {(detailEntry.vehicleId || detailEntry.vehiclePlate) && (
                    <div className="px-4">
                      <DetailRow
                        icon={Car}
                        label="Vehicle"
                        value={
                          <div>
                            {detailEntry.vehiclePlate && <span className="font-medium">{detailEntry.vehiclePlate}</span>}
                            {detailEntry.vehicleId && <span className={cn("text-[11px] text-slate-400 font-mono", detailEntry.vehiclePlate && "ml-2")}>{detailEntry.vehicleId.substring(0, 12)}...</span>}
                          </div>
                        }
                      />
                    </div>
                  )}
                  <div className="px-4">
                    <DetailRow icon={Tag} label="Category" value={detailEntry.category} />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={DollarSign}
                      label="Financial Details"
                      value={
                        <div className="grid grid-cols-2 gap-x-6 gap-y-1 mt-1">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Gross Amount</span>
                            <p className="font-semibold tabular-nums">{formatCurrency(detailEntry.grossAmount)}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Net Amount</span>
                            <p className={cn("font-semibold tabular-nums", detailEntry.direction === 'inflow' ? "text-emerald-700" : "text-red-600")}>{detailEntry.direction === 'inflow' ? '+' : '-'}{formatCurrency(detailEntry.netAmount)}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase">Currency</span>
                            <p>{detailEntry.currency || 'USD'}</p>
                          </div>
                          {detailEntry.paymentMethod && (
                            <div>
                              <span className="text-[10px] text-slate-400 uppercase">Payment Method</span>
                              <p>{detailEntry.paymentMethod}</p>
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
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 capitalize">{detailEntry.sourceType}</span>
                            <span className="font-mono text-xs text-slate-600">{detailEntry.sourceId}</span>
                          </div>
                          {detailEntry.batchId && <p className="text-[11px] text-slate-400 mt-1">Batch: {detailEntry.batchName || detailEntry.batchId}</p>}
                        </div>
                      }
                      copyable={detailEntry.sourceId}
                    />
                  </div>
                  <div className="px-4">
                    <DetailRow
                      icon={CheckCircle2}
                      label="Reconciliation"
                      value={
                        <div className="flex items-center gap-2">
                          {detailEntry.isReconciled ? <span className="text-emerald-700 font-medium">Reconciled</span> : <span className="text-amber-600 font-medium">Pending</span>}
                          {detailEntry.reconciledAt && <span className="text-[11px] text-slate-400">on {formatLedgerDate(detailEntry.reconciledAt.split('T')[0])}</span>}
                        </div>
                      }
                    />
                  </div>
                  <div className="px-4">
                    <DetailRow icon={Clock} label="Created" value={detailEntry.createdAt ? format(new Date(detailEntry.createdAt), 'MMM dd, yyyy h:mm a') : 'Unknown'} />
                  </div>
                  <div className="px-4">
                    <DetailRow icon={FileText} label="Ledger Entry ID" value={<span className="font-mono text-xs">{detailEntry.id}</span>} mono copyable={detailEntry.id} />
                  </div>
                  {detailEntry.metadata && Object.keys(detailEntry.metadata).length > 0 && (
                    <div className="px-4">
                      <DetailRow
                        icon={Info}
                        label="Additional Metadata"
                        value={
                          <div className="bg-slate-50 rounded-md p-2 mt-1 max-h-32 overflow-y-auto">
                            <pre className="text-[11px] text-slate-600 whitespace-pre-wrap font-mono">{JSON.stringify(detailEntry.metadata, null, 2)}</pre>
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
                      handleReconcile(detailEntry.id, !detailEntry.isReconciled);
                      setDetailEntry({ ...detailEntry, isReconciled: !detailEntry.isReconciled });
                    }}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    {detailEntry.isReconciled ? 'Mark Unreconciled' : 'Mark Reconciled'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(detailEntry, null, 2));
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
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

LedgerViewInner.displayName = 'LedgerViewInner';

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