import { formatJMD } from '../../utils/formatJMD';
import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Download, Target, CalendarDays, Database } from "lucide-react";
import { TierConfig, QuotaConfig, Trip, FinancialTransaction } from "../../types/data";
import { deriveDriverFinancialDateRange } from "../../utils/driverFinancialDateRange";
import { format } from "date-fns";
import { exportToCSV } from "../../utils/csvHelpers";
import { toast } from "sonner";
import { ScrollArea } from "../ui/scroll-area";
import { useDriverEarningsHistory } from "../../hooks/useDriverEarningsHistory";

interface DriverEarningsHistoryProps {
  driverId: string;
  /** @deprecated Quota comes from ledger rows (policy resolve). Kept for call-site compat. */
  quotaConfig?: QuotaConfig;
  /** When set, API week range matches Expenses/Settlement (trips + transactions), not only ledger_event dates. */
  trips?: Trip[];
  transactions?: FinancialTransaction[];
  /** Prefer Financials period (enterprise: no full-lifetime auto-load). */
  rangeFrom?: Date | string | null;
  rangeTo?: Date | string | null;
}

export type PeriodType = 'daily' | 'weekly' | 'monthly';

interface PeriodRow {
  periodStart: Date;
  periodEnd: Date;
  grossRevenue: number;
  /** Matches Driver Detail Period Earnings / PA (driver-overview period.earnings). */
  periodEarnings: number;
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
  policyId?: string;
  versionId?: string;
  policyName?: string;
  policySource?: string;
}

function getQuotaBadgeStyle(percent: number): string {
  if (percent >= 100) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (percent >= 70) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
}

function toYmd(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  return format(v, 'yyyy-MM-dd');
}

function convertRows(rows: any[]): PeriodRow[] {
  return rows.map((row: any) => ({
    periodStart: new Date(row.periodStart + 'T00:00:00'),
    periodEnd: new Date(row.periodEnd + 'T23:59:59'),
    grossRevenue: row.grossRevenue,
    periodEarnings:
      row.periodEarnings != null && Number.isFinite(Number(row.periodEarnings))
        ? Number(row.periodEarnings)
        : Number(row.grossRevenue) || 0,
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
    quotaTarget: row.quotaTarget ?? null,
    quotaPercent: row.quotaPercent ?? null,
    policyId: row.policyId,
    versionId: row.versionId,
    policyName: row.policyName,
    policySource: row.policySource,
  }));
}

export function DriverEarningsHistory({
  driverId,
  trips,
  transactions,
  rangeFrom,
  rangeTo,
}: DriverEarningsHistoryProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('weekly');
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);

  /**
   * Financials period only (owned by Financials date control — not Overview header).
   * Falls back to trip/tx activity span only when Financials range is unset.
   */
  const financialRangeKey = useMemo(() => {
    const rFrom = toYmd(rangeFrom);
    const rTo = toYmd(rangeTo);
    return rFrom && rTo ? `${rFrom}|${rTo}` : "";
  }, [rangeFrom, rangeTo]);

  const activityRangeKey = useMemo(() => {
    if (financialRangeKey) return financialRangeKey;
    const r = deriveDriverFinancialDateRange(trips, transactions);
    return r ? `${r.startDate}|${r.endDate}` : "";
  }, [financialRangeKey, trips, transactions]);

  const startDate = activityRangeKey ? activityRangeKey.split("|")[0] : undefined;
  const endDate = activityRangeKey ? activityRangeKey.split("|")[1] : undefined;

  const {
    rows: rqRows,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    loading: rqLoading,
    error: rqError,
    success: rqSuccess,
  } = useDriverEarningsHistory({
    driverId,
    periodType,
    startDate,
    endDate,
  });

  const activePeriodData = useMemo(() => convertRows(rqRows), [rqRows]);

  const waitingForRange = !financialRangeKey && !activityRangeKey;
  const dataSource: 'waiting' | 'loading' | 'ledger' | 'error' = waitingForRange
    ? 'waiting'
    : rqLoading && activePeriodData.length === 0
      ? 'loading'
      : rqError
        ? 'error'
        : 'ledger';

  const handleShowMore = () => {
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage().then((result) => {
      if (result.isError) {
        toast.error("Couldn't load more earnings history.");
      }
    });
  };

  const handlePeriodChange = (pt: PeriodType) => {
    setPeriodType(pt);
    setSelectedRowIdx(null);
  };

  const quotaEnabled = useMemo(
    () => activePeriodData.some((r) => r.quotaTarget !== null && r.quotaTarget !== undefined),
    [activePeriodData],
  );

  const filteredPeriodData = activePeriodData;

  const formatPeriodLabel = (row: PeriodRow): string => {
    if (periodType === 'daily') {
      return format(row.periodStart, 'EEE, dd/MM/yyyy');
    }
    if (periodType === 'monthly') {
      return format(row.periodStart, 'MMMM yyyy');
    }
    return `${format(row.periodStart, 'MMM d')} – ${format(row.periodEnd, 'MMM d, yyyy')}`;
  };

  const periodColumnLabel = periodType === 'daily' ? 'Day' : periodType === 'monthly' ? 'Month' : 'Week';
  const periodLabel = periodType === 'daily' ? 'day' : periodType === 'weekly' ? 'week' : 'month';

  const latestRow = activePeriodData.length > 0 ? activePeriodData[0] : null;
  const displayRow = (selectedRowIdx !== null && activePeriodData[selectedRowIdx])
    ? activePeriodData[selectedRowIdx]
    : latestRow;
  const isViewingSelected = selectedRowIdx !== null && activePeriodData[selectedRowIdx] !== undefined;

  const handleExport = () => {
    const data = filteredPeriodData.map(row => {
      const base: Record<string, string | number> = {
        [periodColumnLabel]: periodType === 'weekly'
          ? `${format(row.periodStart, 'dd/MM/yyyy')} to ${format(row.periodEnd, 'dd/MM/yyyy')}`
          : periodType === 'daily'
            ? format(row.periodStart, 'dd/MM/yyyy')
            : format(row.periodStart, 'MMMM yyyy'),
        'Trip Count': row.tripCount,
        'Period Earnings': row.periodEarnings.toFixed(2),
        'Ledger Gross Revenue': row.grossRevenue.toFixed(2),
        'Tier Name': row.tier.name,
        'Tier Share %': row.tier.sharePercentage + '%',
        'Driver Share': row.driverShare.toFixed(2),
        'Fleet Share': row.fleetShare.toFixed(2),
        'Ledger Bank/Cash Payouts': row.payouts.toFixed(2),
        'Earnings Policy': row.policyName || (row.policySource === 'legacy' ? 'Legacy prefs' : '-'),
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

  if (dataSource === 'waiting' && activePeriodData.length === 0) {
    return (
      <div className="text-center p-8 border border-dashed rounded-lg text-slate-400">
        <p className="text-sm font-medium text-slate-500">Choose a Financials period to load earnings history.</p>
        <p className="text-xs text-slate-400 mt-1">Use the Financials period control above — not the Overview calendar.</p>
      </div>
    );
  }

  if (dataSource === 'loading') {
    return (
      <div className="text-center p-8 border border-dashed rounded-lg text-slate-400">
        <div className="animate-pulse">Loading earnings history...</div>
      </div>
    );
  }

  if (dataSource === 'error') {
    return (
      <div className="text-center p-6 border border-dashed border-rose-200 rounded-lg bg-rose-50/50 text-slate-700 space-y-2">
        <p className="text-sm font-medium text-rose-800">Could not load earnings history</p>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          The ledger request failed. Check the browser console for details, refresh the page, or confirm you are signed in.
        </p>
      </div>
    );
  }

  if (rqSuccess && activePeriodData.length === 0) {
    return (
      <div className="text-center p-6 border border-dashed rounded-lg text-slate-600 space-y-2 max-w-lg mx-auto">
        <p className="text-sm font-medium text-slate-800">No earnings history for this range</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          History is limited to the selected Financials period. Expand the range or switch to another period.
        </p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Earnings History</CardTitle>
          {dataSource === 'ledger' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border-emerald-200 font-normal">
              <Database className="h-3 w-3 mr-1" />
              Ledger Gross
            </Badge>
          )}
          {isFetchingNextPage && (
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
              Overview range only — {filteredPeriodData.length} {periodLabel}{filteredPeriodData.length !== 1 ? 's' : ''} with activity
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <span className="text-xs text-slate-500">
              History follows the Financials period
            </span>
          </div>
        </div>

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
                  {barLabel}: {formatJMD(displayRow.periodEarnings, 2)}
                  {' / '}
                  {formatJMD(displayRow.quotaTarget, 2)}
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
                {(displayRow.policyName || displayRow.policySource === 'legacy') && (
                  <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                    {displayRow.policyName || 'Legacy prefs'}
                  </Badge>
                )}
                {displayRow.tripCount > 0 && (
                  <span>{displayRow.tripCount} trip{displayRow.tripCount !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
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
                <TableHead className="text-right">Trips</TableHead>
                <TableHead className="text-right">Period Earnings</TableHead>
                <TableHead className="text-right text-slate-400">Fare Gross</TableHead>
                <TableHead className="text-right">Driver Share</TableHead>
                <TableHead className="text-right">Fleet Share</TableHead>
                <TableHead className="text-center">Tier</TableHead>
                <TableHead className="text-right text-slate-400">Ledger Payouts</TableHead>
                {quotaEnabled && <TableHead className="text-right">Quota %</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPeriodData.map((row, idx) => (
                <TableRow
                  key={`${row.periodStart.getTime()}-${idx}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Earnings period ${formatPeriodLabel(row)}, ${row.tripCount} trips`}
                  aria-expanded={selectedRowIdx === idx}
                  onClick={() => setSelectedRowIdx(selectedRowIdx === idx ? null : idx)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRowIdx(selectedRowIdx === idx ? null : idx);
                    }
                  }}
                  className={`cursor-pointer transition-colors ${
                    selectedRowIdx === idx
                      ? 'bg-indigo-50 hover:bg-indigo-100'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <TableCell className="font-medium text-xs whitespace-nowrap">
                    {selectedRowIdx === idx && (
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1.5 align-middle" />
                    )}
                    {formatPeriodLabel(row)}
                  </TableCell>

                  <TableCell className="text-right text-slate-600 tabular-nums text-xs">
                    {row.tripCount > 0 ? row.tripCount : <span className="text-slate-300">—</span>}
                  </TableCell>

                  <TableCell className="text-right text-slate-700 font-medium tabular-nums">
                    {formatJMD(row.periodEarnings, 2)}
                  </TableCell>

                  <TableCell className="text-right text-slate-400 tabular-nums text-xs">
                    {formatJMD(row.grossRevenue, 2)}
                  </TableCell>

                  <TableCell className="text-right text-emerald-600">
                    <span className="font-medium">
                      {formatJMD(row.driverShare, 2)}
                    </span>
                    <Badge variant="outline" className="ml-1.5 text-[10px] px-1 py-0 bg-emerald-50 text-emerald-600 border-emerald-200">
                      {row.tier.sharePercentage}%
                    </Badge>
                  </TableCell>

                  <TableCell className="text-right text-slate-600 tabular-nums">
                    {row.fleetShare > 0.005
                      ? formatJMD(row.fleetShare, 2)
                      : <span className="text-slate-300">—</span>}
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ backgroundColor: row.tier.color ? `${row.tier.color}15` : undefined, borderColor: row.tier.color || undefined, color: row.tier.color || undefined }}
                      >
                        {row.tier.name}
                      </Badge>
                      {(row.policyName || row.policySource === 'legacy') && (
                        <span className="text-[9px] text-slate-400 max-w-[120px] truncate" title={row.policyName || 'Legacy prefs'}>
                          {row.policyName || 'Legacy prefs'}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="text-right text-slate-400 text-xs">
                    {row.payouts > 0
                      ? formatJMD(row.payouts, 2)
                      : '-'}
                  </TableCell>

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

        {hasNextPage && (
          <div className="flex justify-center pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShowMore}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading more…' : 'Show more history'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
