import { useCallback, useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ActiveOrderBanner } from '@/components/home/ActiveOrderBanner';
import { QuickReorderSection } from '@/components/home/QuickReorderSection';
import { DiscoverStoreCard } from '@/components/discovery/DiscoverStoreCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PromoCarousel } from '@/components/ui/PromoCarousel';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { RestaurantCardSkeleton } from '@/components/ui/RestaurantCardSkeleton';
import { toast } from '@/lib/toast';
import {
  fetchDiscoverMerchants,
  HOME_VERTICAL_TABS,
  type DiscoverMerchant,
} from '@/lib/merchantDiscovery';
import type { VerticalType } from '@roam/types';
import { getSavedAddress } from '@/lib/addressStorage';

type HomePageProps = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onSearchFocus?: () => void;
  showActiveOrder?: boolean;
  showQuickReorder?: boolean;
  onProfileClick?: () => void;
};

export default function HomePage({
  onNavigate,
  onSearchFocus,
  showActiveOrder,
  showQuickReorder,
  onProfileClick,
}: HomePageProps) {
  const [selectedVertical, setSelectedVertical] = useState<VerticalType>('restaurant');
  const [merchants, setMerchants] = useState<DiscoverMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const savedAddress = getSavedAddress();
  const addressLabel = savedAddress
    ? `Deliver to · ${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : 'Deliver to · 45 Constant Spring Rd';

  const loadMerchants = useCallback(async (vertical: VerticalType) => {
    setLoading(true);
    const data = await fetchDiscoverMerchants(vertical);
    setMerchants(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMerchants(selectedVertical);
  }, [loadMerchants, selectedVertical]);

  const handleRefresh = useCallback(async () => {
    await loadMerchants(selectedVertical);
    toast.success('Feed updated');
  }, [loadMerchants, selectedVertical]);

  const filteredPopular = useMemo(() => {
    if (selectedVertical === 'restaurant') return merchants;
    return merchants.filter((m) => m.vertical_type === selectedVertical);
  }, [merchants, selectedVertical]);

  const openStore = (merchant: DiscoverMerchant) => {
    onNavigate('restaurant', {
      merchantId: merchant.id,
      verticalType: merchant.vertical_type,
    });
  };

  return (
    <PullToRefresh onRefresh={handleRefresh} className="min-h-full bg-surface">
      <header className="sticky top-0 z-40 flex h-16 w-full items-center justify-between border-b border-outline-variant/30 bg-surface px-4 shadow-sm safe-t">
        <button
          type="button"
          onClick={() => onNavigate('addresses')}
          className="flex max-w-[200px] items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 shadow-sm transition-transform active:scale-95"
        >
          <MaterialIcon name="location_on" className="text-xl text-primary" />
          <span className="truncate text-label-lg font-semibold text-on-surface">{addressLabel}</span>
          <MaterialIcon name="keyboard_arrow_down" className="text-lg text-on-surface-variant" />
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
          >
            <MaterialIcon name="notifications" className="text-on-surface-variant" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
          </button>
          <button
            type="button"
            onClick={onProfileClick}
            className="h-9 w-9 overflow-hidden rounded-full border border-outline-variant"
          >
            <img alt="Profile" className="h-full w-full object-cover" src="/images/avatar.png" />
          </button>
        </div>
      </header>

      {showActiveOrder ? (
        <main className="mx-auto mt-4 flex max-w-[1200px] flex-col gap-6 px-4">
          <ActiveOrderBanner onTrack={() => onNavigate('tracking', { orderId: '8492' })} />
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-on-surface">Recommended for you</h2>
            {loading ? (
              <RestaurantCardSkeleton count={2} variant="card" />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {filteredPopular.slice(0, 4).map((item) => (
                  <DiscoverStoreCard key={item.id} merchant={item} onClick={() => openStore(item)} />
                ))}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main className="pb-8">
          <section className="mx-auto mt-6 max-w-[1200px] px-4">
            <button
              type="button"
              onClick={onSearchFocus}
              className="group relative flex h-14 w-full items-center rounded-xl border border-outline-variant bg-white shadow-sm transition-all"
            >
              <MaterialIcon
                name="search"
                className="pointer-events-none absolute left-4 text-on-surface-variant"
              />
              <span className="pl-12 text-body-md text-on-surface-variant">
                Search restaurants, groceries, stores...
              </span>
              <span className="absolute right-4 rounded-lg p-1 text-primary transition-colors group-hover:bg-surface-container">
                <MaterialIcon name="tune" />
              </span>
            </button>
          </section>

          <section className="mt-6 overflow-x-auto no-scrollbar">
            <div className="flex min-w-max gap-3 px-4 pb-2">
              {HOME_VERTICAL_TABS.map((tab) => {
                const active = selectedVertical === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedVertical(tab.id)}
                    className={`flex items-center gap-2 whitespace-nowrap rounded-full px-6 py-2.5 text-label-lg font-semibold transition-all active:scale-95 ${
                      active
                        ? 'bg-primary text-on-primary shadow-md'
                        : 'border border-outline-variant bg-white text-on-surface-variant hover:bg-surface-container-low'
                    }`}
                  >
                    <MaterialIcon
                      name={tab.icon}
                      className="text-xl"
                      filled={active && tab.filled}
                    />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </section>

          <PromoCarousel onPromoClick={() => onNavigate('promotions')} />

          {showQuickReorder && (
            <div className="mt-4">
              <QuickReorderSection onNavigate={onNavigate} />
            </div>
          )}

          <section className="mx-auto mt-8 max-w-[1200px] px-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-headline-lg-mobile font-bold text-on-surface">Popular near you</h2>
              <button
                type="button"
                className="flex items-center gap-1 text-label-lg font-semibold text-primary"
              >
                See all
                <MaterialIcon name="arrow_forward" className="text-lg" />
              </button>
            </div>
            <div className="flex flex-col gap-6">
              {loading ? (
                <RestaurantCardSkeleton count={2} />
              ) : filteredPopular.length === 0 ? (
                <EmptyState
                  icon="storefront"
                  title="No stores found"
                  description="Try another category or pull to refresh."
                  actionLabel="Show all food"
                  onAction={() => setSelectedVertical('restaurant')}
                />
              ) : (
                filteredPopular.map((merchant) => (
                  <DiscoverStoreCard
                    key={merchant.id}
                    merchant={merchant}
                    onClick={() => openStore(merchant)}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      )}
    </PullToRefresh>
  );
}
