import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MerchantAnalyticsData } from '../../hooks/useMerchantAnalytics';
import { formatCompactJmd } from '../../lib/analytics-utils';
import PinchZoomChart from './PinchZoomChart';

interface SalesBreakdownViewProps {
  onBack: () => void;
  data: MerchantAnalyticsData;
}

export default function SalesBreakdownView({ onBack, data }: SalesBreakdownViewProps) {
  const chartData = data.revenueByBucket.map((bucket) => ({
    label: bucket.label,
    revenue: bucket.revenue,
  }));

  const hasCategoryData = data.categoryBreakdown.some((entry) => (entry.revenue ?? 0) > 0);
  const hasDayData = data.revenueByDayOfWeek.some((entry) => entry.revenue > 0);
  const hasHourData = data.revenueByHour.some((entry) => entry.revenue > 0);

  return (
    <div className="flex flex-col gap-inset-md">
      <div className="mb-inset-sm">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary"
        >
          <MaterialIcon name="arrow_back" className="text-base" />
          Back
        </button>
        <h2 className="text-headline-lg-mobile text-on-surface">Sales Breakdown</h2>
      </div>

      <div className="grid grid-cols-2 gap-inset-sm">
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <p className="mb-1 text-label-md text-on-surface-variant">Total Revenue</p>
          <span className="text-headline-lg-mobile text-on-surface">
            {formatCompactJmd(data.totalRevenue)}
          </span>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
          <p className="mb-1 text-label-md text-on-surface-variant">Total Orders</p>
          <span className="text-headline-lg-mobile text-on-surface">{data.totalOrders}</span>
        </div>
      </div>

      <PinchZoomChart className="h-48 rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </PinchZoomChart>

      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
        <h3 className="mb-inset-sm text-headline-md text-on-surface">Revenue by Category</h3>
        {hasCategoryData ? (
          <div className="flex flex-col gap-inset-sm md:flex-row md:items-center">
            <div className="h-48 w-full md:w-1/2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    dataKey="revenue"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {data.categoryBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex flex-1 flex-col gap-inset-xs">
              {data.categoryBreakdown.map((entry) => (
                <li key={entry.name} className="flex items-center justify-between text-body-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="text-on-surface-variant">{entry.percent}%</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-body-sm text-on-surface-variant">No category data for this period.</p>
        )}
      </section>

      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
        <h3 className="mb-inset-sm text-headline-md text-on-surface">Revenue by Day of Week</h3>
        {hasDayData ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueByDayOfWeek}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
                <Bar dataKey="revenue" fill="#006c49" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-body-sm text-on-surface-variant">No orders in this period.</p>
        )}
      </section>

      <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-sm">
        <h3 className="mb-inset-sm text-headline-md text-on-surface">Revenue by Hour</h3>
        {hasHourData ? (
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.revenueByHour}>
                <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={2} />
                <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
                <Bar dataKey="revenue" fill="#4edea3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-body-sm text-on-surface-variant">No orders in this period.</p>
        )}
      </section>
    </div>
  );
}
