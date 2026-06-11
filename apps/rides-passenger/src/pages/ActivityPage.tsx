import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
import type { ActivityPipelineItem, ActivityTripCategory, ActivityTripHistoryItem } from '@roam/types/rides';
import { ActivityPipelineBlocks } from '@/components/activity/ActivityPipelineBlocks';
import { ActivityPipelineSheet } from '@/components/activity/ActivityPipelineSheet';
import { ActivityTripRow } from '@/components/activity/ActivityTripRow';
import { useActivityTrips } from '@/hooks/useActivityTrips';
import { useActivityUpcoming } from '@/hooks/useActivityUpcoming';
import { navigateToActivityTrip } from '@/lib/activityTripNavigation';
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

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'for_others', label: 'Booked for others' },
  { key: 'for_me', label: 'For me' },
];

function ActivityTripSkeleton() {
  return (
    <div className="space-y-2 px-4 py-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[4.25rem] animate-pulse rounded-2xl"
          style={{ backgroundColor: 'var(--passenger-surface-low)' }}
        />
      ))}
    </div>
  );
}

export default function ActivityPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [pipelineItem, setPipelineItem] = useState<ActivityPipelineItem | null>(null);
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

  const trips = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.trips) ?? [];
    if (filter === 'all') return all;
    return all.filter((trip) => trip.trip_category === filter);
  }, [data?.pages, filter]);

  const windowDays = data?.pages[0]?.window_days ?? ACTIVITY_HISTORY_WINDOW_DAYS;

  const openTrip = (trip: ActivityTripHistoryItem) => {
    navigateToActivityTrip(navigate, trip);
  };

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
          Activity
        </h1>
        <button
          type="button"
          onClick={refreshAll}
          disabled={isFetching || upcomingQuery.isFetching}
          className="rounded-full p-2 transition-colors active:scale-95 disabled:opacity-50"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-label="Refresh activity"
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
              Recent trips
            </h2>
          </div>
          <p className="mb-3 text-[12px]" style={{ color: ON_SURFACE_VARIANT }}>
            Last {windowDays} days
          </p>

          <div
            className="mb-4 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Filter trips"
          >
            {FILTERS.map(({ key, label }) => {
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

          <div
            className="overflow-hidden rounded-[20px]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          >
            {isLoading ? (
              <ActivityTripSkeleton />
            ) : isError ? (
              <div className="space-y-3 px-4 py-8 text-center">
                <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                  {error instanceof Error ? error.message : 'Could not load trips'}
                </p>
                <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                  If this persists, redeploy the rides edge function.
                </p>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="text-sm font-semibold"
                  style={{ color: PRIMARY }}
                >
                  Try again
                </button>
              </div>
            ) : trips.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                No trips in the last {windowDays} days
              </p>
            ) : (
              <ul role="list" className="divide-y" style={{ borderColor: OUTLINE_VARIANT }}>
                {trips.map((trip) => (
                  <li key={trip.ride_id}>
                    <ActivityTripRow trip={trip} onOpen={openTrip} />
                  </li>
                ))}
              </ul>
            )}

            {hasNextPage ? (
              <div className="border-t px-4 py-3" style={{ borderColor: OUTLINE_VARIANT }}>
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ color: PRIMARY }}
                >
                  {isFetchingNextPage ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </section>
      </main>

      <ActivityPipelineSheet item={pipelineItem} onClose={() => setPipelineItem(null)} />
    </div>
  );
}
