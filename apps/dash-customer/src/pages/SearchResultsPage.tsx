import React, { useCallback, useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DishResultCard } from '@/components/search/DishResultCard';
import { FilterSortSheet, type FilterState } from '@/components/search/FilterSortSheet';
import { useCart } from '@/hooks/useCart';
import { toast } from '@/lib/toast';
import { RECENT_SEARCHES, SEARCH_RESULTS } from '@/lib/discoverContent';
import { searchDishes, type DishSearchResult } from '@/lib/searchDishes';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { getRestaurantProfile } from '@/lib/restaurantContent';

type SearchResultsPageProps = {
  query: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onClear: () => void;
  onQueryChange: (query: string) => void;
};

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sort: 'recommended',
    prices: [],
    rating: '',
    dietary: [],
    deliveryFee: '',
  });
  const { addItem } = useCart();

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

  return (
    <PullToRefresh onRefresh={handleRefresh} className="pb-24 bg-background min-h-full flex flex-col">
      <section className="px-4 pt-4 pb-4 sticky top-16 bg-background z-30">
        <div className="relative w-full mb-4 group">
          <MaterialIcon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-outline ml-1" />
          <input
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !query.trim()) onClear();
            }}
            className="w-full bg-[#F3F4F6] text-on-surface text-base rounded-xl py-3 pl-12 pr-12 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all border-none shadow-sm"
          />
          <button
            type="button"
            aria-label="Clear search"
            onClick={onClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-surface-container hover:bg-surface-variant transition-colors"
          >
            <MaterialIcon name="close" className="text-on-surface-variant text-sm" />
          </button>
        </div>

        <div className="flex overflow-x-auto scrollbar-hide gap-2 pb-1">
          <button
            type="button"
            onClick={() => setFiltersOpen(true)}
            className="flex items-center gap-1 whitespace-nowrap px-4 py-2 rounded-full bg-surface-container border border-outline-variant text-sm font-semibold tracking-wide shrink-0"
          >
            <MaterialIcon name="tune" className="text-lg" />
            Sort
          </button>
          {['Price', 'Rating', 'Dietary'].map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="flex items-center gap-1 whitespace-nowrap px-4 py-2 rounded-full bg-surface-container border border-outline-variant text-sm font-semibold tracking-wide shrink-0"
            >
              {label}
              <MaterialIcon name="keyboard_arrow_down" className="text-lg" />
            </button>
          ))}
        </div>
      </section>

      <section className="px-4 mb-4 border-b border-surface-variant flex gap-6">
        <button
          type="button"
          onClick={() => setActiveTab('restaurants')}
          className={`pb-3 border-b-2 text-sm font-semibold tracking-wide ${
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
          className={`pb-3 border-b-2 text-sm font-semibold tracking-wide ${
            activeTab === 'dishes'
              ? 'border-primary text-primary'
              : 'border-transparent text-outline hover:text-on-surface'
          }`}
        >
          Dishes ({dishResults.length})
        </button>
      </section>

      <section className="px-4 flex flex-col gap-6 pb-8">
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
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onQueryChange(s)}
                    className="px-4 py-2 rounded-full bg-surface-container text-sm font-semibold text-on-surface"
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
                className="bg-surface-container-lowest rounded-[24px] overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform cursor-pointer text-left"
              >
                <div className="w-full h-48 relative">
                  <img alt={restaurant.name} className="w-full h-full object-cover" src={restaurant.image} />
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Save"
                    className="absolute top-4 right-4 p-2 bg-surface-container-lowest/80 backdrop-blur-sm rounded-full text-on-surface"
                  >
                    <MaterialIcon name="favorite" />
                  </button>
                  <div className="absolute bottom-4 left-4 bg-surface-container-lowest/90 backdrop-blur-md px-3 py-1 rounded-full">
                    <span className="text-sm font-semibold tracking-wide text-on-surface">{restaurant.eta}</span>
                  </div>
                </div>
                <div className="p-4 bg-surface-container-lowest">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-semibold text-on-surface">{restaurant.name}</h3>
                    <div className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded-md">
                      <MaterialIcon name="star" className="text-base text-[#F59E0B]" filled />
                      <span className="text-xs font-medium">{restaurant.rating}</span>
                    </div>
                  </div>
                  <p className="text-sm text-outline mb-4">{restaurant.cuisines}</p>
                  <div className="flex gap-2 flex-wrap">
                    {restaurant.tags?.map((tag) => (
                      <span
                        key={tag}
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
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
              description={`Try searching for jerk, pizza, or sushi.`}
              actionLabel="Clear search"
              onAction={onClear}
            />
            <div className="flex flex-wrap gap-2 justify-center">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onQueryChange(s)}
                  className="px-4 py-2 rounded-full bg-surface-container text-sm font-semibold text-on-surface"
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
