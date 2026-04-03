import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { LedgerFilterParams } from '../../types/data';
import { format, startOfMonth } from 'date-fns';
import { DateRange } from 'react-day-picker';
import {
  Loader2,
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar as CalendarIcon,
  Users,
  RefreshCw,
  X,
  FileText,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  CreditCard,
  Fuel,
  Car,
  Receipt,
  HelpCircle,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Calendar } from '../ui/calendar';
import { cn } from '../ui/utils';
import { usePlatformConfig } from '../auth/PlatformConfigContext';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';

/** YYYY-MM-DD from ledger date string (handles ISO timestamps). */
function ledgerCalendarDay(dateStr: string | undefined): string {
  if (!dateStr) return '';
  return dateStr.split('T')[0];
}

/**
 * Parse ledger calendar dates without UTC drift. Date-only ISO strings (YYYY-MM-DD)
 * parsed with `new Date()` are treated as UTC midnight and can display as the previous
 * local day (e.g. Mar 1 → Feb 28 in Jamaica).
 */
function parseLedgerCalendarDate(dateStr: string): Date {
  const dayPart = ledgerCalendarDay(dateStr);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayPart);
  if (!m) return new Date(dateStr);
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(y, mo, d);
}

type DriverSummary = {
  driverId: string;
  driverName: string;
  totalInflow: number;
  totalOutflow: number;
  netBalance: number;
  transactionCount: number;
};

type LedgerRow = {
  id: string;
  date: string;
  time?: string;
  driverId: string;
  driverName: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: 'Cleared' | 'Pending' | 'Disputed';
  platform?: string;
  sourceType: string;
  sourceId: string;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  fare_earning: 'Trip Earnings',
  tip: 'Tip',
  surge_bonus: 'Surge/Bonus',
  fuel_expense: 'Fuel Expense',
  fuel_reimbursement: 'Fuel Reimbursement',
  toll_charge: 'Toll Charge',
  toll_refund: 'Toll Refund',
  maintenance: 'Maintenance',
  insurance: 'Insurance',
  driver_payout: 'Driver Payout',
  cash_collection: 'Cash Collection',
  platform_fee: 'Platform Fee',
  wallet_credit: 'Wallet Credit',
  wallet_debit: 'Wallet Debit',
  cancelled_trip_loss: 'Cancelled Trip',
  adjustment: 'Adjustment',
  other: 'Other',
};

const EVENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  fare_earning: <DollarSign className="h-4 w-4" />,
  tip: <TrendingUp className="h-4 w-4" />,
  cash_collection: <Wallet className="h-4 w-4" />,
  fuel_expense: <Fuel className="h-4 w-4" />,
  fuel_reimbursement: <Fuel className="h-4 w-4" />,
  toll_charge: <Receipt className="h-4 w-4" />,
  toll_refund: <Receipt className="h-4 w-4" />,
  maintenance: <Car className="h-4 w-4" />,
  driver_payout: <CreditCard className="h-4 w-4" />,
  platform_fee: <FileText className="h-4 w-4" />,
};

export function DriverLedgerPage() {
  const { formatCurrency } = usePlatformConfig();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<string>('all');
  const [selectedEventType, setSelectedEventType] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Reset pagination when primary filters change (query no longer keyed by page)
  useEffect(() => {
    setPage(1);
  }, [dateRange?.from, dateRange?.to, selectedDriver, selectedEventType]);

  // Fetch drivers for dropdown - api.getDrivers() returns { id, name, ... }
  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-list-ledger'],
    queryFn: async () => {
      const result = await api.getDrivers();
      // Transform to consistent format and filter out invalid entries
      return result
        .filter((d: any) => d.id && (d.name || d.driverName))
        .map((d: any) => ({
          id: d.id,
          name: d.name || d.driverName || 'Unknown',
        }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });

  // Build API params: fetch a full window for the selected filters (no server pagination).
  // UI pagination runs client-side after date/type filtering so ranges stay correct.
  const filterParams: LedgerFilterParams = useMemo(() => {
    const params: LedgerFilterParams = {
      limit: 5000,
      offset: 0,
      sortBy: 'date',
      sortDir: 'desc',
    };
    if (selectedDriver !== 'all') params.driverId = selectedDriver;
    if (selectedEventType !== 'all') params.eventType = selectedEventType as any;
    if (dateRange?.from) params.startDate = format(dateRange.from, 'yyyy-MM-dd');
    if (dateRange?.to) params.endDate = format(dateRange.to, 'yyyy-MM-dd');
    if (searchTerm.trim()) params.searchTerm = searchTerm.trim();
    return params;
  }, [selectedDriver, selectedEventType, dateRange, searchTerm]);

  // Fetch ledger entries
  const {
    data: ledgerResponse,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['driver-ledger', filterParams],
    queryFn: () => api.getLedgerEntries(filterParams),
  });

  // Fetch transactions for float/payment data
  const { data: transactions = [] } = useQuery({
    queryKey: ['financial-transactions', selectedDriver, dateRange],
    queryFn: async () => {
      const result = await api.getTransactions({
        startDate: dateRange?.from ? format(dateRange.from, 'yyyy-MM-dd') : undefined,
        endDate: dateRange?.to ? format(dateRange.to, 'yyyy-MM-dd') : undefined,
      });
      if (selectedDriver !== 'all') {
        return result.filter(t => t.driverId === selectedDriver);
      }
      return result;
    },
  });

  // Transform ledger entries to rows with running balance
  const ledgerRows: LedgerRow[] = useMemo(() => {
    if (!ledgerResponse?.data) return [];

    // Client-side date filtering as safety net (API should filter, but ensure it's correct)
    let filteredEntries = [...ledgerResponse.data];
    
    if (dateRange?.from || dateRange?.to) {
      const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : null;
      const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : null;
      
      filteredEntries = filteredEntries.filter(entry => {
        const entryDate = ledgerCalendarDay(entry.date);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }

    const entries = filteredEntries.sort(
      (a, b) => parseLedgerCalendarDate(a.date).getTime() - parseLedgerCalendarDate(b.date).getTime()
    );

    let runningBalance = 0;
    const rows: LedgerRow[] = [];

    for (const entry of entries) {
      const isDebit = entry.direction === 'outflow';
      const amount = Math.abs(entry.netAmount);

      if (isDebit) {
        runningBalance -= amount;
      } else {
        runningBalance += amount;
      }

      rows.push({
        id: entry.id,
        date: entry.date,
        time: entry.time,
        driverId: entry.driverId,
        driverName: entry.driverName || 'Unknown Driver',
        type: EVENT_TYPE_LABELS[entry.eventType] || entry.eventType,
        description: entry.description,
        debit: isDebit ? amount : 0,
        credit: !isDebit ? amount : 0,
        runningBalance,
        status: entry.isReconciled ? 'Cleared' : 'Pending',
        platform: entry.platform,
        sourceType: entry.sourceType,
        sourceId: entry.sourceId,
      });
    }

    return rows.reverse();
  }, [ledgerResponse?.data, dateRange]);

  // Calculate summary metrics (use filtered data)
  const summaryMetrics = useMemo(() => {
    // Use the same filtering logic as ledgerRows
    let entries = ledgerResponse?.data || [];
    
    if (dateRange?.from || dateRange?.to) {
      const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : null;
      const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : null;
      
      entries = entries.filter(entry => {
        const entryDate = ledgerCalendarDay(entry.date);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }
    let totalInflow = 0;
    let totalOutflow = 0;
    let cashCollected = 0;
    let floatIssued = 0;
    let paymentsReceived = 0;

    for (const entry of entries) {
      const amount = Math.abs(entry.netAmount);
      if (entry.direction === 'inflow') {
        totalInflow += amount;
      } else {
        totalOutflow += amount;
      }
      if (entry.eventType === 'cash_collection') {
        cashCollected += amount;
      }
    }

    // Add float and payment data from transactions
    for (const tx of transactions) {
      if (tx.type === 'Float_Given' && tx.status !== 'Void') {
        floatIssued += Math.abs(tx.amount);
      }
      if (tx.type === 'Payment_Received' && tx.status !== 'Void') {
        paymentsReceived += Math.abs(tx.amount);
      }
    }

    return {
      totalInflow,
      totalOutflow,
      netBalance: totalInflow - totalOutflow,
      cashCollected,
      floatIssued,
      paymentsReceived,
      netCashPosition: cashCollected + floatIssued - paymentsReceived,
    };
  }, [ledgerResponse?.data, transactions, dateRange]);

  // Driver summaries for the overview cards
  const driverSummaries: DriverSummary[] = useMemo(() => {
    if (!ledgerResponse?.data) return [];
    
    // Apply same date filtering
    let entries = [...ledgerResponse.data];
    if (dateRange?.from || dateRange?.to) {
      const startDate = dateRange.from ? format(dateRange.from, 'yyyy-MM-dd') : null;
      const endDate = dateRange.to ? format(dateRange.to, 'yyyy-MM-dd') : null;
      
      entries = entries.filter(entry => {
        const entryDate = ledgerCalendarDay(entry.date);
        if (startDate && entryDate < startDate) return false;
        if (endDate && entryDate > endDate) return false;
        return true;
      });
    }

    const byDriver: Record<string, DriverSummary> = {};

    for (const entry of entries) {
      if (!byDriver[entry.driverId]) {
        byDriver[entry.driverId] = {
          driverId: entry.driverId,
          driverName: entry.driverName || 'Unknown',
          totalInflow: 0,
          totalOutflow: 0,
          netBalance: 0,
          transactionCount: 0,
        };
      }
      const summary = byDriver[entry.driverId];
      const amount = Math.abs(entry.netAmount);
      if (entry.direction === 'inflow') {
        summary.totalInflow += amount;
      } else {
        summary.totalOutflow += amount;
      }
      summary.netBalance = summary.totalInflow - summary.totalOutflow;
      summary.transactionCount++;
    }

    return Object.values(byDriver).sort((a, b) => b.netBalance - a.netBalance);
  }, [ledgerResponse?.data, dateRange]);

  // Use filtered count for pagination since we apply client-side date filtering
  const filteredCount = ledgerRows.length;
  const totalPages = Math.ceil(filteredCount / pageSize);
  
  // Paginate the filtered rows client-side
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return ledgerRows.slice(start, end);
  }, [ledgerRows, page, pageSize]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedDriver('all');
    setSelectedEventType('all');
    setDateRange({
      from: startOfMonth(new Date()),
      to: new Date(),
    });
    setPage(1);
  };

  const handleExport = () => {
    if (!ledgerRows.length) return;

    const headers = ['Date', 'Time', 'Driver', 'Type', 'Description', 'Debit', 'Credit', 'Balance', 'Status', 'Platform'];
    const csvRows = [
      headers.join(','),
      ...ledgerRows.map(row => [
        format(parseLedgerCalendarDate(row.date), 'yyyy-MM-dd'),
        row.time || '',
        `"${row.driverName}"`,
        `"${row.type}"`,
        `"${row.description}"`,
        row.debit.toFixed(2),
        row.credit.toFixed(2),
        row.runningBalance.toFixed(2),
        row.status,
        row.platform || '',
      ].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-ledger-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Driver Ledger
          </h2>
          <p className="text-slate-500 dark:text-slate-400">
            Complete transaction history and running balance for all drivers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!ledgerRows.length}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Inflow</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(summaryMetrics.totalInflow)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <ArrowDownLeft className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Outflow</p>
                <p className="text-2xl font-bold text-red-600">{formatCurrency(summaryMetrics.totalOutflow)}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <ArrowUpRight className="h-6 w-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Net Balance</p>
                <p className={cn(
                  "text-2xl font-bold",
                  summaryMetrics.netBalance >= 0 ? "text-emerald-600" : "text-red-600"
                )}>
                  {formatCurrency(summaryMetrics.netBalance)}
                </p>
              </div>
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center",
                summaryMetrics.netBalance >= 0 
                  ? "bg-emerald-100 dark:bg-emerald-900/30" 
                  : "bg-red-100 dark:bg-red-900/30"
              )}>
                {summaryMetrics.netBalance >= 0 
                  ? <TrendingUp className="h-6 w-6 text-emerald-600" />
                  : <TrendingDown className="h-6 w-6 text-red-600" />
                }
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Cash Position</p>
                <p className={cn(
                  "text-2xl font-bold",
                  summaryMetrics.netCashPosition >= 0 ? "text-amber-600" : "text-red-600"
                )}>
                  {formatCurrency(summaryMetrics.netCashPosition)}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Cash + Float − Payments
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by description, driver name, or ID..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(1);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={selectedDriver} onValueChange={(v) => { setSelectedDriver(v); setPage(1); }}>
              <SelectTrigger className="w-full lg:w-[200px]">
                <Users className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Drivers</SelectItem>
                {drivers.map((d: { id: string; name: string }) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedEventType} onValueChange={(v) => { setSelectedEventType(v); setPage(1); }}>
              <SelectTrigger className="w-full lg:w-[180px]">
                <Filter className="h-4 w-4 mr-2 text-slate-400" />
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="fare_earning">Trip Earnings</SelectItem>
                <SelectItem value="tip">Tips</SelectItem>
                <SelectItem value="cash_collection">Cash Collection</SelectItem>
                <SelectItem value="toll_charge">Toll Charges</SelectItem>
                <SelectItem value="toll_refund">Toll Refunds</SelectItem>
                <SelectItem value="fuel_expense">Fuel Expenses</SelectItem>
                <SelectItem value="fuel_reimbursement">Fuel Reimbursements</SelectItem>
                <SelectItem value="driver_payout">Driver Payouts</SelectItem>
                <SelectItem value="adjustment">Adjustments</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full lg:w-[260px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                      </>
                    ) : (
                      format(dateRange.from, 'MMM d, yyyy')
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) => { setDateRange(range); setPage(1); }}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>

            <Button variant="ghost" size="icon" onClick={handleClearFilters}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Transaction Ledger</CardTitle>
              <CardDescription className="space-y-1">
                <span>{filteredCount} transactions found</span>
                <span className="block text-[11px] text-slate-500 font-normal leading-snug">
                  Amounts are posted ledger <span className="font-mono text-[10px]">netAmount</span> (trip-sourced or
                  other), not the operational <span className="font-mono text-[10px]">trip.amount</span> field.
                  Canonical import events appear in financial totals when the read-model flag is on; this table still
                  lists legacy <span className="font-mono text-[10px]">ledger:*</span> rows.
                </span>
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : ledgerRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <FileText className="h-12 w-12 mb-4 text-slate-300" />
              <p className="text-lg font-medium">No transactions found</p>
              <p className="text-sm">Try adjusting your filters or date range</p>
            </div>
          ) : (
            <>
              <TooltipProvider delayDuration={200}>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                      <TableHead className="w-[100px]">Date</TableHead>
                      <TableHead className="w-[150px]">Driver</TableHead>
                      <TableHead className="w-[140px]">Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right w-[110px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-end gap-1 cursor-help text-slate-700 dark:text-slate-200">
                              Debit
                              <HelpCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Outflows: absolute <span className="font-mono">netAmount</span> from the ledger row (e.g.
                            fees, refunds as outflow).
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right w-[110px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex items-center justify-end gap-1 cursor-help text-slate-700 dark:text-slate-200">
                              Credit
                              <HelpCircle className="h-3.5 w-3.5 text-slate-400 shrink-0" aria-hidden />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs text-xs">
                            Inflows: absolute <span className="font-mono">netAmount</span> from the ledger row (e.g.
                            fare earning, tip). Not the same as unmerged trip CSV &ldquo;amount&rdquo;.
                          </TooltipContent>
                        </Tooltip>
                      </TableHead>
                      <TableHead className="text-right w-[120px]">Balance</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedRows.map((row) => (
                      <TableRow key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <TableCell className="font-mono text-sm">
                          <div>{format(parseLedgerCalendarDate(row.date), 'MMM d')}</div>
                          {row.time && (
                            <div className="text-xs text-slate-400">{row.time.slice(0, 5)}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm truncate max-w-[140px]" title={row.driverName}>
                            {row.driverName}
                          </div>
                          {row.platform && (
                            <Badge variant="outline" className="text-xs mt-0.5">
                              {row.platform}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400">
                              {EVENT_TYPE_ICONS[row.sourceType] || <FileText className="h-4 w-4" />}
                            </span>
                            <span className="text-sm">{row.type}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-slate-600 dark:text-slate-300 truncate max-w-[300px]" title={row.description}>
                            {row.description}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.debit > 0 && (
                            <span className="text-red-600">
                              {formatCurrency(row.debit)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {row.credit > 0 && (
                            <span className="text-emerald-600">
                              {formatCurrency(row.credit)}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          <span className={cn(
                            "font-semibold",
                            row.runningBalance >= 0 ? "text-slate-900 dark:text-slate-100" : "text-red-600"
                          )}>
                            {formatCurrency(row.runningBalance)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={row.status === 'Cleared' ? 'default' : row.status === 'Pending' ? 'secondary' : 'destructive'}
                            className={cn(
                              "text-xs",
                              row.status === 'Cleared' && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                            )}
                          >
                            {row.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </TooltipProvider>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">
                    Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, filteredCount)} of {filteredCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Driver Breakdown */}
      {selectedDriver === 'all' && driverSummaries.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Driver Summary</CardTitle>
            <CardDescription>
              Net position by driver for the selected period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800/50">
                    <TableHead>Driver</TableHead>
                    <TableHead className="text-right">Inflow</TableHead>
                    <TableHead className="text-right">Outflow</TableHead>
                    <TableHead className="text-right">Net Balance</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driverSummaries.slice(0, 10).map((summary) => (
                    <TableRow 
                      key={summary.driverId}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/30 cursor-pointer"
                      onClick={() => setSelectedDriver(summary.driverId)}
                    >
                      <TableCell className="font-medium">{summary.driverName}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-mono">
                        {formatCurrency(summary.totalInflow)}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-mono">
                        {formatCurrency(summary.totalOutflow)}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-mono font-semibold",
                        summary.netBalance >= 0 ? "text-emerald-600" : "text-red-600"
                      )}>
                        {formatCurrency(summary.netBalance)}
                      </TableCell>
                      <TableCell className="text-right text-slate-500">
                        {summary.transactionCount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {driverSummaries.length > 10 && (
              <p className="text-sm text-slate-500 mt-3 text-center">
                Showing top 10 drivers. Use the filter to view a specific driver.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
