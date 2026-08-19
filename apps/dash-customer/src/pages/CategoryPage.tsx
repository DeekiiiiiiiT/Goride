import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DiscoverStoreCard } from '@/components/discovery/DiscoverStoreCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { RestaurantCardSkeleton } from '@/components/ui/RestaurantCardSkeleton';
import {
  HOME_VERTICAL_TABS,
  fetchDiscoverMerchants,
  filterMerchantsByCategory,
  applyCategoryListFilters,
  EMPTY_CATEGORY_FILTERS,
  type CategoryListFilters,
  type DiscoverMerchant,
} from '@/lib/merchantDiscovery';
import type { VerticalType } from '@roam/types';

type Props = {
  categoryId: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onBack: () => void;
};

const VERTICAL_IDS = new Set(HOME_VERTICAL_TABS.map((tab) => tab.id));

function categoryTitle(categoryId: string): string {
  if (categoryId === 'all') return 'All stores';
  const vertical = HOME_VERTICAL_TABS.find((tab) => tab.id === categoryId);
  if (vertical) return vertical.label;
  return categoryId.replace(/-/g, ' ');
}

export default function CategoryPage({ categoryId, onNavigate, onBack }: Props) {
  const [filters, setFilters] = useState<CategoryListFilters>(EMPTY_CATEGORY_FILTERS);
  const { data = [], isLoading } = useQuery({
    queryKey: ['discover-merchants', 'category'],
    queryFn: () => fetchDiscoverMerchants(),
  });
  const { data: promoData } = useQuery({
    queryKey: ['customer-promotions'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/promotions`, {
        headers: supabaseAnonFunctionHeaders(),
      });
      if (!res.ok) return { promotions: [] as Array<{ merchantId: string }> };
      return res.json() as Promise<{ promotions?: Array<{ merchantId: string }> }>;
    },
  });

  const offerIds = useMemo(
    () => new Set((promoData?.promotions ?? []).map((promo) => promo.merchantId)),
    [promoData],
  );

  const restaurants = useMemo(() => {
    const scoped: DiscoverMerchant[] = VERTICAL_IDS.has(categoryId as VerticalType)
      ? data.filter((m) => m.vertical_type === categoryId)
      : filterMerchantsByCategory(data, categoryId);
    return applyCategoryListFilters(scoped, filters, offerIds);
  }, [data, categoryId, filters, offerIds]);

  const title = categoryTitle(categoryId);

  return (
    <div className="pb-24 bg-background min-h-full">
      <header className="sticky top-0 z-50 bg-surface shadow-sm flex items-center justify-between px-4 min-h-16 safe-t">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="p-2 rounded-full bg-surface-container-high active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary capitalize">{title}</h1>
        <div className="w-10" />
      </header>

      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-sm py-4 border-b border-surface-variant/50 overflow-x-auto no-scrollbar px-4">
        <div className="flex items-center gap-3 min-w-max">
          <button
            type="button"
            onClick={() =>
              setFilters((prev) => ({ ...prev, sort: prev.sort === 'fee' ? 'rating' : 'fee' }))
            }
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              filters.sort === 'fee'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <MaterialIcon name="tune" size={18} />
            <span className="text-label-md font-semibold tracking-wide">
              {filters.sort === 'fee' ? 'Lowest fee' : 'Top rated'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, minRating4: !prev.minRating4 }))}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              filters.minRating4
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <MaterialIcon name="star" size={18} filled={filters.minRating4} />
            <span className="text-label-md font-semibold tracking-wide">4.0+ Rating</span>
          </button>
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, under30: !prev.under30 }))}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              filters.under30
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <span className="text-label-md font-semibold tracking-wide">Under 30 Min</span>
          </button>
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, offersOnly: !prev.offersOnly }))}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              filters.offersOnly
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <span className="text-label-md font-semibold tracking-wide">Offers</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-4">
        {isLoading ? (
          <RestaurantCardSkeleton count={2} />
        ) : restaurants.length === 0 ? (
          <EmptyState
            icon="restaurant"
            title="No matching stores"
            description={
              filters.offersOnly
                ? 'No live offers in this category right now. Clear Offers to see every store.'
                : 'Try another category or clear a filter.'
            }
          />
        ) : (
          restaurants.map((merchant) => (
            <DiscoverStoreCard
              key={merchant.id}
              merchant={merchant}
              onClick={() => onNavigate('restaurant', { merchantId: merchant.id })}
            />
          ))
        )}
      </div>
    </div>
  );
}
