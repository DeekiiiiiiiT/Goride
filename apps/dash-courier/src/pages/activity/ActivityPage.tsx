import React, { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from '@/lib/toast';
import {
  formatJmd,
  groupHistoryByDate,
  MOCK_ACTIVE_DELIVERY_SUMMARY,
  MOCK_ACTIVITY_HISTORY,
  type ActivityTab,
  type HistoryFilter,
  type HistoryDelivery,
} from '@/lib/mockActivity';

type ActivityPageProps = {
  initialTab?: ActivityTab;
  embedded?: boolean;
  hasActiveDelivery?: boolean;
  onBack?: () => void;
  onDeliverySelect: (deliveryId: string) => void;
  onViewActiveDelivery?: () => void;
};

const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'cancelled', label: 'Cancelled' },
];

function HistoryCard({
  delivery,
  onSelect,
}: {
  delivery: HistoryDelivery;
  onSelect: () => void;
}) {
  const cancelled = delivery.status === 'cancelled';

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={cancelled}
      className={`bg-surface rounded-xl p-4 shadow-soft w-full text-left active:bg-surface-container-low transition-colors ${
        cancelled ? 'opacity-75' : ''
      }`}
    >
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-4 items-center min-w-0">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center shrink-0 ${
              cancelled ? 'bg-surface-container-low text-muted' : 'bg-surface-container-low text-primary'
            }`}
          >
            <MaterialIcon name={delivery.icon} filled />
          </div>
          <div className="min-w-0">
            <h4
              className={`text-base font-semibold text-on-surface truncate ${
                cancelled ? 'line-through decoration-muted' : ''
              }`}
            >
              {delivery.restaurant}
            </h4>
            <p className="text-sm text-muted">
              {delivery.time} • {delivery.dropoff}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`text-base font-semibold block ${
              cancelled ? 'text-muted line-through' : 'text-primary'
            }`}
          >
            J${formatJmd(delivery.amount)}
          </span>
          <span
            className={`text-[11px] flex items-center justify-end gap-1 mt-1 ${
              cancelled ? 'text-error' : 'text-success'
            }`}
          >
            <MaterialIcon
              name={cancelled ? 'cancel' : 'check_circle'}
              className="text-sm"
              filled={!cancelled}
            />
            {cancelled ? 'Cancelled' : 'Completed'}
          </span>
        </div>
      </div>
    </button>
  );
}

export function ActivityPage({
  initialTab = 'current',
  embedded = false,
  hasActiveDelivery = true,
  onBack,
  onDeliverySelect,
  onViewActiveDelivery,
}: ActivityPageProps) {
  const [tab, setTab] = useState<ActivityTab>(initialTab);
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const { refreshing, scrollRef, handleTouchStart, handleTouchEnd } = usePullToRefresh({
    onRefresh: async () => {
      await new Promise((r) => window.setTimeout(r, 800));
      toast.success('Activity updated');
    },
  });

  const active = MOCK_ACTIVE_DELIVERY_SUMMARY;
  const groupedHistory = useMemo(
    () => groupHistoryByDate(MOCK_ACTIVITY_HISTORY, filter),
    [filter],
  );

  const isEmptyHistory = tab === 'history' && groupedHistory.length === 0;

  const shellClass = embedded
    ? 'min-h-full flex flex-col pb-24'
    : 'fixed inset-0 z-[65] bg-background flex flex-col';

  return (
    <div className={shellClass}>
      <header className="w-full sticky top-0 bg-surface shadow-soft z-40 pt-safe shrink-0">
        <div className="flex justify-between items-center h-16 px-[var(--spacing-edge)]">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Go back"
              className="p-2 rounded-full text-primary hover:bg-surface-container-low active:scale-95 -ml-2"
            >
              <MaterialIcon name="arrow_back" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Menu"
              className="p-2 rounded-full text-primary hover:bg-surface-container-low active:scale-95 -ml-2"
            >
              <MaterialIcon name="menu" />
            </button>
          )}
          <h1 className="text-xl font-bold text-primary flex-1 text-center">Activity</h1>
          <button
            type="button"
            aria-label="Notifications"
            className="p-2 rounded-full text-primary hover:bg-surface-container-low active:scale-95 -mr-2"
          >
            <MaterialIcon name="notifications" />
          </button>
        </div>
      </header>

      <PullToRefresh
        refreshing={refreshing}
        scrollRef={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex-1 overflow-y-auto pb-8 pt-2 px-[var(--spacing-edge)] flex flex-col gap-6"
      >
        <div className="flex bg-surface-container-low p-1 rounded-lg">
          {(['current', 'history'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex-1 py-2 text-center text-xs font-semibold uppercase tracking-wide rounded-md transition-all ${
                tab === id ? 'bg-surface text-primary shadow-sm' : 'text-muted hover:text-on-surface'
              }`}
            >
              {id === 'current' ? 'Current' : 'History'}
            </button>
          ))}
        </div>

        {tab === 'current' && (
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-semibold text-on-surface">Active Delivery</h2>
            {hasActiveDelivery ? (
              <div className="bg-surface rounded-xl p-4 shadow-soft border-l-4 border-primary flex flex-col gap-4">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h3 className="text-xl font-semibold text-on-surface mb-1">{active.restaurant}</h3>
                    <p className="text-sm text-muted flex items-center gap-1">
                      <MaterialIcon name="location_on" className="text-base" />
                      {active.dropoff}
                    </p>
                  </div>
                  <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[11px] font-medium flex items-center gap-1 shrink-0">
                    <MaterialIcon name={active.statusIcon} className="text-sm" />
                    {active.status}
                  </div>
                </div>
                <div className="h-px w-full bg-surface-variant" />
                <div className="flex justify-between items-center gap-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] text-muted uppercase tracking-wider">Est. Arrival</span>
                    <span className="text-base font-semibold text-on-surface">{active.estimatedArrival}</span>
                  </div>
                  <button
                    type="button"
                    onClick={onViewActiveDelivery}
                    className="bg-primary text-on-primary px-6 py-3 rounded-lg text-xs font-semibold uppercase tracking-wide active:scale-95 transition-transform min-h-12"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ) : (
              <EmptyState
                icon="local_shipping"
                title="No active deliveries"
                description="Go online to start receiving delivery offers."
              />
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="flex flex-col gap-6">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={`px-4 py-2 rounded-full text-[11px] font-medium whitespace-nowrap min-h-10 transition-colors ${
                    filter === f.id
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container border border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {isEmptyHistory ? (
              <EmptyState
                icon="history"
                title="No deliveries yet"
                description="Your completed and cancelled deliveries will appear here."
              />
            ) : (
              <div className="flex flex-col gap-4">
                {groupedHistory.map((group) => (
                  <div key={group.date} className="flex flex-col gap-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted sticky top-0 bg-background/90 backdrop-blur py-2 z-10">
                      {group.date}
                    </h3>
                    {group.items.map((delivery) => (
                      <HistoryCard
                        key={delivery.id}
                        delivery={delivery}
                        onSelect={() => onDeliverySelect(delivery.id)}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}
