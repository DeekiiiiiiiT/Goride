import { useMemo, useState } from 'react';
import { Merchant } from '../hooks/useMerchant';
import { PartnerTab } from '../lib/partner-utils';
import { AnalyticsNavTab, AnalyticsTimeRange, HealthView } from '../types/analytics';
import { useMerchantAnalytics } from '../hooks/useMerchantAnalytics';
import { getAnalyticsDateRange } from '../lib/analytics-utils';
import { useAcceptingOrdersToggle } from '../hooks/useAcceptingOrdersToggle';
import AnalyticsMerchantHeader from '../components/analytics/AnalyticsMerchantHeader';
import AnalyticsSubNav from '../components/analytics/AnalyticsSubNav';
import AnalyticsOverviewView from '../components/analytics/AnalyticsOverviewView';
import TopSellingItemsView from '../components/analytics/TopSellingItemsView';
import SalesBreakdownView from '../components/analytics/SalesBreakdownView';
import OperationalMetricsView from '../components/analytics/OperationalMetricsView';
import ReviewsAnalyticsView from '../components/analytics/ReviewsAnalyticsView';
import QueryErrorState from '../components/QueryErrorState';
import PartnerSkeleton from '../components/PartnerSkeleton';

interface AnalyticsPageProps {
  merchant: Merchant;
  onNavigate: (page: PartnerTab) => void;
}

export default function AnalyticsPage({ merchant, onNavigate }: AnalyticsPageProps) {
  const [navTab, setNavTab] = useState<AnalyticsNavTab>('health');
  const [healthView, setHealthView] = useState<HealthView>('overview');
  const [timeRange, setTimeRange] = useState<AnalyticsTimeRange>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const { isAcceptingOrders, toggleAcceptingOrders, isPending: togglePending } =
    useAcceptingOrdersToggle(merchant);

  const customRange = useMemo(
    () => (customStart && customEnd ? { start: customStart, end: customEnd } : undefined),
    [customStart, customEnd],
  );

  const { from, to } = useMemo(
    () => getAnalyticsDateRange(timeRange, customRange),
    [timeRange, customRange],
  );

  const granularity = timeRange === 'today' ? 'hour' : 'day';
  const { data, isLoading, isError, refetch } = useMerchantAnalytics(from, to, granularity);

  const handleSelectTab = (tab: AnalyticsNavTab) => {
    setNavTab(tab);
    if (tab === 'health') {
      setHealthView('overview');
    }
  };

  const renderHealthContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col gap-sm">
          <PartnerSkeleton variant="card" count={4} />
          <PartnerSkeleton variant="chart" />
        </div>
      );
    }

    if (isError || !data) {
      return <QueryErrorState message="Could not load analytics" onRetry={() => refetch()} />;
    }

    switch (healthView) {
      case 'top-items':
        return <TopSellingItemsView onBack={() => setHealthView('overview')} data={data} />;
      case 'sales':
        return <SalesBreakdownView onBack={() => setHealthView('overview')} data={data} />;
      case 'operational':
        return <OperationalMetricsView onBack={() => setHealthView('overview')} data={data} />;
      default:
        return (
          <AnalyticsOverviewView
            data={data}
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            onOpenSalesBreakdown={() => setHealthView('sales')}
            onOpenOperational={() => setHealthView('operational')}
            onOpenTopItems={() => setHealthView('top-items')}
          />
        );
    }
  };

  return (
    <div className="min-h-dvh bg-surface pb-24">
      <AnalyticsMerchantHeader
        merchant={merchant}
        isAcceptingOrders={isAcceptingOrders}
        onToggleAcceptingOrders={toggleAcceptingOrders}
        togglePending={togglePending}
      />

      <main className="mx-auto max-w-lg overflow-y-auto px-margin-mobile pb-4 pt-16 md:max-w-3xl md:px-margin-tablet">
        {navTab === 'reviews' ? (
          isLoading ? (
            <PartnerSkeleton variant="card" count={3} />
          ) : isError || !data ? (
            <QueryErrorState message="Could not load reviews" onRetry={() => refetch()} />
          ) : (
            <ReviewsAnalyticsView data={data} />
          )
        ) : (
          renderHealthContent()
        )}
      </main>

      <AnalyticsSubNav
        activeTab={navTab}
        onSelectTab={handleSelectTab}
        onNavigate={onNavigate}
      />
    </div>
  );
}
