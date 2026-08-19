import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ActiveOrderBanner } from '@/components/home/ActiveOrderBanner';
import { QuickReorderSection } from '@/components/home/QuickReorderSection';
import { DiscoverStoreCard } from '@/components/discovery/DiscoverStoreCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PromoCarousel } from '@/components/ui/PromoCarousel';
import { AddressPickerSheet } from '@/components/home/AddressPickerSheet';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { RestaurantCardSkeleton } from '@/components/ui/RestaurantCardSkeleton';
import { toast } from '@/lib/toast';
import {
  fetchDiscoverMerchants,
  HOME_VERTICAL_TABS,
  type DiscoverMerchant,
} from '@/lib/merchantDiscovery';
import type { VerticalType } from '@roam/types';
import { getSavedAddress, selectSavedAddress } from '@/lib/addressStorage';
import { getProfile, PROFILE_AVATAR } from '@/lib/accountContent';
import { fetchCustomerOrders } from '@/lib/customerApi';
import { isLiveOrderStatus } from '@/lib/ordersContent';

type HomePageProps = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onSearchFocus?: () => void;
  onSeeAll: (categoryId: VerticalType | 'all') => void;
  showQuickReorder?: boolean;
  onProfileClick?: () => void;
};

const POPULAR_PREVIEW = 4;

export default function HomePage({
  onNavigate,
  onSearchFocus,
  onSeeAll,
  showQuickReorder,
  onProfileClick,
}: HomePageProps) {
  const [selectedVertical, setSelectedVertical] = useState<VerticalType>('restaurant');
  const [merchants, setMerchants] = useState<DiscoverMerchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [addressOpen, setAddressOpen] = useState(false);
  const [addressTick, setAddressTick] = useState(0);
  const savedAddress = useMemo(() => getSavedAddress(), [addressTick]);
  const addressLabel = savedAddress
    ? `Deliver to · ${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : 'Set delivery address';

  const { data: ordersData } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: fetchCustomerOrders,
    retry: false,
  });

  const activeOrder = useMemo(() => {
    const rows = ordersData?.orders ?? [];
    const live = rows.find((o) => isLiveOrderStatus(o.status));
    if (!live) return null;
    return {
      id: String(live.id),
      orderNumber: String(live.order_number ?? ''),
      merchantName: String(live.merchant?.name ?? 'Store'),
      eta: '15-25 min',
      trackingStatus: String(live.status),
    };
  }, [ordersData]);

  const loadMerchants = useCallback(async (vertical: VerticalType) => {
    setLoading(true);
    setDiscoveryError(null);
    try {
      const { merchants: data } = await fetchDiscoverMerchants(vertical);
      setMerchants(data);
    } catch {
      setMerchants([]);
      setDiscoveryError('Could not load stores. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
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
      <header className="sticky top-0 z-40 flex min-h-16 w-full items-center justify-between border-b border-outline-variant/30 bg-surface px-4 shadow-sm safe-t">
        <button
          type="button"
          onClick={() => setAddressOpen(true)}
          className="flex max-w-[200px] items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1.5 shadow-sm transition-transform active:scale-95"
        >
          <MaterialIcon name="location_on" className="text-xl text-primary" />
          <span className="truncate text-label-lg font-semibold text-on-surface">{addressLabel}</span>
          <MaterialIcon name="keyboard_arrow_down" className="text-lg text-on-surface-variant" />
        </button>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notification settings"
            onClick={() => onNavigate('notification-settings')}
            className="relative flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
          >
            <MaterialIcon name="notifications" className="text-on-surface-variant" />
          </button>
          <button
            type="button"
            onClick={onProfileClick}
            className="h-9 w-9 overflow-hidden rounded-full border border-outline-variant"
          >
            <img alt="Profile" className="h-full w-full object-cover" src={getProfile().avatarUrl || PROFILE_AVATAR} />
          </button>
        </div>
      </header>

      <main className="pb-8">
        {activeOrder && (
          <section className="mx-auto mt-4 max-w-[1200px] px-4">
            <ActiveOrderBanner
              order={activeOrder}
              onTrack={() => onNavigate('tracking', { orderId: activeOrder.id })}
            />
          </section>
        )}

        <section className="mx-auto mt-6 max-w-[1200px] px-4">
          <div className="relative flex h-14 w-full items-center rounded-xl border border-outline-variant bg-white shadow-sm">
            <button
              type="button"
              onClick={onSearchFocus}
              className="flex h-full flex-1 items-center pl-4 pr-14 text-left"
            >
              <MaterialIcon name="search" className="text-on-surface-variant" />
              <span className="pl-3 text-body-md text-on-surface-variant">
                Search restaurants, groceries, stores...
              </span>
            </button>
            <button
              type="button"
              aria-label="Browse all stores"
              onClick={() => onSeeAll('all')}
              className="absolute right-3 rounded-lg p-2 text-primary transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="tune" />
            </button>
          </div>
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

        <PromoCarousel onPromoClick={() => onNavigate('promotions', { returnTo: 'home' })} />

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
              onClick={() => onSeeAll(selectedVertical)}
              className="flex items-center gap-1 text-label-lg font-semibold text-primary"
            >
              See all
              <MaterialIcon name="arrow_forward" className="text-lg" />
            </button>
          </div>
          <div className="flex flex-col gap-6">
            {loading ? (
              <RestaurantCardSkeleton count={2} />
            ) : discoveryError ? (
              <EmptyState
                icon="cloud_off"
                title="Could not load stores"
                description={discoveryError}
                actionLabel="Retry"
                onAction={() => void loadMerchants(selectedVertical)}
              />
            ) : filteredPopular.length === 0 ? (
              <EmptyState
                icon="storefront"
                title="No stores found"
                description="Try another category or pull to refresh."
                actionLabel="Show all food"
                onAction={() => setSelectedVertical('restaurant')}
              />
            ) : (
              filteredPopular.slice(0, POPULAR_PREVIEW).map((merchant) => (
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
      <AddressPickerSheet
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        onSelect={(address) => {
          void selectSavedAddress(address).then(() => {
            setAddressTick((n) => n + 1);
            setAddressOpen(false);
          });
        }}
        onAdd={() => {
          setAddressOpen(false);
          onNavigate('add-address', { returnTo: 'home' });
        }}
      />
    </PullToRefresh>
  );
}
