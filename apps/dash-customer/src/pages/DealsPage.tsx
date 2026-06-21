import { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { toast } from '@/lib/toast';
import {
  DEAL_FILTERS,
  type DealFilter,
  filterDeals,
} from '@/lib/dealsContent';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function DealsPage({ onNavigate }: Props) {
  const [activeFilter, setActiveFilter] = useState<DealFilter>('all');
  const { featured, daily } = filterDeals(activeFilter);

  const handleRefresh = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 600));
    toast.success('Deals refreshed');
  }, []);

  return (
    <PullToRefresh onRefresh={handleRefresh} className="pb-24 bg-background min-h-full">
      <div className="px-4 mb-6 pt-2">
        <h2 className="text-headline-lg-mobile font-bold text-on-surface mb-2">Deals Near You</h2>
        <p className="text-body-md text-on-surface-variant">Discover the best offers in your area.</p>
      </div>

      <div className="px-4 mb-6 overflow-x-auto no-scrollbar pb-2">
        <div className="flex gap-2 w-max">
          {DEAL_FILTERS.map((filter) => {
            const active = activeFilter === filter.id;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`px-4 py-2 rounded-full text-label-md font-semibold tracking-wide whitespace-nowrap active:scale-95 transition-transform ${
                  active
                    ? 'bg-primary-container/10 text-on-primary-container border border-primary-container/20'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 flex flex-col gap-6 mb-8">
        {featured.map((deal) => (
          <article
            key={deal.id}
            className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden active:scale-[0.98] transition-transform"
          >
            <div className="relative h-48 w-full">
              <img src={deal.image} alt={deal.merchantName} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute top-4 left-4 bg-primary-container text-on-primary text-label-md font-semibold tracking-wide px-3 py-1 rounded-full shadow-sm flex items-center gap-1">
                <MaterialIcon name="local_offer" size={16} />
                {deal.badge}
              </div>
              <div className="absolute bottom-4 left-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-white p-1 shadow-md">
                  <img src={deal.logo} alt="" className="w-full h-full object-cover rounded-full" />
                </div>
                <h3 className="text-headline-md font-semibold text-white drop-shadow-md">{deal.merchantName}</h3>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <p className="text-body-lg font-semibold text-on-surface">{deal.title}</p>
                <p
                  className={`text-body-sm flex items-center gap-1 mt-1 ${
                    deal.urgent ? 'text-tertiary' : 'text-on-surface-variant'
                  }`}
                >
                  <MaterialIcon name={deal.urgent ? 'timer' : 'schedule'} size={16} />
                  {deal.validUntil}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('restaurant', { merchantId: deal.merchantId })}
                className="w-full bg-primary-container text-on-primary text-label-md font-semibold tracking-wide py-3 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
              >
                Order Now
              </button>
            </div>
          </article>
        ))}
      </div>

      {daily.length > 0 && (
        <div className="pl-4 mb-6">
          <div className="flex items-center justify-between pr-4 mb-4">
            <h3 className="text-headline-sm font-semibold text-on-surface">Daily Picks</h3>
            <button type="button" className="text-label-sm font-medium text-primary hover:underline">
              See All
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 pr-4 snap-x">
            {daily.map((pick) => (
              <button
                key={pick.id}
                type="button"
                onClick={() => onNavigate('restaurant', { merchantId: pick.merchantId })}
                className="min-w-[240px] w-[240px] bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden snap-start active:scale-[0.98] transition-transform text-left"
              >
                <div className="relative h-32 w-full">
                  <img src={pick.image} alt={pick.merchantName} className="w-full h-full object-cover" />
                  <div className="absolute top-2 left-2 bg-primary-container text-on-primary text-label-sm font-medium px-2 py-0.5 rounded-full shadow-sm">
                    {pick.badge}
                  </div>
                </div>
                <div className="p-3">
                  <h4 className="text-label-md font-semibold tracking-wide text-on-surface truncate">{pick.merchantName}</h4>
                  <p className="text-body-sm text-on-surface-variant truncate mt-1">{pick.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </PullToRefresh>
  );
}
