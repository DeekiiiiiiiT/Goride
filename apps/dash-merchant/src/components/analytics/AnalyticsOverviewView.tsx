import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { AnalyticsTimeRange } from '../../types/analytics';
import { MerchantAnalyticsData } from '../../hooks/useMerchantAnalytics';
import { formatCompactJmd } from '../../lib/analytics-utils';
import TimeRangeFilter from './TimeRangeFilter';
import TopSellingItemsCard from './TopSellingItemsCard';
import PinchZoomChart from './PinchZoomChart';

interface AnalyticsOverviewViewProps {
  data: MerchantAnalyticsData;
  timeRange: AnalyticsTimeRange;
  onTimeRangeChange: (value: AnalyticsTimeRange) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onOpenSalesBreakdown: () => void;
  onOpenOperational: () => void;
  onOpenTopItems: () => void;
}

export default function AnalyticsOverviewView({
  data,
  timeRange,
  onTimeRangeChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  onOpenSalesBreakdown,
  onOpenOperational,
  onOpenTopItems,
}: AnalyticsOverviewViewProps) {
  const revenueChartData = data.revenueByBucket.map((bucket) => ({
    label: bucket.label,
    revenue: bucket.revenue,
  }));

  const volumeChartData = data.orderVolumeByBucket.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
  }));

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-col gap-sm">
        <h1 className="text-headline-lg-mobile text-on-surface">Analytics</h1>
        <TimeRangeFilter value={timeRange} onChange={onTimeRangeChange} />
        {timeRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-sm">
            <input
              type="date"
              value={customStart}
              onChange={(event) => onCustomStartChange(event.target.value)}
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-sm"
            />
            <span className="text-on-surface-variant">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(event) => onCustomEndChange(event.target.value)}
              className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-body-sm"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-xs">
        <MetricCard label="Total Orders" value={String(data.totalOrders)} icon="receipt_long" />
        <MetricCard
          label="Total Revenue"
          value={formatCompactJmd(data.totalRevenue)}
          icon="payments"
        />
        <MetricCard
          label="Avg Order Value"
          value={formatCompactJmd(data.avgOrderValue)}
          icon="shopping_bag"
        />
        <MetricCard
          label="Avg Prep Time"
          value={data.avgPrepTime > 0 ? `${data.avgPrepTime} min` : '—'}
          icon="timer"
        />
      </div>

      <section className="flex flex-col gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-label-md text-on-surface-variant">Revenue by Time</h2>
          <button
            type="button"
            onClick={onOpenSalesBreakdown}
            className="flex items-center text-[14px] font-label-md text-primary"
          >
            Details
            <MaterialIcon name="chevron_right" className="text-[16px]" />
          </button>
        </div>
        <PinchZoomChart className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueChartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
              <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </PinchZoomChart>
      </section>

      <section className="flex flex-col gap-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
        <h2 className="text-label-md text-on-surface-variant">Order Volume</h2>
        <PinchZoomChart className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={volumeChartData}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </PinchZoomChart>
      </section>

      <TopSellingItemsCard items={data.topItems.slice(0, 3)} onViewAll={onOpenTopItems} />

      <button
        type="button"
        onClick={onOpenOperational}
        className="flex items-center justify-between rounded-lg border border-outline-variant bg-surface-container-lowest p-sm text-left transition-colors hover:bg-surface-container-low"
      >
        <div>
          <p className="text-headline-md text-on-surface">Operational Metrics</p>
          <p className="text-body-sm text-on-surface-variant">Prep time, acceptance &amp; accuracy</p>
        </div>
        <MaterialIcon name="chevron_right" className="text-on-surface-variant" />
      </button>
    </div>
  );
}

function MetricCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="relative flex flex-col gap-xs overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
      <div className="flex items-start justify-between">
        <span className="text-label-md text-on-surface-variant">{label}</span>
        <MaterialIcon name={icon} className="text-[18px] text-outline" />
      </div>
      <span className="mt-1 text-headline-md text-on-surface">{value}</span>
    </div>
  );
}
