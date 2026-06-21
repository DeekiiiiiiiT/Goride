import { useMemo, useState } from 'react';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { formatJmd } from '../lib/partner-utils';
import {
  computeAvgPrepTimeMins,
  computeCancellationRatePercent,
  exportOrdersToCsv,
  filterOrdersByDateRange,
  formatItemCountLabel,
  formatItemsSummary,
  formatTime,
  getCancelledByLabel,
  HistoryDateRange,
} from '../lib/order-utils';
import { Order } from '../types/order';

type HistoryTab = 'completed' | 'cancelled';

interface OrderHistoryViewProps {
  tab: HistoryTab;
  onTabChange: (tab: HistoryTab) => void;
  orders: Order[];
  completedOrders: Order[];
  cancelledOrders: Order[];
  isLoading: boolean;
  onOrderClick: (orderId: string) => void;
  fallbackAvgPrepMins: number;
}

const DATE_FILTERS: { key: HistoryDateRange; label: string; icon?: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This Week' },
  { key: 'custom', label: 'Custom', icon: 'calendar_today' },
];

export default function OrderHistoryView({
  tab,
  onTabChange,
  orders,
  completedOrders,
  cancelledOrders,
  isLoading,
  onOrderClick,
  fallbackAvgPrepMins,
}: OrderHistoryViewProps) {
  const [dateRange, setDateRange] = useState<HistoryDateRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const customRange = useMemo(
    () => (customStart && customEnd ? { start: customStart, end: customEnd } : undefined),
    [customStart, customEnd],
  );

  const filteredOrders = useMemo(
    () => filterOrdersByDateRange(orders, dateRange, customRange),
    [orders, dateRange, customRange],
  );

  const filteredCompleted = useMemo(
    () => filterOrdersByDateRange(completedOrders, dateRange, customRange),
    [completedOrders, dateRange, customRange],
  );

  const filteredCancelled = useMemo(
    () => filterOrdersByDateRange(cancelledOrders, dateRange, customRange),
    [cancelledOrders, dateRange, customRange],
  );

  const stats = useMemo(() => {
    const totalRevenue = filteredCompleted.reduce((sum, order) => sum + order.total, 0);
    const avgPrep = computeAvgPrepTimeMins(filteredCompleted) ?? fallbackAvgPrepMins;

    return {
      totalOrders: filteredCompleted.length,
      totalRevenue,
      avgPrep,
    };
  }, [filteredCompleted, fallbackAvgPrepMins]);

  const cancellationRate = useMemo(
    () => computeCancellationRatePercent(filteredCompleted.length, filteredCancelled.length),
    [filteredCompleted.length, filteredCancelled.length],
  );

  const handleExport = () => {
    const suffix = tab === 'completed' ? 'completed' : 'cancelled';
    exportOrdersToCsv(filteredOrders, `roam-orders-${suffix}-${dateRange}.csv`);
  };

  return (
    <div className="flex flex-col gap-inset-md">
      <section className="flex flex-col gap-inset-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
            Order History
          </h2>
          {tab === 'completed' ? (
            <div className="flex gap-inset-md border-b border-outline-variant pb-inset-xs">
              <button
                type="button"
                onClick={() => onTabChange('completed')}
                className="border-b-2 border-primary pb-inset-xs text-label-md font-semibold text-primary"
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => onTabChange('cancelled')}
                className="pb-inset-xs text-label-md font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
              >
                Cancelled
              </button>
            </div>
          ) : (
            <div className="flex w-full max-w-sm rounded-lg bg-surface-container p-1">
              <button
                type="button"
                onClick={() => onTabChange('completed')}
                className="flex-1 rounded-md px-4 py-2 text-center text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-highest"
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => onTabChange('cancelled')}
                className="flex-1 rounded-md bg-surface px-4 py-2 text-center text-label-md font-semibold text-on-surface shadow-[0_1px_3px_rgba(0,0,0,0.1)]"
              >
                Cancelled
              </button>
            </div>
          )}
        </div>

        {tab === 'completed' && (
          <button
            type="button"
            onClick={handleExport}
            className="flex h-12 items-center justify-center gap-inset-xs self-start rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-sm py-2 text-label-md font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container-highest md:self-auto"
          >
            <MaterialIcon name="download" size={20} />
            Export
          </button>
        )}
      </section>

      <section className="hide-scroll -mx-margin-mobile flex gap-inset-xs overflow-x-auto px-margin-mobile py-1 md:mx-0 md:px-0">
        {DATE_FILTERS.map((option) => {
          const active = dateRange === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setDateRange(option.key)}
              className={`flex h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-full px-inset-sm text-label-md font-semibold transition-colors ${
                active
                  ? 'bg-primary-container text-on-primary-container shadow-sm'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-highest'
              } ${option.icon ? 'gap-1' : ''}`}
            >
              {option.icon && <MaterialIcon name={option.icon} size={16} />}
              {option.label}
            </button>
          );
        })}
      </section>

      {dateRange === 'custom' && (
        <section className="flex flex-col gap-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
            From
            <input
              type="date"
              value={customStart}
              onChange={(event) => setCustomStart(event.target.value)}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1 text-label-sm text-on-surface-variant">
            To
            <input
              type="date"
              value={customEnd}
              onChange={(event) => setCustomEnd(event.target.value)}
              className="rounded-lg border border-outline-variant bg-surface px-3 py-2 text-body-sm text-on-surface"
            />
          </label>
        </section>
      )}

      {tab === 'completed' && (
        <section className="grid grid-cols-2 gap-inset-xs md:grid-cols-3 md:gap-inset-sm">
          <div className="flex flex-col justify-center rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
            <span className="mb-inset-base text-label-sm uppercase tracking-wider text-on-surface-variant">
              Total Orders
            </span>
            <span className="text-headline-md font-semibold text-on-surface">{stats.totalOrders}</span>
          </div>
          <div className="flex flex-col justify-center rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
            <span className="mb-inset-base text-label-sm uppercase tracking-wider text-on-surface-variant">
              Total Revenue
            </span>
            <span className="text-headline-md font-semibold text-primary">
              {formatJmd(stats.totalRevenue)}
            </span>
          </div>
          <div className="col-span-2 flex flex-col justify-center rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm md:col-span-1">
            <span className="mb-inset-base text-label-sm uppercase tracking-wider text-on-surface-variant">
              Avg Prep Time
            </span>
            <span className="text-headline-md font-semibold text-on-surface">{stats.avgPrep} min</span>
          </div>
        </section>
      )}

      {tab === 'cancelled' && cancellationRate >= 10 && (
        <div className="flex items-start gap-3 rounded-lg border border-error bg-error-container p-4 shadow-sm">
          <MaterialIcon name="warning" filled className="mt-0.5 text-error" />
          <div>
            <p className="text-label-md font-semibold text-on-error-container">
              High cancellation rate ({cancellationRate}%)
            </p>
            <p className="mt-1 text-body-sm text-on-error-container opacity-90">
              This may affect your visibility to customers.
            </p>
          </div>
        </div>
      )}

      <section className="flex flex-col gap-inset-xs">
        {isLoading ? (
          [1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-lg border border-outline-variant bg-surface-container-lowest"
            />
          ))
        ) : filteredOrders.length === 0 ? (
          <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-12 text-center">
            <MaterialIcon name="history" className="mx-auto mb-4 text-outline" size={48} />
            <h3 className="mb-2 text-headline-md font-semibold text-on-surface">No orders found</h3>
            <p className="text-body-sm text-on-surface-variant">
              Try a different date range or check another tab.
            </p>
          </div>
        ) : tab === 'completed' ? (
          filteredOrders.map((order) => {
            const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
            const completedAt = order.delivered_at || order.placed_at;

            return (
              <article
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => onOrderClick(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOrderClick(order.id);
                  }
                }}
                className="group flex cursor-pointer flex-col gap-inset-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm transition-shadow duration-200 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-inset-base flex items-center gap-inset-xs">
                      <span className="text-headline-md font-bold text-on-surface">
                        #{order.order_number}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-2 py-1 text-label-sm text-primary">
                        Delivered
                        <MaterialIcon name="check" size={14} />
                      </span>
                    </div>
                    {completedAt && (
                      <span className="text-body-sm text-on-surface-variant">
                        {formatTime(completedAt)}
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="block text-headline-md font-bold text-on-surface">
                      {formatJmd(order.total)}
                    </span>
                    <span className="text-body-sm text-on-surface-variant">
                      {formatItemCountLabel(itemCount)}
                    </span>
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          filteredOrders.map((order) => {
            const cancelledAt = order.cancelled_at || order.placed_at;

            return (
              <article
                key={order.id}
                role="button"
                tabIndex={0}
                onClick={() => onOrderClick(order.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOrderClick(order.id);
                  }
                }}
                className="cursor-pointer rounded-lg border border-outline-variant bg-surface p-inset-md shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-3 flex items-start justify-between border-b border-outline-variant pb-3">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-headline-md font-semibold text-on-surface">
                        #{order.order_number}
                      </span>
                      {cancelledAt && (
                        <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-label-sm text-on-surface-variant">
                          {formatTime(cancelledAt)}
                        </span>
                      )}
                    </div>
                    <p className="flex items-center gap-1 text-label-md font-semibold text-error">
                      <MaterialIcon name="cancel" size={16} />
                      Cancelled by: {getCancelledByLabel(order.cancelled_by)}
                    </p>
                  </div>
                  <span className="text-headline-md font-semibold text-on-surface">
                    {formatJmd(order.total)}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <MaterialIcon name="info" size={18} className="mt-0.5 text-on-surface-variant" />
                    <div>
                      <span className="block text-label-md font-semibold text-on-surface-variant">
                        Reason
                      </span>
                      <span className="text-body-sm text-on-surface">
                        {order.cancellation_reason || 'No reason provided'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MaterialIcon
                      name="restaurant"
                      size={18}
                      className="mt-0.5 text-on-surface-variant"
                    />
                    <div>
                      <span className="block text-label-md font-semibold text-on-surface-variant">
                        Items
                      </span>
                      <span className="text-body-sm text-on-surface">{formatItemsSummary(order)}</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
