import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download, Target, CalendarDays, X, Database, AlertTriangle } from "lucide-react";
import { TierConfig, QuotaConfig, Trip, FinancialTransaction } from "../../types/data";
import { deriveDriverFinancialDateRange } from "../../utils/driverFinancialDateRange";
import { format, startOfDay, endOfDay } from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner@2.0.3";
import { ScrollArea } from "../ui/scroll-area";
import { api } from "../../services/api";
interface DriverEarningsHistoryProps {
  driverId: string;
  quotaConfig?: QuotaConfig;   // For Quota % column (Phase 5)
  /** When set, API week range matches Expenses/Settlement (trips + transactions), not only ledger_event dates. */
  trips?: Trip[];
  transactions?: FinancialTransaction[];
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

interface PeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  driverShare: number;
  fleetShare: number;
  expenses: number;
  tier: TierConfig;
  netEarnings: number;
  payouts: number;
  tripCount: number;
  transactionCount: number;
  quotaTarget: number | null;
  quotaPercent: number | null;
}

// ────────────────────────────────────────────────────────────
// Derive the quota target for a given period type from quotaConfig.
//   Daily  → weekly target / working days (derived from weekly config)
//   Weekly → weekly target directly
//   Monthly → monthly target if enabled, else weekly * 4.33
// Returns null if the relevant quota is not enabled.
// ────────────────────────────────────────────────────────────
function getQuotaTarget(periodType: PeriodType, quotaConfig?: QuotaConfig): number | null {
  if (!quotaConfig) return null;

  if (periodType === 'daily') {
    if (!quotaConfig.weekly?.enabled) return null;
    const workingDays = quotaConfig.weekly.workingDays?.length || 6;
    return quotaConfig.weekly.amount / workingDays;
  }

  if (periodType === 'weekly') {
    if (!quotaConfig.weekly?.enabled) return null;
    return quotaConfig.weekly.amount;
  }

  // monthly
  if (quotaConfig.monthly?.enabled) return quotaConfig.monthly.amount;
  if (quotaConfig.weekly?.enabled) return quotaConfig.weekly.amount * 4.33;
  return null;
}

function getQuotaBadgeStyle(percent: number): string {
  if (percent >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (percent >= 70) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

export function DriverEarningsHistory({ driverId, quotaConfig, trips, transactions }: DriverEarningsHistoryProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // ────────────────────────────────────────────────────────────
  // Phase 5: Server-side ledger earnings history (ONLY source)
  // ────────────────────────────────────────────────────────────
  const [serverPeriodData, setServerPeriodData] = useState<PeriodRow[]>([]);
  const [serverDataLoaded, setServerDataLoaded] = useState(false);
  const [serverDataLoading, setServerDataLoading] = useState(false);
  const [dataSource, setDataSource] = useState<'loading' | 'ledger' | 'error'>('loading');

  /** Stable key so parent re-renders with new trip array identity do not refetch unnecessarily. */
  const activityRangeKey = useMemo(() => {
    const r = deriveDriverFinancialDateRange(trips, transactions);
    return r ? `${r.startDate}|${r.endDate}` : "";
  }, [trips, transactions]);

  useEffect(() => {
    let cancelled = false;
    setServerDataLoaded(false);
    setServerDataLoading(true);
    setDataSource('loading');

    const params: {
      driverId: string;
      periodType: PeriodType;
      startDate?: string;
      endDate?: string;
    } = { driverId, periodType };
    if (activityRangeKey) {
      const [startDate, endDate] = activityRangeKey.split("|");
      params.startDate = startDate;
      params.endDate = endDate;
    }

    api.getLedgerEarningsHistory(params)
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data && result.data.length > 0) {
          // Convert server date strings → Date objects to match PeriodRow interface
          const converted: PeriodRow[] = result.data.map((row: any) => ({
            periodStart: new Date(row.periodStart + 'T00:00:00'),
            periodEnd: new Date(row.periodEnd + 'T23:59:59'),
            grossRevenue: row.grossRevenue,
            driverShare: row.driverShare,
            fleetShare: row.fleetShare,
            expenses: row.expenses,
            tier: {
              id: row.tier.id,
              name: row.tier.name,
              minEarnings: 0,
              maxEarnings: null,
              sharePercentage: row.tier.sharePercentage,
              color: row.tier.color,
            } as TierConfig,
            netEarnings: row.netEarnings,
            payouts: row.payouts,
            tripCount: row.tripCount,
            transactionCount: row.transactionCount,
            quotaTarget: row.quotaTarget,
            quotaPercent: row.quotaPercent,
          }));
          setServerPeriodData(converted);
          setServerDataLoaded(true);
          setDataSource('ledger');
          console.log(`[EarningsHistory] Loaded ${converted.length} rows from ledger (${result.durationMs}ms)`);
        } else {
          setServerPeriodData([]);
          setServerDataLoaded(true);
          setDataSource('ledger');
          console.log('[EarningsHistory] Ledger returned no data for this driver/period');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[EarningsHistory] Ledger fetch failed:', err);
        setServerDataLoaded(true);
        setDataSource('error');
      })
      .finally(() => {
        if (!cancelled) setServerDataLoading(false);
      });

    return () => { cancelled = true; };
  }, [driverId, periodType, activityRangeKey]);

  // Reset visible rows when switching period type
  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setSelectedRowIdx(null);
  };

  // ────────────────────────────────────────────────────────────
  // Quota target for the current period type (null = not enabled)
  // ────────────────────────────────────────────────────────────
  const quotaTarget = useMemo(() => getQuotaTarget(periodType, quotaConfig), [periodType, quotaConfig]);
  const quotaEnabled = quotaTarget !== null;

  // ────────────────────────────────────────────────────────────
  // Step 5.4: Client-side periodData fallback REMOVED.
  // Earnings History now reads ONLY from the server ledger endpoint.
  // ────────────────────────────────────────────────────────────
  const activePeriodData = serverPeriodData;

  // ────────────────────────────────────────────────────────────
  // Date range filter — applied AFTER aggregation
  // ────────────────────────────────────────────────────────────
  const filteredPeriodData = useMemo(() => {
    if (!dateFrom && !dateTo) return activePeriodData;

    const fromTime = dateFrom ? startOfDay(new Date(dateFrom + 'T00:00:00')).getTime() : -Infinity;
    const toTime = dateTo ? endOfDay(new Date(dateTo + 'T00:00:00')).getTime() : Infinity;

    return activePeriodData.filter(row => {
      const rowEnd = row.periodEnd.getTime();
      const rowStart = row.periodStart.getTime();
      // Include row if any part of the period overlaps the filter range
      return rowEnd >= fromTime && rowStart <= toTime;
    });
  }, [activePeriodData, dateFrom, dateTo]);

  const dateFilterActive = dateFrom !== '' || dateTo !== '';

  const clearDateFilter = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedRowIdx(null);
  };

  // ────────────────────────────────────────────────────────────
  // Period label formatting
  // ────────────────────────────────────────────────────────────
  const formatPeriodLabel = (row: PeriodRow): string => {
    if (periodType === 'daily') {
      return format(row.periodStart, 'EEE, dd/MM/yyyy');
    }
    if (periodType === 'monthly') {
      return format(row.periodStart, 'MMMM yyyy');
    }
    // weekly
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  const periodColumnLabel = periodType === 'daily' ? 'Day' : periodType === 'monthly' ? 'Month' : 'Week';
  const periodLabel = periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month';

  // ────────────────────────────────────────────────────────────
  // Latest period row (for summary card)
  // ────────────────────────────────────────────────────────────
  const latestRow = activePeriodData.length > 0 ? activePeriodData[0] : null;

  // ────────────────────────────────────────────────────────────
  // Display row for the progress bar — selected row or latest
  // ────────────────────────────────────────────────────────────
  const displayRow = (selectedRowIdx !== null && activePeriodData[selectedRowIdx]) ? activePeriodData[selectedRowIdx] : latestRow;
  const isViewingSelected = selectedRowIdx !== null && activePeriodData[selectedRowIdx] !== undefined;

  // ────────────────────────────────────────────────────────────
  // CSV Export
  // ────────────────────────────────────────────────────────────
  const handleExport = () => {
    const data = filteredPeriodData.map(row => {
      const base: Record<string, string | number> = {
        [periodColumnLabel]: periodType === 'weekly'
          ? `${format(row.periodStart, 'dd/MM/yyyy')} to ${format(row.periodEnd, 'dd/MM/yyyy')}`
          : periodType === 'daily'
            ? format(row.periodStart, 'dd/MM/yyyy')
            : format(row.periodStart, 'MMMM yyyy'),
        'Trip Count': row.tripCount,
        'Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier Name': row.tier.name,
        'Tier Share %': row.tier.sharePercentage + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Payouts': row.payouts.toFixed(2),
      };

      if (quotaEnabled) {
        base['Quota Target'] = row.quotaTarget !== null ? row.quotaTarget.toFixed(2) : '-';
        base['Quota %'] = row.quotaPercent !== null ? row.quotaPercent.toFixed(1) + '%' : '-';
      }

      return base;
    });

    exportToCSV(data, `driver_earnings_history_${periodType}_${driverId}`);
    toast.success("History Exported");
  };

  // ────────────────────────────────────────────────────────────
  // Loading / error / empty (error must not use the generic empty copy)
  // ───────────────────────────────────────────────────────────
  if (serverDataLoading && activePeriodData.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed rounded-lg text-slate-400">
        <div className="animate-pulse">Loading earnings history...</div>
      </div>
    );
  }

  if (dataSource === 'error' && !serverDataLoading) {
    return (
      <div className="text-center p-6 border border-dashed border-rose-200 rounded-lg bg-rose-50/50 text-slate-700 space-y-2">
        <p className="text-sm font-medium text-rose-800">Could not load earnings history</p>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          The ledger request failed. Check the browser console for details, refresh the page, or confirm you are signed in.
        </p>
      </div>
    );
  }

  if (activePeriodData.length === 0 && !serverDataLoading) {
    return (
      <div className="text-center p-6 border border-dashed rounded-lg text-slate-600 space-y-2 max-w-lg mx-auto">
        <p className="text-sm font-medium text-slate-800">No earnings history in the canonical ledger</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          This table is built only from <span className="font-medium text-slate-700">ledger_event</span> rows (Uber CSV import / canonical append).
          The chart above can still use trip records and other summaries — they are not the same data source.
        </p>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Earnings History</CardTitle>
          {dataSource === 'ledger' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border-emerald-200 font-normal">
              <Database className="h-3 w-3 mr-1" />
              Ledger
            </Badge>
          )}
          {dataSource === 'error' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-600 border-rose-200 font-normal">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Error
            </Badge>
          )}
          {dataSource === 'loading' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-slate-50 text-slate-400 border-slate-200 font-normal animate-pulse">
              Loading...
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export History
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period selector tabs + Date filter */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
            {(['daily', 'weekly', 'monthly'] as PeriodType[]).map(pt => (
              <button
                key={pt}
                onClick={() => handlePeriodChange(pt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  periodType === pt
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {pt === 'daily' ? 'Daily' : pt === 'weekly' ? 'Weekly' : 'Monthly'}
              </button>
            ))}
            <span className="ml-2 text-[10px] text-slate-400">
              {filteredPeriodData.length} {periodLabel}{filteredPeriodData.length !== 1 ? 's' : ''} with activity
            </span>
          </div>

          {/* Date range filter */}
          <div className={`flex items-center gap-2 px-2 py-1 rounded-lg transition-colors ${dateFilterActive ? 'bg-indigo-50 border border-indigo-200' : ''}`}>
            <CalendarDays className={`h-4 w-4 ${dateFilterActive ? 'text-indigo-500' : 'text-slate-400'}`} />
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setSelectedRowIdx(null); }}
                className={`h-8 px-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${dateFilterActive ? 'border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-700'}`}
                placeholder="From"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setSelectedRowIdx(null); }}
                className={`h-8 px-2 text-xs border rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 ${dateFilterActive ? 'border-indigo-300 text-indigo-700' : 'border-slate-200 text-slate-700'}`}
                placeholder="To"
              />
            </div>
            {dateFilterActive && (
              <button
                onClick={clearDateFilter}
                className="flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
                title="Clear date filter"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Active filter banner */}
        {dateFilterActive && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-100 rounded-md text-xs text-indigo-700">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>
              Filtering: {dateFrom ? format(new Date(dateFrom + 'T00:00:00'), 'MMM d, yyyy') : 'start'}
              {' '}{'-'}{' '}
              {dateTo ? format(new Date(dateTo + 'T00:00:00'), 'MMM d, yyyy') : 'present'}
            </span>
            <span className="text-indigo-500 font-medium">
              ({filteredPeriodData.length} of {activePeriodData.length} {periodLabel}{activePeriodData.length !== 1 ? 's' : ''})
            </span>
          </div>
        )}

        {/* Quota summary card — only when quota is enabled and we have a display row */}
        {quotaEnabled && displayRow && displayRow.quotaTarget !== null && (() => {
          const barLabel = isViewingSelected
            ? formatPeriodLabel(displayRow)
            : `This ${periodLabel}`;
          return (
          <div className={`rounded-lg border p-3 transition-all duration-300 ${isViewingSelected ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className={`h-4 w-4 ${isViewingSelected ? 'text-indigo-500' : 'text-slate-500'}`} />
                <span className="text-sm font-medium text-slate-700">
                  {barLabel}: ${displayRow.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {' / '}
                  ${displayRow.quotaTarget.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  {displayRow.quotaPercent !== null && (
                    <span className={`ml-1.5 font-semibold ${displayRow.quotaPercent >= 100 ? 'text-emerald-600' : displayRow.quotaPercent >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                      ({displayRow.quotaPercent.toFixed(0)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                {isViewingSelected && (
                  <button
                    onClick={() => setSelectedRowIdx(null)}
                    className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium underline underline-offset-2"
                  >
                    Reset to current
                  </button>
                )}
                <Badge
                  variant="outline"
                  className="text-[10px]"
                  style={{ backgroundColor: displayRow.tier.color ? `${displayRow.tier.color}15` : undefined, borderColor: displayRow.tier.color || undefined, color: displayRow.tier.color || undefined }}
                >
                  {displayRow.tier.name} ({displayRow.tier.sharePercentage}%)
                </Badge>
                {displayRow.tripCount > 0 && (
                  <span>{displayRow.tripCount} trip{displayRow.tripCount !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ease-out ${
                  (displayRow.quotaPercent ?? 0) >= 100
                    ? 'bg-emerald-500'
                    : (displayRow.quotaPercent ?? 0) >= 70
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, displayRow.quotaPercent ?? 0)}%` }}
              />
            </div>
          </div>
          );
        })()}

        <ScrollArea className="h-80">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{periodColumnLabel}</TableHead>
                <TableHead className="text-right">Gross Revenue</TableHead>
                <TableHead className="text-right">Driver Share</TableHead>
                <TableHead className="text-center">Tier Applied</TableHead>
                <TableHead className="text-right">Payouts</TableHead>
                {quotaEnabled && <TableHead className="text-right">Quota %</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPeriodData.map((row, idx) => (
                <TableRow
                  key={idx}
                  onClick={() => setSelectedRowIdx(selectedRowIdx === idx ? null : idx)}
                  className={`cursor-pointer transition-colors ${
                    selectedRowIdx === idx
                      ? 'bg-indigo-50 hover:bg-indigo-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Period label */}
                  <TableCell className="font-medium text-xs whitespace-nowrap">
                    {selectedRowIdx === idx && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 align-middle" />
                    )}
                    {formatPeriodLabel(row)}
                    {row.tripCount > 0 && (
                      <span className="ml-1.5 text-slate-400 text-[10px]">
                        {row.tripCount} trip{row.tripCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </TableCell>

                  {/* Gross Revenue */}
                  <TableCell className="text-right text-slate-600">
                    ${row.grossRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </TableCell>

                  {/* Driver Share with tier % badge */}
                  <TableCell className="text-right text-emerald-600">
                    <span className="font-medium">
                      ${row.driverShare.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                    <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200">
                      {row.tier.sharePercentage}%
                    </Badge>
                  </TableCell>

                  {/* Tier Applied */}
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className="text-xs"
                      style={{ backgroundColor: row.tier.color ? `${row.tier.color}15` : undefined, borderColor: row.tier.color || undefined, color: row.tier.color || undefined }}
                    >
                      {row.tier.name}
                    </Badge>
                  </TableCell>

                  {/* Payouts */}
                  <TableCell className="text-right text-slate-500">
                    {row.payouts > 0
                      ? `$${row.payouts.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
                      : '-'}
                  </TableCell>

                  {/* Quota % — only rendered when quota is enabled */}
                  {quotaEnabled && (
                    <TableCell className="text-right">
                      {row.quotaPercent !== null ? (
                        <Badge variant="outline" className={`text-xs font-medium ${getQuotaBadgeStyle(row.quotaPercent)}`}>
                          {row.quotaPercent.toFixed(0)}%
                        </Badge>
                      ) : '-'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}