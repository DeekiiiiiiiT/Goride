import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Car, FileText } from 'lucide-react';
import { api } from '../../services/api';
import { StatementSummaryCard } from './StatementSummaryCard';
import type { StatementPlatform, StatementSummary } from '../../types/statementSummary';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { addIsoDays } from '@roam/finance-core';
import { formatMoney } from '@roam/ui/formatMoney';
import { cn } from '../ui/utils';
import { Skeleton } from '../ui/skeleton';
import { ledgerFetchErrorCopy } from '../../utils/ledgerRangeError';
import { formatUpdatedHhMm } from '../../utils/ledgerCursor';

type OpenTollReconOpts = { startYmd: string; endYmd: string };

const PLATFORM_TABS: { id: StatementPlatform | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'Uber', label: 'Uber' },
  { id: 'Roam', label: 'Roam' },
  { id: 'InDrive', label: 'InDrive' },
];

function hasActivity(row: StatementSummary): boolean {
  return Math.abs(row.totalEarnings) > 0.009
    || Math.abs(row.cashCollected) > 0.009
    || Math.abs(row.tollRefund ?? row.platformTollCredits ?? 0) > 0.009
    || (row.tripCount ?? 0) > 0;
}

function openTrips(platform: string, status?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('ledgerTab', 'trips');
  url.searchParams.set('platform', platform);
  url.searchParams.delete('page');
  if (status) url.searchParams.set('status', status);
  else url.searchParams.delete('status');
  // Keep the current page in history. A real popstate would read "/" as Dashboard.
  window.history.replaceState(window.history.state, '', url.toString());
  window.dispatchEvent(new Event('goride:ledger-nav'));
}

function tieLabel(row: StatementSummary): string {
  if (row.tieState === 'not_checked' || (row.tieState == null && row.bankSource === 'computed')) {
    return 'Not checked — no Uber deposit row';
  }
  if (row.tieState === 'off' || row.ties === false) return 'Off';
  return 'Ties';
}

export function PlatformStatementSummary({
  onOpenTollRecon,
}: {
  onOpenTollRecon?: (opts: OpenTollReconOpts) => void;
} = {}) {
  const { period } = useLedgerPeriod();
  const [activeTab, setActiveTab] = useState<StatementPlatform | 'all'>('Uber');
  const [scope, setScope] = useState<'fleet' | 'driver'>('fleet');
  const [driverId, setDriverId] = useState('');
  const startDate = period.startDate;
  const endDate = period.endDate;
  const prevStart = startDate ? addIsoDays(startDate, -7) : '';
  const prevEnd = endDate ? addIsoDays(endDate, -7) : '';
  const scopedDriver = scope === 'driver' && driverId ? driverId : undefined;

  const rosterQuery = useQuery({
    queryKey: ['drivers-roster', 'ledgers-statement'],
    queryFn: () => api.getDriversRoster(),
    staleTime: 60_000,
  });

  const statementQuery = useQuery({
    queryKey: ['statement-summary', 'ledgers', startDate, endDate, scopedDriver ?? 'fleet'],
    queryFn: () => api.getStatementSummary({
      platform: 'all',
      startDate,
      endDate,
      driverId: scopedDriver,
    }),
    enabled: Boolean(startDate && endDate),
    staleTime: 30_000,
  });

  const priorQuery = useQuery({
    queryKey: ['statement-summary', 'ledgers', prevStart, prevEnd, scopedDriver ?? 'fleet'],
    queryFn: () => api.getStatementSummary({
      platform: 'all',
      startDate: prevStart,
      endDate: prevEnd,
      driverId: scopedDriver,
    }),
    enabled: Boolean(prevStart && prevEnd),
    staleTime: 30_000,
  });

  const summaries = (statementQuery.data?.summaries ?? []) as StatementSummary[];
  const drivers = ((statementQuery.data as { drivers?: StatementSummary[] } | undefined)?.drivers ?? []) as StatementSummary[];
  const statementMeta = (statementQuery.data as {
    meta?: { weekClosed?: boolean; updatedAt?: string; last_entry_at?: string };
    updatedAt?: string;
  } | undefined);
  const weekClosed = Boolean(statementMeta?.meta?.weekClosed);
  const updatedLabel = formatUpdatedHhMm(
    statementMeta?.updatedAt || statementMeta?.meta?.updatedAt || statementMeta?.meta?.last_entry_at,
  );
  const imported = summaries.some((row) => row.importFileHash || row.importedAt);
  const reconciled = summaries.some((row) => row.platform === 'Uber' && row.tieState === 'ties');
  const priorRows = (priorQuery.data?.summaries ?? []) as StatementSummary[];
  const roster = rosterQuery.data?.data ?? [];
  const driverNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const driver of roster) {
      if (!driver.name) continue;
      names.set(driver.id, driver.name);
      if (driver.uberDriverId) names.set(driver.uberDriverId, driver.name);
      if (driver.inDriveDriverId) names.set(driver.inDriveDriverId, driver.name);
    }
    return names;
  }, [roster]);
  const visible = useMemo(
    () => summaries.filter((row) => activeTab === 'all' || row.platform === activeTab),
    [summaries, activeTab],
  );
  const active = visible.filter(hasActivity);
  const empty = visible.filter((row) => !hasActivity(row));

  const downloadCsv = () => {
    const lines = ['platform,line,amount'];
    for (const row of active) {
      lines.push(`${row.platform},Total earnings,${row.totalEarnings}`);
      lines.push(`${row.platform},Fare,${row.fare ?? ''}`);
      lines.push(`${row.platform},Cancellation,${row.cancellation ?? ''}`);
      lines.push(`${row.platform},Time at stop,${row.timeAtStop ?? ''}`);
      lines.push(`${row.platform},UberX Priority,${row.priority ?? ''}`);
      lines.push(`${row.platform},Wait time,${row.waitTime ?? ''}`);
      lines.push(`${row.platform},Tip,${row.tips}`);
      lines.push(`${row.platform},Toll refund,${row.tollRefund ?? row.platformTollCredits ?? ''}`);
      lines.push(`${row.platform},Cash collected,${row.cashCollected}`);
      lines.push(`${row.platform},Net earnings,${row.netEarnings ?? row.bankTransfer}`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `statement-${startDate}-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!startDate || !endDate) {
    return <p className="text-sm text-slate-500">Choose a statement week to see earnings.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Statement platform" className="flex gap-1">
          {PLATFORM_TABS.map((tab, index) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm',
                activeTab === tab.id ? 'bg-slate-900 text-white' : 'text-slate-600',
              )}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const next = e.key === 'ArrowRight'
                  ? (index + 1) % PLATFORM_TABS.length
                  : (index - 1 + PLATFORM_TABS.length) % PLATFORM_TABS.length;
                setActiveTab(PLATFORM_TABS[next].id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Statement scope" className="flex gap-1">
            <button type="button" aria-pressed={scope === 'fleet'} className={cn('rounded-md px-3 py-1.5 text-sm', scope === 'fleet' ? 'bg-slate-900 text-white' : 'text-slate-600')} onClick={() => setScope('fleet')}>Fleet</button>
            <button type="button" aria-pressed={scope === 'driver'} className={cn('rounded-md px-3 py-1.5 text-sm', scope === 'driver' ? 'bg-slate-900 text-white' : 'text-slate-600')} onClick={() => setScope('driver')}>Driver</button>
          </div>
          {scope === 'driver' && (
            <select
              aria-label="Driver"
              className="rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
            >
              <option value="">Choose a driver</option>
              {roster.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name || driver.id}</option>
              ))}
            </select>
          )}
          {imported && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">Imported</span>}
          {reconciled && <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-800">Reconciled</span>}
          {weekClosed && <span className="rounded-full bg-slate-900 px-2 py-1 text-xs text-white">Closed</span>}
          <button type="button" className="text-sm text-indigo-700 underline" onClick={downloadCsv}>
            Download statement (CSV)
          </button>
          <button type="button" className="text-sm text-indigo-700 underline" onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </div>

      {statementQuery.isLoading && (
        <div className="space-y-3" aria-busy="true" aria-label="Loading statement">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      )}

      {statementQuery.isError && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {ledgerFetchErrorCopy(statementQuery.error, 'Failed to load statement summary')}
          </span>
          <button type="button" className="underline" onClick={() => void statementQuery.refetch()}>Retry</button>
        </div>
      )}

      {updatedLabel && !statementQuery.isLoading && (
        <p className="text-xs text-slate-500">Updated {updatedLabel}</p>
      )}

      <div className="grid gap-4">
        {active.map((row) => {
          const prior = priorRows.find((item) => item.platform === row.platform);
          const deltas = prior ? {
            earnings: (row.totalEarnings || 0) - (prior.totalEarnings || 0),
            net: (row.netEarnings ?? row.bankTransfer) - (prior.netEarnings ?? prior.bankTransfer),
            trips: (row.tripCount ?? 0) - (prior.tripCount ?? 0),
          } : null;
          return (
          <StatementSummaryCard
            key={row.platform}
            summary={row}
            deltas={deltas}
            onOpenTollRecon={() => onOpenTollRecon?.({ startYmd: startDate, endYmd: endDate })}
            onOpenLine={(line) => {
              if (line === 'toll') onOpenTollRecon?.({ startYmd: startDate, endYmd: endDate });
              else if (line === 'cancellation') openTrips(row.platform, 'Cancelled');
              else openTrips(row.platform);
            }}
          />
          );
        })}
        {empty.map((row) => (
          <p key={row.platform} className="text-sm text-slate-500">
            No {row.platform} activity this week
          </p>
        ))}
      </div>

      {drivers.length > 0 && (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2">Driver</th>
                <th className="px-3 py-2">Platform</th>
                <th className="px-3 py-2 text-right">Earnings</th>
                <th className="px-3 py-2 text-right">Cash</th>
                <th className="px-3 py-2 text-right">Net</th>
                <th className="px-3 py-2">Tie-out</th>
              </tr>
            </thead>
            <tbody>
              {drivers
                .filter((row) => activeTab === 'all' || row.platform === activeTab)
                .filter(hasActivity)
                .map((row) => (
                  <tr key={`${row.driverId}-${row.platform}`} className="border-t border-slate-100">
                    <td className="px-3 py-2">{row.driverName || driverNameById.get(row.driverId ?? '') || row.driverId}</td>
                    <td className="px-3 py-2">{row.platform}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.totalEarnings)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.cashCollected)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.netEarnings ?? row.bankTransfer)}</td>
                    <td className="px-3 py-2">{tieLabel(row)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {!statementQuery.isLoading && active.length === 0 && empty.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <FileText className="h-4 w-4" /> No statement for this week yet.
        </p>
      )}
      <p className="flex items-center gap-1 text-xs text-slate-400">
        <Car className="h-3.5 w-3.5" /> Week {startDate} to {endDate}
      </p>
    </div>
  );
}
