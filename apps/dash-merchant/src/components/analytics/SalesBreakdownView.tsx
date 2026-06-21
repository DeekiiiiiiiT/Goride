import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
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

  return (
    <div className="flex flex-col gap-md">
      <div className="mb-sm">
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

      <div className="grid grid-cols-2 gap-sm">
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
          <p className="mb-1 text-label-md text-on-surface-variant">Total Revenue</p>
          <span className="text-headline-lg-mobile text-on-surface">
            {formatCompactJmd(data.totalRevenue)}
          </span>
        </div>
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
          <p className="mb-1 text-label-md text-on-surface-variant">Total Orders</p>
          <span className="text-headline-lg-mobile text-on-surface">{data.totalOrders}</span>
        </div>
      </div>

      <PinchZoomChart className="h-48 rounded-lg border border-outline-variant bg-surface-container-lowest p-sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
            <Tooltip formatter={(value: number) => formatCompactJmd(value)} />
            <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </PinchZoomChart>
    </div>
  );
}
