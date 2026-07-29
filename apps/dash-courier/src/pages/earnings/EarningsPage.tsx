import React, { useCallback, useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonEarnings } from '@/components/ui/Skeleton';
import { ErrorScreen } from '@/components/ui/ErrorScreen';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { fetchCourierEarnings } from '@/lib/courierApi';
import { formatJmd } from '@/lib/mockEarnings';
import { toast } from '@/lib/toast';

type EarningsPageProps = {
  onDeliverySelect: (deliveryId: string) => void;
  onViewAllHistory?: () => void;
  onViewPromotions?: () => void;
};

type EarningsPeriod = 'today' | 'week' | 'month';

const PERIOD_TABS: { id: EarningsPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

export function EarningsPage({ onDeliverySelect, onViewAllHistory, onViewPromotions }: EarningsPageProps) {
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [total, setTotal] = useState(0);
  const [deliveryCount, setDeliveryCount] = useState(0);
  const [deliveries, setDeliveries] = useState<
    Array<{ id: string; restaurant: string; dropoff: string; amount: number; time?: string }>
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const data = await fetchCourierEarnings(period);
    setLoading(false);
    if (!data) {
      setError(true);
      return;
    }
    setTotal(data.total);
    setDeliveryCount(data.deliveryCount);
    setDeliveries(data.deliveries);
  }, [period]);

  useEffect(() => {
    void load();
  }, [load]);

  const { refreshing, scrollRef, handleTouchStart, handleTouchEnd } = usePullToRefresh({
    onRefresh: async () => {
      await load();
      toast.success('Earnings updated');
    },
  });

  if (error && !loading) {
    return (
      <div className="min-h-full pb-24">
        <ErrorScreen variant="server" onPrimary={() => void load()} fullScreen={false} />
      </div>
    );
  }

  const avg = deliveryCount > 0 ? Math.round(total / deliveryCount) : 0;

  return (
    <div className="min-h-full pb-24">
      <div className="sticky top-0 bg-surface z-40 pt-safe px-[var(--spacing-edge)] pb-2 shadow-sm">
        <div className="flex items-center justify-between h-14">
          <h1 className="text-2xl font-semibold text-on-surface">Earnings</h1>
        </div>
        <div className="flex gap-4 mt-2 border-b border-surface-variant">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPeriod(tab.id)}
              className={`pb-2 border-b-2 text-xs font-semibold uppercase tracking-wide transition-colors px-1 ${
                period === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted hover:text-on-surface'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <PullToRefresh
        refreshing={refreshing}
        scrollRef={scrollRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="max-w-lg mx-auto px-[var(--spacing-edge)] pt-6 pb-8 space-y-6"
      >
        {loading ? (
          <SkeletonEarnings />
        ) : (
          <>
            <section className="flex flex-col items-center pt-2 pb-2">
              <div className="flex items-start">
                <span className="text-2xl font-semibold text-primary mt-1 mr-1">J$</span>
                <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface">
                  {formatJmd(total)}
                </h2>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-4">
              <div className="bg-surface rounded-xl p-4 shadow-soft flex flex-col items-center justify-center">
                <MaterialIcon name="local_mall" className="mb-2 text-2xl text-muted" />
                <span className="text-2xl font-semibold">{deliveryCount}</span>
                <span className="text-[11px] text-muted mt-1 uppercase tracking-wider">Deliveries</span>
              </div>
              <div className="bg-surface rounded-xl p-4 shadow-soft flex flex-col items-center justify-center">
                <MaterialIcon name="payments" className="mb-2 text-2xl text-primary" />
                <span className="text-2xl font-semibold">J${avg}</span>
                <span className="text-[11px] text-muted mt-1 uppercase tracking-wider">Avg/Delivery</span>
              </div>
            </section>

            {onViewPromotions && (
              <button
                type="button"
                onClick={onViewPromotions}
                className="w-full bg-surface border border-outline-variant rounded-full px-6 py-3 flex items-center justify-center gap-2"
              >
                <MaterialIcon name="star" className="text-warning" filled />
                <span className="text-xs font-semibold uppercase tracking-wide">View promotions</span>
              </button>
            )}

            <section className="bg-surface rounded-xl shadow-soft overflow-hidden">
              <div className="flex justify-between items-center px-4 py-3 border-b border-surface-variant">
                <h3 className="text-sm font-semibold">Recent deliveries</h3>
                {onViewAllHistory && (
                  <button type="button" onClick={onViewAllHistory} className="text-xs text-primary font-semibold">
                    View all
                  </button>
                )}
              </div>
              {deliveries.length === 0 ? (
                <p className="p-4 text-sm text-muted">No completed deliveries in this period.</p>
              ) : (
                deliveries.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onDeliverySelect(d.id)}
                    className="flex items-center justify-between p-4 w-full text-left border-b border-surface-variant last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted mb-0.5">
                        {d.time ? new Date(d.time).toLocaleString() : ''}
                      </p>
                      <p className="text-sm font-medium truncate">
                        {d.restaurant} → {d.dropoff}
                      </p>
                    </div>
                    <span className="font-semibold shrink-0 ml-2">J${formatJmd(d.amount)}</span>
                  </button>
                ))
              )}
            </section>
          </>
        )}
      </PullToRefresh>
    </div>
  );
}
