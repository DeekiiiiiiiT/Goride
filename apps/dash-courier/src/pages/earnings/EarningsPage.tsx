import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { SkeletonEarnings } from '@/components/ui/Skeleton';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { toast } from '@/lib/toast';
import {
  formatJmd,
  MOCK_TODAY_EARNINGS,
  MOCK_WEEKLY_EARNINGS,
  type EarningsPeriod,
  type RecentDelivery,
} from '@/lib/mockEarnings';

type EarningsPageProps = {
  onDeliverySelect: (deliveryId: string) => void;
  onViewAllHistory?: () => void;
  onViewPromotions?: () => void;
};

const PERIOD_TABS: { id: EarningsPeriod; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
];

function RecentDeliveryRow({
  delivery,
  onSelect,
}: {
  delivery: RecentDelivery;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex items-center justify-between p-4 w-full text-left border-b border-surface-variant last:border-0 active:bg-surface-container-low transition-colors"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="w-0.5 h-12 bg-primary rounded-full shrink-0"
          style={{ opacity: delivery.accentOpacity ?? 1 }}
        />
        <div className="min-w-0">
          <p className="text-[11px] text-muted mb-0.5">{delivery.time}</p>
          <p className="text-sm text-on-surface font-medium truncate max-w-[200px]">
            {delivery.restaurant}
            <MaterialIcon name="arrow_forward" className="text-sm align-middle text-muted mx-1 inline" />
            {delivery.dropoff}
          </p>
        </div>
      </div>
      <span className="text-base text-on-surface font-semibold shrink-0 ml-2">
        J${formatJmd(delivery.amount)}
      </span>
    </button>
  );
}

export function EarningsPage({ onDeliverySelect, onViewAllHistory, onViewPromotions }: EarningsPageProps) {
  const [period, setPeriod] = useState<EarningsPeriod>('today');
  const [loading, setLoading] = useState(true);
  const today = MOCK_TODAY_EARNINGS;
  const week = MOCK_WEEKLY_EARNINGS;

  const { refreshing, scrollRef, handleTouchStart, handleTouchEnd } = usePullToRefresh({
    onRefresh: async () => {
      await new Promise((r) => window.setTimeout(r, 800));
      toast.success('Earnings updated');
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 600);
    return () => window.clearTimeout(timer);
  }, [period]);

  return (
    <div className="min-h-full pb-24">
      <div className="sticky top-0 bg-surface z-40 pt-safe px-[var(--spacing-edge)] pb-2 shadow-sm">
        <div className="flex items-center justify-between h-14">
          <h1 className="text-2xl font-semibold text-on-surface">Earnings</h1>
          <button
            type="button"
            aria-label="Help"
            className="p-2 -mr-2 text-primary hover:bg-surface-container-low rounded-full"
          >
            <MaterialIcon name="help" />
          </button>
        </div>
        <div className="flex gap-4 mt-2 border-b border-surface-variant">
          {PERIOD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setLoading(true);
                setPeriod(tab.id);
              }}
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
        {period === 'today' && (
          <>
            <section className="flex flex-col items-center pt-2 pb-2">
              <p className="text-sm text-muted mb-2">{today.dateLabel}</p>
              <div className="flex items-start">
                <span className="text-2xl font-semibold text-primary mt-1 mr-1">J$</span>
                <h2 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface">
                  {formatJmd(today.total)}
                </h2>
              </div>
            </section>

            <section className="grid grid-cols-2 gap-4">
              {[
                { icon: 'local_mall', value: String(today.deliveries), label: 'Deliveries' },
                { icon: 'payments', value: `J$${today.avgPerDelivery}`, label: 'Avg/Delivery', primary: true },
                { icon: 'timer', value: today.activeTime, label: 'Active Time', small: true },
                { icon: 'schedule', value: today.dashTime, label: 'Dash Time', small: true },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-surface rounded-xl p-4 shadow-soft flex flex-col items-center justify-center"
                >
                  <MaterialIcon
                    name={stat.icon}
                    className={`mb-2 text-2xl ${stat.primary ? 'text-primary' : 'text-muted'}`}
                  />
                  <span className={stat.small ? 'text-xl font-semibold' : 'text-2xl font-semibold'}>
                    {stat.value}
                  </span>
                  <span className="text-[11px] text-muted mt-1 uppercase tracking-wider">{stat.label}</span>
                </div>
              ))}
            </section>

            <section className="flex gap-4 overflow-x-auto hide-scrollbar py-2 -mx-[var(--spacing-edge)] px-[var(--spacing-edge)]">
              <button
                type="button"
                onClick={onViewPromotions}
                className="shrink-0 bg-surface border border-outline-variant rounded-full px-6 py-2 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <MaterialIcon name="star" className="text-warning text-xl" filled />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  J${formatJmd(today.tips)} in tips
                </span>
              </button>
              <button
                type="button"
                onClick={onViewPromotions}
                className="shrink-0 bg-surface border border-outline-variant rounded-full px-6 py-2 flex items-center gap-2 active:scale-95 transition-transform"
              >
                <MaterialIcon name="trending_up" className="text-primary text-xl" filled />
                <span className="text-xs font-semibold uppercase tracking-wide">
                  J${formatJmd(today.peakPay)} peak pay
                </span>
              </button>
            </section>

            <section>
              <h3 className="text-xl font-semibold text-on-surface mb-4">Recent Deliveries</h3>
              <div className="bg-surface rounded-xl shadow-soft overflow-hidden">
                {today.recent.map((d) => (
                  <RecentDeliveryRow
                    key={d.id}
                    delivery={d}
                    onSelect={() => onDeliverySelect(d.id)}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={onViewAllHistory}
                className="w-full mt-4 py-2 text-xs font-semibold uppercase tracking-wide text-primary flex items-center justify-center gap-1 hover:bg-surface-container-low rounded-lg min-h-12"
              >
                View all history
                <MaterialIcon name="chevron_right" className="text-lg" />
              </button>
            </section>
          </>
        )}

        {(period === 'week' || period === 'month') && (
          <>
            <section className="flex flex-col items-center text-center gap-2">
              <div className="flex items-center justify-center gap-2 w-full">
                <button type="button" className="p-2 text-muted rounded-full hover:bg-surface-variant">
                  <MaterialIcon name="chevron_left" />
                </button>
                <h2 className="text-2xl font-semibold text-on-surface">{week.rangeLabel}</h2>
                <button type="button" className="p-2 text-muted rounded-full hover:bg-surface-variant">
                  <MaterialIcon name="chevron_right" />
                </button>
              </div>
              <p className="text-[28px] leading-9 font-bold text-primary tracking-tight">
                J${formatJmd(week.total)}
              </p>
              <p className="text-sm text-muted">
                {period === 'month' ? 'Monthly' : 'Weekly'} Total Earnings
              </p>
            </section>

            <section className="bg-surface shadow-soft rounded-xl p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center text-xs font-semibold uppercase tracking-wide text-muted">
                <span>Daily Breakdown</span>
                <MaterialIcon name="bar_chart" className="text-lg" />
              </div>
              <div className="h-40 flex items-end justify-between pt-4 gap-1">
                {week.dailyBreakdown.map((day, i) => (
                  <div key={`${day.label}-${i}`} className="flex flex-col items-center justify-end h-full w-full gap-2">
                    <div
                      className={`w-full rounded-t-sm transition-colors ${
                        day.isHighlight ? 'bg-primary shadow-[0_4px_10px_rgba(0,108,73,0.3)]' : 'bg-surface-container'
                      }`}
                      style={{ height: `${day.heightPercent}%` }}
                    />
                    <span
                      className={`text-[11px] ${day.isHighlight ? 'font-semibold text-on-surface' : 'text-muted'}`}
                    >
                      {day.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid grid-cols-2 gap-2">
              <div className="bg-surface shadow-soft rounded-xl p-4 flex flex-col justify-between aspect-square">
                <MaterialIcon name="package_2" className="text-primary text-[28px]" filled />
                <div>
                  <p className="text-2xl font-semibold text-on-surface">{week.deliveries}</p>
                  <p className="text-sm text-muted">Deliveries</p>
                </div>
              </div>
              <div className="grid grid-rows-2 gap-2">
                <div className="bg-surface shadow-soft rounded-xl p-3 flex items-center justify-between px-4">
                  <div>
                    <p className="text-xl font-semibold leading-none">{week.activeHours}</p>
                    <p className="text-[11px] text-muted">Active Hours</p>
                  </div>
                  <MaterialIcon name="schedule" className="text-muted text-xl" />
                </div>
                <div className="bg-surface shadow-soft rounded-xl p-3 flex items-center justify-between px-4">
                  <div>
                    <p className="text-xl font-semibold leading-none">J${formatJmd(week.avgPerHour)}</p>
                    <p className="text-[11px] text-muted">Avg / Hour</p>
                  </div>
                  <MaterialIcon name="speed" className="text-muted text-xl" />
                </div>
              </div>
            </section>

            <section className="bg-surface shadow-soft rounded-xl overflow-hidden border border-surface-container">
              <div className="p-4 border-b border-surface-container">
                <h3 className="text-xl font-semibold text-on-surface mb-1">Payout Status</h3>
                <p className="text-sm text-muted">Summary for this period</p>
              </div>
              <div className="p-4 flex items-center justify-between border-b border-surface-container">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
                    <MaterialIcon name="check_circle" className="text-success" filled />
                  </div>
                  <div>
                    <p className="text-base font-medium text-on-surface">J${formatJmd(week.deposited)}</p>
                    <p className="text-sm text-success">Deposited to bank</p>
                  </div>
                </div>
                <MaterialIcon name="chevron_right" className="text-muted" />
              </div>
              <div className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center">
                    <MaterialIcon name="pending" className="text-muted" />
                  </div>
                  <div>
                    <p className="text-base font-medium text-on-surface">J${formatJmd(week.pending)}</p>
                    <p className="text-sm text-muted">Pending settlement</p>
                  </div>
                </div>
                <MaterialIcon name="chevron_right" className="text-muted" />
              </div>
            </section>

            <div className="flex items-start gap-2 px-1 pb-4">
              <MaterialIcon name="info" className="text-muted text-xl mt-0.5 shrink-0" filled />
              <p className="text-sm text-muted">
                Pending earnings are typically settled within 2–3 business days.
              </p>
            </div>
          </>
        )}
          </>
        )}
      </PullToRefresh>
    </div>
  );
}
