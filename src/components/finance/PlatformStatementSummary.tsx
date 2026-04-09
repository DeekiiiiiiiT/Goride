import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Calendar, 
  Loader2, 
  AlertCircle, 
  RefreshCw,
  Car,
  FileText,
  Users,
  User,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { format, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subMonths } from 'date-fns';
import { api } from '../../services/api';
import { StatementSummaryCard, StatementTooltipIcon, STATEMENT_HELP } from './StatementSummaryCard';
import { StatementSummary, StatementPlatform } from '../../types/statementSummary';
import { cn } from '../ui/utils';
import { PeriodWeekDropdown } from '../ui/PeriodWeekDropdown';
import { generatePeriodWeekOptions, type PeriodWeekOption } from '../../utils/periodWeekOptions';

type DatePreset = 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'last30Days' | 'custom';

const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'thisWeek', label: 'This Week' },
  { id: 'lastWeek', label: 'Last Week' },
  { id: 'thisMonth', label: 'This Month' },
  { id: 'lastMonth', label: 'Last Month' },
  { id: 'last30Days', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom' },
];

function getDateRange(preset: DatePreset, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const today = new Date();
  
  switch (preset) {
    case 'thisWeek':
      return {
        startDate: format(startOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        endDate: format(endOfWeek(today, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
      };
    case 'lastWeek': {
      const lastWeekStart = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
      return {
        startDate: format(lastWeekStart, 'yyyy-MM-dd'),
        endDate: format(subDays(startOfWeek(today, { weekStartsOn: 1 }), 1), 'yyyy-MM-dd'),
      };
    }
    case 'thisMonth':
      return {
        startDate: format(startOfMonth(today), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
      };
    case 'lastMonth': {
      const lastMonth = subMonths(today, 1);
      return {
        startDate: format(startOfMonth(lastMonth), 'yyyy-MM-dd'),
        endDate: format(endOfMonth(lastMonth), 'yyyy-MM-dd'),
      };
    }
    case 'last30Days':
      return {
        startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
        endDate: format(today, 'yyyy-MM-dd'),
      };
    case 'custom':
      return {
        startDate: customStart || format(subDays(today, 30), 'yyyy-MM-dd'),
        endDate: customEnd || format(today, 'yyyy-MM-dd'),
      };
    default:
      return {
        startDate: format(subDays(today, 30), 'yyyy-MM-dd'),
        endDate: format(today, 'yyyy-MM-dd'),
      };
  }
}

const PLATFORM_TABS: { id: StatementPlatform | 'all'; label: string; icon: React.ElementType }[] = [
  { id: 'all', label: 'All Platforms', icon: FileText },
  { id: 'Uber', label: 'Uber', icon: Car },
  { id: 'Roam', label: 'Roam', icon: Car },
  { id: 'InDrive', label: 'InDrive', icon: Car },
];

type SummaryScope = 'fleet' | 'driver';

export function PlatformStatementSummary() {
  const [activeTab, setActiveTab] = useState<StatementPlatform | 'all'>('all');
  const [summaryScope, setSummaryScope] = useState<SummaryScope>('fleet');
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const weekPeriodOptions = useMemo(() => generatePeriodWeekOptions(12), []);

  const { startDate, endDate } = useMemo(() => {
    if (selectedPeriodId) {
      const period = weekPeriodOptions.find((p) => p.id === selectedPeriodId);
      if (period) return { startDate: period.startDate, endDate: period.endDate };
    }
    return getDateRange(datePreset, customStartDate, customEndDate);
  }, [datePreset, customStartDate, customEndDate, selectedPeriodId, weekPeriodOptions]);

  const handlePeriodSelect = (period: PeriodWeekOption) => {
    setSelectedPeriodId(period.id);
  };

  const handlePresetClick = (presetId: DatePreset) => {
    setDatePreset(presetId);
    setSelectedPeriodId(null); // Clear period selection when preset is clicked
  };

  const { data: driversList } = useQuery({
    queryKey: ['drivers', 'statement-summary-scope'],
    queryFn: () => api.getDrivers(),
    staleTime: 60_000,
  });

  const driversSorted = useMemo(() => {
    const raw = Array.isArray(driversList) ? driversList : [];
    return [...raw].sort((a: { name?: string }, b: { name?: string }) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
    );
  }, [driversList]);

  const driverFilterReady =
    summaryScope === 'fleet' || (summaryScope === 'driver' && selectedDriverId.trim().length > 0);

  const { 
    data, 
    isLoading, 
    error, 
    refetch,
    isFetching 
  } = useQuery({
    queryKey: [
      'statement-summary',
      activeTab,
      startDate,
      endDate,
      summaryScope,
      summaryScope === 'driver' ? selectedDriverId : null,
    ],
    queryFn: async () => {
      const response = await api.getStatementSummary({
        platform: activeTab === 'all' ? 'all' : activeTab,
        startDate,
        endDate,
        ...(summaryScope === 'driver' && selectedDriverId.trim()
          ? { driverId: selectedDriverId.trim() }
          : {}),
      });
      return response;
    },
    enabled: driverFilterReady,
    staleTime: 30000,
  });

  const summaries = data?.summaries || [];

  const filteredSummaries = activeTab === 'all' 
    ? summaries 
    : summaries.filter(s => s.platform === activeTab);

  const hasSummaryData = (summary: StatementSummary) => {
    return summary.totalEarnings > 0 || 
           summary.totalPayout > 0 || 
           summary.tolls > 0 ||
           (summary.tripCount && summary.tripCount > 0);
  };

  return (
    <div className="space-y-4">
      {/* Header with Date Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Statement Summary
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {summaryScope === 'fleet'
              ? 'Fleet: all drivers in range — breakdown by platform'
              : 'Driver: ledger rows for this driver (Roam + linked platform IDs)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Date Preset Buttons */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {DATE_PRESETS.slice(0, -1).map(preset => (
              <button
                key={preset.id}
                onClick={() => handlePresetClick(preset.id)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  datePreset === preset.id && !selectedPeriodId
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Fleet vs driver scope */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/40">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
          <button
            type="button"
            onClick={() => setSummaryScope('fleet')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              summaryScope === 'fleet'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900',
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Fleet
          </button>
          <button
            type="button"
            onClick={() => setSummaryScope('driver')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              summaryScope === 'driver'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900',
            )}
          >
            <User className="h-3.5 w-3.5" />
            Driver
          </button>
        </div>
        {summaryScope === 'driver' && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 flex-1 sm:max-w-md">
            <span className="text-xs text-slate-500 shrink-0">Driver</span>
            <Select value={selectedDriverId || undefined} onValueChange={setSelectedDriverId}>
              <SelectTrigger className="w-full sm:min-w-[220px] bg-white dark:bg-slate-900">
                <SelectValue placeholder="Select a driver" />
              </SelectTrigger>
              <SelectContent>
                {driversSorted.map((d: { id: string; name?: string }) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name || d.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Custom Date Range (when custom preset is selected) */}
      {datePreset === 'custom' && (
        <div className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
          <Calendar className="h-4 w-4 text-slate-500" />
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
            />
          </div>
        </div>
      )}

      {/* Week period picker (matches Trip Analytics / Driver detail) */}
      <PeriodWeekDropdown
        selectedStart={startDate}
        selectedEnd={endDate}
        onSelect={handlePeriodSelect}
        placeholder="Select week period"
        className="w-full sm:w-auto"
        buttonClassName="w-full sm:w-auto min-h-[40px] px-4 py-2 text-sm justify-between"
      />

      {/* Platform Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {PLATFORM_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const summary = summaries.find(s => s.platform === tab.id);
          const hasData = tab.id === 'all' 
            ? summaries.some(hasSummaryData)
            : summary ? hasSummaryData(summary) : false;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                isActive
                  ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300'
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {!hasData && tab.id !== 'all' && (
                <span className="text-xs text-slate-400">(no data)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {summaryScope === 'driver' && !selectedDriverId.trim() ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
          <User className="h-10 w-10 mb-3 text-slate-300" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Select a driver</p>
          <p className="text-xs text-slate-500 mt-1 text-center max-w-sm">
            Choose a driver above to see Uber, Roam, and InDrive totals for this period.
          </p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-12 text-red-500">
          <AlertCircle className="h-5 w-5 mr-2" />
          <span>Failed to load statement summary</span>
        </div>
      ) : filteredSummaries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-500">
          <FileText className="h-12 w-12 mb-4 text-slate-300" />
          <p className="text-lg font-medium">No statement data</p>
          <p className="text-sm">No earnings recorded for this period</p>
        </div>
      ) : activeTab === 'all' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {filteredSummaries.map(summary => (
            <StatementSummaryCard 
              key={summary.platform} 
              summary={summary}
              defaultExpanded={false}
              showUberDriverScopePayoutNote={summaryScope === 'driver'}
            />
          ))}
        </div>
      ) : (
        <div className="max-w-xl">
          {filteredSummaries.map(summary => (
            <StatementSummaryCard 
              key={summary.platform} 
              summary={summary}
              defaultExpanded={true}
              showUberDriverScopePayoutNote={summaryScope === 'driver'}
            />
          ))}
        </div>
      )}

      {/* Summary Totals (fleet only — driver view is not a fleet rollup) */}
      {summaryScope === 'fleet' && activeTab === 'all' && filteredSummaries.length > 0 && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800">
          <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">
            Combined Totals
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="mb-0.5 flex items-center gap-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Earnings</p>
                <StatementTooltipIcon content={STATEMENT_HELP.combinedTotalEarnings} />
              </div>
              <p className="text-lg font-bold text-emerald-600">
                ${filteredSummaries.reduce((sum, s) => sum + s.totalEarnings, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <div className="mb-0.5 flex items-center gap-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Total Expenses</p>
                <StatementTooltipIcon content={STATEMENT_HELP.combinedTotalExpenses} />
              </div>
              <p className="text-lg font-bold text-red-600">
                ${filteredSummaries.reduce((sum, s) => sum + s.totalRefundsExpenses, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <div className="mb-0.5 flex items-center gap-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Cash Collected</p>
                <StatementTooltipIcon content={STATEMENT_HELP.combinedCashCollected} />
              </div>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                ${filteredSummaries.reduce((sum, s) => sum + s.cashCollected, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <div className="mb-0.5 flex items-center gap-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide">Bank Transfer</p>
                <StatementTooltipIcon content={STATEMENT_HELP.combinedBankTransfer} />
              </div>
              <p className="text-lg font-bold text-slate-700 dark:text-slate-300">
                ${filteredSummaries.reduce((sum, s) => sum + s.bankTransfer, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
