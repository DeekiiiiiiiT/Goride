import React, { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import type { ActivityPipelineItem, ActivityTripCategory, ActivityTripHistoryItem } from '@roam/types/rides';
import { ActivityPipelineBlocks } from '@/components/activity/ActivityPipelineBlocks';
import { ActivityPipelineSheet } from '@/components/activity/ActivityPipelineSheet';
import { ActivityTripDetailsSheet } from '@/components/activity/ActivityTripDetailsSheet';
import { ActivityTripRow } from '@/components/activity/ActivityTripRow';
import { useActivityTrips } from '@/hooks/useActivityTrips';
import { useActivityUpcoming } from '@/hooks/useActivityUpcoming';
import { useScheduledRideReminders } from '@/hooks/useScheduledRideReminders';
import { ACTIVITY_HISTORY_WINDOW_DAYS } from '@/services/activityEdge';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type FilterKey = 'all' | ActivityTripCategory;

function ActivityTripSkeleton() {
  return (
    <div className="space-y-2.5">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[7.5rem] animate-pulse rounded-[20px]"
          style={{ backgroundColor: 'var(--passenger-surface-low)' }}
        />
      ))}
    </div>
  );
}

export default function ActivityPage() {
  const { t } = useTranslation('activity');
  const { t: tc } = useTranslation('common');
  const location = useLocation();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [pipelineItem, setPipelineItem] = useState<ActivityPipelineItem | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<ActivityTripHistoryItem | null>(null);

  const filters = useMemo(
    () =>
      [
        { key: 'all' as const, label: t('filters.all') },
        { key: 'for_others' as const, label: t('filters.forOthers') },
        { key: 'for_me' as const, label: t('filters.forMe') },
      ] satisfies { key: FilterKey; label: string }[],
    [t],
  );

  const upcomingQuery = useActivityUpcoming();
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useActivityTrips();

  const pipelineItems = upcomingQuery.data?.items ?? [];
  useScheduledRideReminders(pipelineItems.some((item) => item.kind === 'schedule'));

  useEffect(() => {
    const scheduledRideId = (location.state as { scheduledRideId?: string } | null)?.scheduledRideId;
    if (!scheduledRideId || pipelineItems.length === 0) return;
    const match = pipelineItems.find((item) => item.id === scheduledRideId);
    if (match) setPipelineItem(match);
  }, [location.state, pipelineItems]);

  const trips = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.trips) ?? [];
    if (filter === 'all') return all;
    return all.filter((trip) => trip.trip_category === filter);
  }, [data?.pages, filter]);

  const windowDays = data?.pages[0]?.window_days ?? ACTIVITY_HISTORY_WINDOW_DAYS;

  const refreshAll = () => {
    void refetch();
    void upcomingQuery.refetch();
  };

  return (
    <div
      className="flex min-h-[100dvh] flex-col pb-28"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header
        className="sticky top-0 z-50 flex h-16 w-full items-center justify-between px-5 shadow-sm safe-t"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: PRIMARY }}>
          {t('title')}
        </h1>
        <button
          type="button"
          onClick={refreshAll}
          disabled={isFetching || upcomingQuery.isFetching}
          className="rounded-full p-2 transition-colors active:scale-95 disabled:opacity-50"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-label={t('refreshAria')}
        >
          <RefreshCw
            className={`h-5 w-5 ${isFetching || upcomingQuery.isFetching ? 'animate-spin' : ''}`}
            aria-hidden
          />
        </button>
      </header>

      <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 py-6 safe-x">
        <ActivityPipelineBlocks
          items={pipelineItems}
          onSelect={setPipelineItem}
        />

        <section aria-labelledby="activity-recent-heading">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 id="activity-recent-heading" className="text-base font-semibold" style={{ color: ON_SURFACE }}>
              {t('recentTrips')}
            </h2>
          </div>
          <p className="mb-3 text-[12px]" style={{ color: ON_SURFACE_VARIANT }}>
            {t('lastDays', { days: windowDays })}
          </p>

          <div
            className="mb-4 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label={t('filterAria')}
          >
            {filters.map(({ key, label }) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(key)}
                  className="shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? PRIMARY : SURFACE_LOWEST,
                    color: active ? 'var(--passenger-on-primary)' : ON_SURFACE_VARIANT,
                    border: active ? 'none' : `1px solid ${OUTLINE_VARIANT}`,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <ActivityTripSkeleton />
          ) : isError ? (
            <div
              className="space-y-3 rounded-[20px] px-4 py-8 text-center"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            >
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                {error instanceof Error ? error.message : t('loadError')}
              </p>
              <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                {t('loadErrorHint')}
              </p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-sm font-semibold"
                style={{ color: PRIMARY }}
              >
                {t('tryAgain')}
              </button>
            </div>
          ) : trips.length === 0 ? (
            <p
              className="rounded-[20px] px-4 py-10 text-center text-sm"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: ON_SURFACE_VARIANT }}
            >
              {t('noTrips', { days: windowDays })}
            </p>
          ) : (
            <ul role="list" className="space-y-2.5">
              {trips.map((trip) => (
                <li key={trip.ride_id}>
                  <ActivityTripRow trip={trip} onOpen={setSelectedTrip} />
                </li>
              ))}
            </ul>
          )}

          {hasNextPage ? (
            <button
              type="button"
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{ color: PRIMARY }}
            >
              {isFetchingNextPage ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  {tc('loading')}
                </>
              ) : (
                t('loadMore')
              )}
            </button>
          ) : null}
        </section>
      </main>

      <ActivityPipelineSheet
        item={pipelineItem}
        onClose={() => setPipelineItem(null)}
        onCancelled={() => void upcomingQuery.refetch()}
      />
      <ActivityTripDetailsSheet trip={selectedTrip} onClose={() => setSelectedTrip(null)} />
    </div>
  );
}
