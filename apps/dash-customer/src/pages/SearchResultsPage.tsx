import React, { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { FilterSortSheet } from '@/components/search/FilterSortSheet';
import { toast } from '@/lib/toast';
import { SEARCH_RESULTS } from '@/lib/discoverContent';

type SearchResultsPageProps = {
  query: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onClear: () => void;
  onQueryChange: (query: string) => void;
};

export default function SearchResultsPage({
  query,
  onNavigate,
  onClear,
  onQueryChange,
}: SearchResultsPageProps) {
  const [activeTab, setActiveTab] = useState<'restaurants' | 'dishes'>('restaurants');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleRefresh = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 600));
    toast.success('Results updated');
  }, []);

  const filteredResults = SEARCH_RESULTS.filter(
    (r) => !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.cuisines.toLowerCase().includes(query.toLowerCase())
  );

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
          Restaurants (12)
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
          Dishes (45)
        </button>
      </section>

      <section className="px-4 flex flex-col gap-6 pb-8">
        {activeTab === 'restaurants' ? (
          filteredResults.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No restaurants found"
              description={`We couldn't find matches for "${query}". Try a different search.`}
              actionLabel="Clear search"
              onAction={onClear}
            />
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
        ) : (
          <EmptyState
            icon="restaurant"
            title="Dish search coming soon"
            description={`Individual dish results for "${query}" will be available in a future update.`}
          />
        )}
      </section>

      <FilterSortSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={() => undefined} />
    </PullToRefresh>
  );
}
