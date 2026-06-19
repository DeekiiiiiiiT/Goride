import React, { useMemo, useState } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { useHaulEarnings } from '../../hooks/useHaulEarnings';
import { useHaulTrips } from '../../hooks/useHaulTrips';
import {
  filterTripsByPeriod,
  formatOnlineDuration,
  periodToApi,
  type HaulEarningsPeriod,
} from '../../utils/haulEarningsFormat';
import { HaulEarningsHistoryCard, HaulEarningsTripCard } from './HaulEarningsTripCard';
import { HaulPullToRefresh } from '../ui/HaulPullToRefresh';
import { HaulEarningsSummarySkeleton, HaulTripCardSkeleton } from '../ui/HaulSkeleton';
import { HaulErrorState } from '../ui/HaulErrorState';
import { HaulEmptyState } from '../ui/HaulEmptyState';

type Filter = 'all' | 'completed' | 'cancelled';

type Props = {
  onSelectTrip: (trip: RideRequestRow) => void;
  onOpenPayouts?: () => void;
  onOpenBonuses?: () => void;
};

const PERIOD_TABS: { id: HaulEarningsPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

const WEEKLY_BARS = [40, 60, 85, 30, 70];

export function HaulEarningsPage({ onSelectTrip, onOpenPayouts, onOpenBonuses }: Props) {
  const [period, setPeriod] = useState<HaulEarningsPeriod>('today');
  const [filter, setFilter] = useState<Filter>('all');
  const { data: summary, loading: summaryLoading, error: summaryError, refresh: refreshSummary } = useHaulEarnings(periodToApi(period));
  const { trips, loading: tripsLoading, error: tripsError, refresh: refreshTrips } = useHaulTrips();

  const filtered = useMemo(() => {
    let list = filterTripsByPeriod(trips, period);
    if (filter === 'completed') list = list.filter((t) => t.status === 'completed');
    if (filter === 'cancelled') list = list.filter((t) => t.status === 'cancelled');
    return list.sort((a, b) => {
      const at = new Date(b.completed_at ?? b.updated_at).getTime();
      const bt = new Date(a.completed_at ?? a.updated_at).getTime();
      return at - bt;
    });
  }, [trips, period, filter]);

  const currency = summary?.currency ?? 'JMD';
  const totalLabel = summary
    ? formatMoneyMinor(summary.total_minor, currency)
    : summaryLoading
      ? '—'
      : formatMoneyMinor(0, currency);

  const totalKm = filtered.reduce((sum, t) => sum + (t.distance_estimate_km ?? 0), 0);
  const todayLabel = new Date().toLocaleDateString([], { month: 'short', day: 'numeric' });

  const handleRefresh = async () => {
    await Promise.all([refreshSummary(), refreshTrips()]);
  };

  const listError = summaryError ?? tripsError;

  return (
    <HaulPullToRefresh onRefresh={handleRefresh} className="flex flex-col gap-6 pb-4">
      <div>
        <h1 className="text-3xl font-bold text-[#dae2fd]">Earnings</h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {onOpenPayouts ? (
            <button
              type="button"
              onClick={onOpenPayouts}
              className="flex items-center gap-1 rounded-full border border-[#534434] bg-[#171f33] px-3 py-1.5 text-sm text-[#d8c3ad] hover:border-[#ffc174] hover:text-[#ffc174]"
            >
              <span className="material-symbols-outlined text-base">account_balance</span>
              Payout Settings
            </button>
          ) : null}
          {onOpenBonuses ? (
            <button
              type="button"
              onClick={onOpenBonuses}
              className="flex items-center gap-1 rounded-full border border-[#534434] bg-[#171f33] px-3 py-1.5 text-sm text-[#d8c3ad] hover:border-[#ffc174] hover:text-[#ffc174]"
            >
              <span className="material-symbols-outlined text-base">local_fire_department</span>
              Bonuses
            </button>
          ) : null}
        </div>
        <div className="mt-4 flex max-w-sm rounded-lg border border-[#534434] bg-[#171f33] p-1">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                period === tab.id
                  ? 'bg-[#2d3449] text-[#ffc174]'
                  : 'text-[#d8c3ad] hover:text-[#dae2fd]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {listError ? (
        <HaulErrorState message={listError} onRetry={() => void handleRefresh()} />
      ) : null}

      {period === 'today' ? (
        <>
          <section>
            <h2 className="mb-2 text-lg font-semibold text-[#d8c3ad]">Today, {todayLabel}</h2>
            {summaryLoading ? (
              <HaulEarningsSummarySkeleton />
            ) : (
            <div className="relative overflow-hidden rounded-xl border border-[#534434] bg-[#171f33] p-6">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-[#ffc174]/10 blur-2xl" />
              <p className="mb-1 text-xs tracking-widest text-[#d8c3ad] uppercase">Total Earned</p>
              <p className="text-5xl font-extrabold text-[#ffc174]">{totalLabel}</p>
              <div className="mt-4 flex gap-4">
                <div className="flex min-w-[80px] flex-col items-center rounded-lg border border-[#534434] bg-[#0b1326] p-2">
                  <span className="text-2xl font-bold text-[#dae2fd]">{summary?.trip_count ?? filtered.length}</span>
                  <span className="text-xs text-[#d8c3ad]">Jobs</span>
                </div>
                <div className="flex min-w-[80px] flex-col items-center rounded-lg border border-[#534434] bg-[#0b1326] p-2">
                  <span className="text-2xl font-bold text-[#dae2fd]">{Math.round(totalKm)}</span>
                  <span className="text-xs text-[#d8c3ad]">km</span>
                </div>
                <div className="flex min-w-[80px] flex-col items-center rounded-lg border border-[#534434] bg-[#0b1326] p-2">
                  <span className="text-xl font-bold text-[#dae2fd]">{formatOnlineDuration(392)}</span>
                  <span className="text-xs text-[#d8c3ad]">Online</span>
                </div>
              </div>
            </div>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-lg font-semibold text-[#dae2fd]">Today&apos;s Jobs</h3>
            {tripsLoading ? (
              <div className="flex flex-col gap-2">
                <HaulTripCardSkeleton />
                <HaulTripCardSkeleton />
              </div>
            ) : filtered.length === 0 ? (
              <HaulEmptyState
                icon="payments"
                title="No earnings yet"
                description="Completed jobs for today will show up here."
              />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((trip) => (
                  <HaulEarningsTripCard key={trip.id} trip={trip} onSelect={onSelectTrip} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-[#2d3449] bg-[#171f33] p-6">
              <span className="text-xs tracking-wider text-[#d8c3ad] uppercase">Total Earnings</span>
              <div className="mt-1 flex items-end gap-2">
                <span className="text-5xl font-bold text-[#ffc174]">{totalLabel}</span>
                <span className="mb-1 flex items-center text-sm text-[#30c88f]">
                  <span className="material-symbols-outlined text-base">arrow_upward</span>
                  12%
                </span>
              </div>
              <p className="mt-2 text-sm text-[#d8c3ad]">vs previous period</p>
            </div>
            <div className="rounded-xl border border-[#2d3449] bg-[#171f33] p-4 md:col-span-2">
              <span className="text-xs tracking-wider text-[#d8c3ad] uppercase">Weekly Breakdown</span>
              <div className="mt-4 flex h-40 items-end justify-between gap-2 border-b border-[#2d3449] pb-2">
                {WEEKLY_BARS.map((h, i) => (
                  <div
                    key={i}
                    className={`w-full rounded-t-sm transition-colors ${i === 2 ? 'bg-[#ffc174]/80' : 'bg-[#2d3449]'}`}
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between text-xs text-[#d8c3ad]">
                {['W1', 'W2', 'W3', 'W4', 'W5'].map((w, i) => (
                  <span key={w} className={i === 2 ? 'font-bold text-[#ffc174]' : undefined}>
                    {w}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {(['all', 'completed', 'cancelled'] as Filter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm capitalize ${
                    filter === f
                      ? 'border-[#ffc174] bg-[#ffc174]/10 text-[#ffc174]'
                      : 'border-[#534434] bg-[#171f33] text-[#d8c3ad]'
                  }`}
                >
                  {f === 'all' ? 'All Jobs' : f}
                </button>
              ))}
            </div>
            {tripsLoading ? (
              <div className="flex flex-col gap-2">
                <HaulTripCardSkeleton />
                <HaulTripCardSkeleton />
              </div>
            ) : filtered.length === 0 ? (
              <HaulEmptyState icon="history" title="No trips in this period" description="Try a different filter or period." />
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map((trip) => (
                  <HaulEarningsHistoryCard key={trip.id} trip={trip} onSelect={onSelectTrip} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </HaulPullToRefresh>
  );
}
