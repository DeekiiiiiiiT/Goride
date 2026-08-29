import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { RestaurantCardSkeleton } from '@/components/ui/RestaurantCardSkeleton';
import { DishResultCard } from '@/components/search/DishResultCard';
import { FilterSortSheet, sortLabel, type FilterState } from '@/components/search/FilterSortSheet';
import { useCart } from '@/hooks/useCart';
import { toast } from '@/lib/toast';
import { SEARCH_RESULTS } from '@/lib/discoverContent';
import { allowMocks } from '@/lib/mocksGate';
import { getRecentSearches } from '@/lib/searchRecents';
import { fetchDiscoverMerchants, type DiscoverMerchant } from '@/lib/merchantDiscovery';
import { getCheckoutLocation } from '@/lib/addressStorage';
import { NewCartModal } from '@/components/restaurant/NewCartModal';
import {
  applyDishFilters,
  applyRestaurantFilters,
  EMPTY_SEARCH_FILTERS,
  priceLevelFromCosts,
  type SearchableRestaurant,
} from '@/lib/searchResults';
import { type DishSearchResult } from '@/lib/searchDishes';
import { hapticLight, hapticSuccess } from '@/lib/haptics';

type SearchResultsPageProps = {
  query: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onClear: () => void;
  onQueryChange: (query: string) => void;
};

function merchantToSearchable(m: DiscoverMerchant): SearchableRestaurant {
  return {
    id: m.id,
    name: m.name,
    cuisines: m.cuisines,
    rating: m.rating,
    eta: m.eta,
    image: m.image,
    vertical_type: m.vertical_type,
    delivery: m.delivery,
    priceLevel: m.priceLevel,
    lat: m.lat,
    lng: m.lng,
  };
}

export default function SearchResultsPage({
  query,
  onNavigate,
  onClear,
  onQueryChange,
}: SearchResultsPageProps) {
  const [activeTab, setActiveTab] = useState<'restaurants' | 'dishes'>('restaurants');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(EMPTY_SEARCH_FILTERS);
  const { addItem, clearCart, merchantName } = useCart();
  const mocksOk = allowMocks();
  const [cartConflictOpen, setCartConflictOpen] = useState(false);
  const [pendingDishToAdd, setPendingDishToAdd] = useState<DishSearchResult | null>(null);

  const {
    data: merchants = [],
    refetch: refetchMerchants,
    isError: merchantsError,
    isLoading: merchantsLoading,
  } = useQuery({
    queryKey: ['search-merchants'],
    queryFn: async () => (await fetchDiscoverMerchants()).merchants,
    retry: false,
  });

  const {
    data: apiSearch,
    refetch: refetchApiSearch,
    isError: searchApiError,
  } = useQuery({
    queryKey: ['customer-search', query],
    queryFn: async () => {
      const q = query.trim();
      if (q.length < 2) return { merchants: [] as SearchableRestaurant[], items: [] as DishSearchResult[] };
      const res = await fetch(`${API_ENDPOINTS.delivery}/search?q=${encodeURIComponent(q)}`, {
        headers: supabaseAnonFunctionHeaders(),
      });
      if (!res.ok) throw new Error('Search failed');
      const json = await res.json();
      const searchMerchants = ((json.merchants as Array<Record<string, unknown>>) ?? []).map((m) => {
        const fee = m.deliveryFee != null ? Number(m.deliveryFee) : Number(m.delivery_fee ?? NaN);
        const minOrder = Number(m.minOrderAmount ?? m.min_order_amount ?? 0);
        const feeAmount = Number.isFinite(fee) ? fee : 0;
        return {
          id: String(m.id),
          name: String(m.name ?? ''),
          cuisines: String(m.cuisineType ?? m.cuisine_type ?? ''),
          rating: Number(m.rating ?? 0),
          eta: m.etaMins != null ? `${m.etaMins}-${Number(m.etaMins) + 10} min` : '25-35 min',
          image: String(m.coverImageUrl ?? m.logoUrl ?? m.cover_image_url ?? m.logo_url ?? ''),
          delivery: Number.isFinite(fee) ? (fee === 0 ? 'Free' : `J$${fee}`) : undefined,
          priceLevel: priceLevelFromCosts(minOrder, feeAmount),
        };
      });
      const items = ((json.items as Array<Record<string, unknown>>) ?? []).map((item) => ({
        itemId: String(item.id),
        name: String(item.name ?? ''),
        description: String(item.description ?? ''),
        price: Number(item.price ?? 0),
        image: String(item.imageUrl ?? item.image_url ?? ''),
        merchantId: String(item.merchantId ?? item.merchant_id ?? ''),
        merchantName: String(item.merchantName ?? ''),
        hasModifiers: false,
      }));
      return { merchants: searchMerchants, items };
    },
    enabled: query.trim().length >= 2,
    retry: false,
  });

  const handleRefresh = useCallback(async () => {
    const [merchantsResult, searchResult] = await Promise.all([
      refetchMerchants(),
      refetchApiSearch(),
    ]);
    if (merchantsResult.isError || searchResult.isError) {
      toast.error('Could not refresh results');
      return;
    }
    toast.success('Results updated');
  }, [refetchMerchants, refetchApiSearch]);

  const dishResults = applyDishFilters(apiSearch?.items ?? [], filters);
  const discoverById = useMemo(() => new Map(merchants.map((m) => [m.id, m])), [merchants]);

  const restaurantSource: SearchableRestaurant[] = useMemo(() => {
    const enrich = (row: SearchableRestaurant): SearchableRestaurant => {
      const live = discoverById.get(row.id);
      if (!live) return row;
      return {
        ...row,
        delivery: row.delivery || live.delivery,
        priceLevel: row.priceLevel || live.priceLevel,
        lat: row.lat ?? live.lat,
        lng: row.lng ?? live.lng,
        eta: row.eta || live.eta,
        image: row.image || live.image,
      };
    };

    if (apiSearch?.merchants && apiSearch.merchants.length > 0) {
      return apiSearch.merchants.map(enrich);
    }
    if (merchants.length > 0) {
      return merchants.map(merchantToSearchable);
    }
    if (mocksOk) {
      return SEARCH_RESULTS.map((r) => ({
        id: r.id,
        name: r.name,
        cuisines: r.cuisines,
        rating: r.rating,
        eta: r.eta,
        image: r.image,
        tags: r.tags,
        delivery: r.delivery,
      }));
    }
    return [];
  }, [apiSearch?.merchants, merchants, mocksOk, discoverById]);

  const filteredResults = useMemo(
    () => applyRestaurantFilters(restaurantSource, filters, query, getCheckoutLocation()),
    [filters, query, restaurantSource],
  );

  const handleDishAdd = (dish: DishSearchResult) => {
    if (dish.hasModifiers) {
      onNavigate('restaurant', { merchantId: dish.merchantId, itemId: dish.itemId });
      return;
    }
    hapticLight();
    const result = addItem(
      {
        itemId: dish.itemId,
        merchantId: dish.merchantId,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        imageUrl: dish.image,
      },
      dish.merchantName || 'Restaurant',
    );

    if (result === 'conflict') {
      setPendingDishToAdd(dish);
      setCartConflictOpen(true);
      return;
    }

    hapticSuccess();
    toast.itemAdded(dish.name);
  };

  const handleCartConflictConfirm = () => {
    if (!pendingDishToAdd) return;
    const dish = pendingDishToAdd;
    clearCart();
    // After clearing, the new dish can be added safely. Passing replace keeps intent explicit.
    addItem(
      {
        itemId: dish.itemId,
        merchantId: dish.merchantId,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        imageUrl: dish.image,
      },
      dish.merchantName || 'Restaurant',
      { replace: true },
    );
    setCartConflictOpen(false);
    setPendingDishToAdd(null);
    hapticSuccess();
    toast.itemAdded(dish.name);
  };

  const handleCartConflictCancel = () => {
    setCartConflictOpen(false);
    setPendingDishToAdd(null);
  };

  const suggestions = getRecentSearches();

  return (
    <PullToRefresh onRefresh={handleRefresh} className="flex min-h-full flex-col bg-background pb-24">
      <NewCartModal
        open={cartConflictOpen}
        currentRestaurant={merchantName || pendingDishToAdd?.merchantName || 'Restaurant'}
        onConfirm={handleCartConflictConfirm}
        onCancel={handleCartConflictCancel}
      />
      <section className="sticky top-16 z-30 bg-background px-4 pt-4 pb-4">
        <div className="group relative mb-4 w-full">
          <MaterialIcon name="search" className="absolute top-1/2 left-3 ml-1 -translate-y-1/2 text-outline" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !query.trim()) onClear();
            }}
            className="w-full rounded-xl border-none bg-[#F3F4F6] py-3 pr-12 pl-12 text-base text-on-surface shadow-sm transition-all focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:outline-none"
          />
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-surface-container p-2 transition-colors hover:bg-surface-variant"
          >
            <MaterialIcon name="close" className="text-sm text-on-surface-variant" />
          </button>
        </div>

        <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide whitespace-nowrap"
          >
            <MaterialIcon name="tune" className="text-lg" />
            {sortLabel(filters.sort)}
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide whitespace-nowrap"
          >
            {filters.rating ? `${filters.rating}+` : 'Rating'}
            <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide whitespace-nowrap"
          >
            {filters.deliveryFee ? 'Fee filter on' : 'Delivery fee'}
            <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide whitespace-nowrap"
          >
            {filters.prices.length ? filters.prices.join(' ') : 'Price'}
            <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
          </button>
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide whitespace-nowrap"
          >
            {filters.dietary.length ? 'Dietary on' : 'Dietary'}
            <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
          </button>
        </div>
      </section>

      <section className="mb-4 flex gap-6 border-b border-surface-variant px-4">
        <button
          type="button"
          onClick={() => setActiveTab('restaurants')}
          className={`border-b-2 pb-3 text-sm font-semibold tracking-wide ${
            activeTab === 'restaurants'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          Restaurants ({filteredResults.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('dishes')}
          className={`border-b-2 pb-3 text-sm font-semibold tracking-wide ${
            activeTab === 'dishes'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          Dishes ({dishResults.length})
        </button>
      </section>

      <section className="flex flex-col gap-6 px-4 pb-8">
        {activeTab === 'restaurants' ? (
          merchantsLoading && !mocksOk ? (
            <RestaurantCardSkeleton count={2} />
          ) : merchantsError && !mocksOk ? (
            <EmptyState
              icon="cloud_off"
              title="Could not load stores"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void refetchMerchants()}
            />
          ) : searchApiError && query.trim().length >= 2 && !mocksOk ? (
            <EmptyState
              icon="cloud_off"
              title="Search unavailable"
              description="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void refetchApiSearch()}
            />
          ) : filteredResults.length === 0 ? (
            <div className="flex flex-col gap-4">
              <EmptyState
                icon="search_off"
                title="No restaurants found"
                description={
                  query.trim()
                    ? `We couldn't find matches for "${query}". Try a different search.`
                    : 'No restaurants available yet.'
                }
                actionLabel="Clear search"
                onAction={onClear}
              />
              {suggestions.length > 0 && (
                <div className="flex flex-wrap justify-center gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => onQueryChange(s)}
                      className="rounded-full bg-surface-container px-4 py-2 text-sm font-semibold text-on-surface"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            filteredResults.map((restaurant) => (
              <div
                key={restaurant.id}
                role="button"
                tabIndex={0}
                onClick={() =>
                  onNavigate('restaurant', {
                    merchantId: restaurant.id,
                    verticalType: restaurant.vertical_type,
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onNavigate('restaurant', {
                      merchantId: restaurant.id,
                      verticalType: restaurant.vertical_type,
                    });
                  }
                }}
                className="cursor-pointer overflow-hidden rounded-[24px] bg-surface-container-lowest text-left shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.98]"
              >
                <div className="relative h-48 w-full">
                  {restaurant.image ? (
                    <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.image} />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                      <MaterialIcon name="storefront" className="text-5xl text-outline" />
                    </div>
                  )}
                  <FavoriteButton
                    merchantId={restaurant.id}
                    merchantName={restaurant.name}
                    className="absolute top-4 right-4 !h-10 !w-10 rounded-full bg-surface-container-lowest/80 backdrop-blur-sm"
                  />
                  <div className="absolute bottom-4 left-4 rounded-full bg-surface-container-lowest/90 px-3 py-1 backdrop-blur-md">
                    <span className="text-sm font-semibold tracking-wide text-on-surface">{restaurant.eta}</span>
                  </div>
                </div>
                <div className="bg-surface-container-lowest p-4">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="text-xl font-semibold text-on-surface">{restaurant.name}</h3>
                    <div className="flex items-center gap-1 rounded-md bg-surface-container px-2 py-1">
                      <MaterialIcon name="star" className="text-base text-[#F59E0B]" filled />
                      <span className="text-xs font-medium">{restaurant.rating}</span>
                    </div>
                  </div>
                  <p className="mb-4 text-sm text-outline">{restaurant.cuisines}</p>
                  <div className="flex flex-wrap gap-2">
                    {restaurant.tags?.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          tag === 'Popular'
                            ? 'bg-[#F59E0B]/10 text-[#D97706]'
                            : 'bg-surface-variant text-on-surface-variant'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )
        ) : dishResults.length === 0 ? (
          <div className="flex flex-col gap-4">
            <EmptyState
              icon="restaurant"
              title="No dishes found"
              description={
                query.trim()
                  ? `No menu items matched "${query}". Try the restaurant name, or a dish like jerk or pizza.`
                  : 'Search for a dish to add it from a restaurant menu.'
              }
              actionLabel="Show restaurants"
              onAction={() => setActiveTab('restaurants')}
            />
          </div>
        ) : (
          dishResults.map((dish) => (
            <DishResultCard
              key={`${dish.merchantId}-${dish.itemId}`}
              dish={dish}
              onAdd={handleDishAdd}
              onOpenRestaurant={(id) => onNavigate('restaurant', { merchantId: id })}
            />
          ))
        )}
      </section>

      <FilterSortSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        value={filters}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        resultCount={filteredResults.length}
      />
    </PullToRefresh>
  );
}
