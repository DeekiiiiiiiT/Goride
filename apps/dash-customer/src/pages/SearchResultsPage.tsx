import { useCallback, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DishResultCard } from '@/components/search/DishResultCard';
import { FilterSortSheet, type FilterState } from '@/components/search/FilterSortSheet';
import { useCart } from '@/hooks/useCart';
import { toast } from '@/lib/toast';
import { RECENT_SEARCHES, SEARCH_RESULTS } from '@/lib/discoverContent';
import { searchDishes, type DishSearchResult } from '@/lib/searchDishes';
import { getGroupedSearchResults } from '@/lib/searchGroupedResults';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { getRestaurantProfile } from '@/lib/restaurantContent';
import type { VerticalType } from '@roam/types';

type SearchResultsPageProps = {
  query: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onClear: () => void;
  onQueryChange: (query: string) => void;
};

const VERTICAL_FILTERS: { id: 'all' | VerticalType | 'retail'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'restaurant', label: 'Food' },
  { id: 'grocery', label: 'Grocery' },
  { id: 'retail', label: 'Retail' },
  { id: 'alcohol', label: 'Alcohol' },
];

function applyRestaurantFilters(results: typeof SEARCH_RESULTS, filters: FilterState, query: string) {
  let list = results.filter(
    (r) =>
      !query ||
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.cuisines.toLowerCase().includes(query.toLowerCase()),
  );

  if (filters.sort === 'rating') {
    list = [...list].sort((a, b) => b.rating - a.rating);
  } else if (filters.sort === 'fastest') {
    list = [...list].sort((a, b) => parseInt(a.eta, 10) - parseInt(b.eta, 10));
  }

  if (filters.rating) {
    const min = parseFloat(filters.rating);
    list = list.filter((r) => r.rating >= min);
  }

  return list;
}

export default function SearchResultsPage({
  query,
  onNavigate,
  onClear,
  onQueryChange,
}: SearchResultsPageProps) {
  const [activeTab, setActiveTab] = useState<'restaurants' | 'dishes'>('restaurants');
  const [verticalFilter, setVerticalFilter] = useState<'all' | VerticalType | 'retail'>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sort: 'recommended',
    prices: [],
    rating: '',
    dietary: [],
    deliveryFee: '',
  });
  const { addItem } = useCart();

  const groupedResults = useMemo(() => getGroupedSearchResults(query), [query]);

  const handleRefresh = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 600));
    toast.success('Results updated');
  }, []);

  const dishResults = useMemo(() => searchDishes(query), [query]);
  const filteredResults = useMemo(
    () => applyRestaurantFilters(SEARCH_RESULTS, filters, query),
    [filters, query],
  );

  const handleDishAdd = (dish: DishSearchResult) => {
    if (dish.hasModifiers) {
      onNavigate('restaurant', { merchantId: dish.merchantId, itemId: dish.itemId });
      return;
    }
    const profile = getRestaurantProfile(dish.merchantId);
    hapticLight();
    addItem(
      {
        itemId: dish.itemId,
        merchantId: dish.merchantId,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        imageUrl: dish.image,
      },
      profile.name,
    );
    hapticSuccess();
    toast.itemAdded(dish.name);
  };

  const suggestions = RECENT_SEARCHES;

  if (groupedResults) {
    const showRestaurants = verticalFilter === 'all' || verticalFilter === 'restaurant';
    const showGrocery = verticalFilter === 'all' || verticalFilter === 'grocery';
    const showProducts = verticalFilter === 'all' || verticalFilter === 'retail';

    return (
      <PullToRefresh onRefresh={handleRefresh} className="flex min-h-full flex-col bg-background pb-24">
        <section className="sticky top-0 z-50 border-b border-outline-variant/30 bg-surface px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 flex-1 items-center rounded-full border border-outline-variant bg-surface-container-low px-3">
              <MaterialIcon name="search" className="mr-2 text-on-surface-variant" />
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                className="w-full border-none bg-transparent p-0 text-body-md focus:ring-0"
              />
              <button type="button" aria-label="Clear search" onClick={onClear}>
                <MaterialIcon name="close" className="text-on-surface-variant" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="rounded-full p-2 transition-colors hover:bg-surface-container"
            >
              <MaterialIcon name="tune" className="text-on-surface-variant" />
            </button>
          </div>
        </section>

        <div className="sticky top-[64px] z-40 border-b border-outline-variant/10 bg-background/95 py-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center gap-1 px-4 text-on-surface-variant">
            <span className="text-label-md uppercase tracking-wider">Sort by:</span>
            <button type="button" className="flex items-center gap-1 text-label-md opacity-70">
              Relevance
              <MaterialIcon name="expand_more" className="text-base" />
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto px-4 no-scrollbar">
            {VERTICAL_FILTERS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setVerticalFilter(chip.id)}
                className={`whitespace-nowrap rounded-full px-6 py-2 text-label-lg font-semibold transition-all active:scale-95 ${
                  verticalFilter === chip.id
                    ? 'bg-primary-container text-on-primary-container'
                    : 'bg-surface-container-highest text-on-surface-variant hover:bg-surface-variant'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-8 px-4">
          {showRestaurants && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-headline-md font-bold text-on-surface">Restaurants</h2>
                <button type="button" className="text-label-lg font-semibold text-primary">
                  See All
                </button>
              </div>
              <div className="space-y-4">
                {groupedResults.restaurants.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    type="button"
                    onClick={() => onNavigate('restaurant', { merchantId: restaurant.id })}
                    className="flex overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-square w-1/3">
                      <img alt={restaurant.name} src={restaurant.image} className="h-full w-full object-cover" />
                      {restaurant.badge && (
                        <span
                          className={`absolute left-2 top-2 rounded-lg px-2 py-1 text-label-md font-semibold ${restaurant.badgeClass}`}
                        >
                          {restaurant.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col justify-center p-4">
                      <h3 className="text-label-lg font-semibold text-on-surface">{restaurant.name}</h3>
                      <p className="text-body-md text-on-surface-variant">{restaurant.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <MaterialIcon name="star" className="text-lg text-primary" />
                        <span className="text-label-md text-on-surface">
                          {restaurant.rating} ({restaurant.ratingCount})
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {showGrocery && (
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-headline-md font-bold text-on-surface">Grocery</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('restaurant', { merchantId: 'fresh-mart', verticalType: 'grocery' })}
                  className="text-label-lg font-semibold text-primary"
                >
                  Explore
                </button>
              </div>
              {groupedResults.grocery.map((item) => (
                <div
                  key={item.productName}
                  className="flex items-center gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-4 shadow-sm"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-container-high">
                    <img alt={item.productName} src={item.image} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-label-md uppercase text-primary">{item.storeName}</p>
                    <h3 className="text-label-lg font-semibold leading-tight text-on-surface">{item.productName}</h3>
                    <p className="text-body-md text-on-surface-variant">
                      {item.price} • {item.stock}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate('restaurant', { merchantId: item.storeId, verticalType: 'grocery' })
                    }
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary active:scale-90"
                  >
                    <MaterialIcon name="add" />
                  </button>
                </div>
              ))}
            </section>
          )}

          {showProducts && (
            <section>
              <h2 className="mb-4 text-headline-md font-bold text-on-surface">Products</h2>
              <div className="grid grid-cols-2 gap-4">
                {groupedResults.products.map((product) => (
                  <div key={product.id} className="flex flex-col">
                    <div className="relative mb-2 aspect-square overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
                      <img alt={product.name} src={product.image} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface shadow-md active:scale-95"
                      >
                        <MaterialIcon name="add" className="text-xl text-primary" />
                      </button>
                    </div>
                    <h4 className="text-label-md font-semibold text-on-surface">{product.name}</h4>
                    <p className="text-body-md text-on-surface-variant">{product.price}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <FilterSortSheet
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setFilters(next);
            setFiltersOpen(false);
          }}
          resultCount={groupedResults.restaurants.length}
        />
      </PullToRefresh>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="flex min-h-full flex-col bg-background pb-24">
      <section className="sticky top-16 z-30 bg-background px-4 pb-4 pt-4">
        <div className="group relative mb-4 w-full">
          <MaterialIcon name="search" className="absolute left-3 top-1/2 ml-1 -translate-y-1/2 text-outline" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !query.trim()) onClear();
            }}
            className="w-full rounded-xl border-none bg-[#F3F4F6] py-3 pl-12 pr-12 text-base text-on-surface shadow-sm transition-all focus:bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-surface-container p-2 transition-colors hover:bg-surface-variant"
          >
            <MaterialIcon name="close" className="text-sm text-on-surface-variant" />
          </button>
        </div>

        <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide"
          >
            <MaterialIcon name="tune" className="text-lg" />
            Sort
          </button>
          {['Price', 'Rating', 'Dietary'].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-outline-variant bg-surface-container px-4 py-2 text-sm font-semibold tracking-wide"
            >
              {label}
              <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
            </button>
          ))}
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
          filteredResults.length === 0 ? (
            <div className="flex flex-col gap-4">
              <EmptyState
                icon="search_off"
                title="No restaurants found"
                description={`We couldn't find matches for "${query}". Try a different search.`}
                actionLabel="Clear search"
                onAction={onClear}
              />
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
            </div>
          ) : (
            filteredResults.map((restaurant) => (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => onNavigate('restaurant', { merchantId: restaurant.id })}
                className="cursor-pointer overflow-hidden rounded-[24px] bg-surface-container-lowest text-left shadow-[0px_4px_20px_rgba(0,0,0,0.04)] transition-transform active:scale-[0.98]"
              >
                <div className="relative h-48 w-full">
                  <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.image} />
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Save"
                    className="absolute right-4 top-4 rounded-full bg-surface-container-lowest/80 p-2 text-on-surface backdrop-blur-sm"
                  >
                    <MaterialIcon name="favorite" />
                  </button>
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
              </button>
            ))
          )
        ) : dishResults.length === 0 ? (
          <div className="flex flex-col gap-4">
            <EmptyState
              icon="restaurant"
              title="No dishes found"
              description="Try searching for jerk, pizza, or sushi."
              actionLabel="Clear search"
              onAction={onClear}
            />
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
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        resultCount={filteredResults.length}
      />
    </PullToRefresh>
  );
}
