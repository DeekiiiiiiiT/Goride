import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  BROWSE_CATEGORIES,
  RECENT_SEARCHES,
  TRENDING_SEARCHES,
} from '@/lib/discoverContent';

type SearchPageProps = {
  onSearch: (query: string) => void;
  onOpenDeals?: () => void;
  onOpenCategory?: (categoryId: string) => void;
  initialQuery?: string;
};

export default function SearchPage({
  onSearch,
  onOpenDeals,
  onOpenCategory,
  initialQuery = '',
}: SearchPageProps) {
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState(RECENT_SEARCHES);

  const submitSearch = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.toLowerCase() === 'pizza' && onOpenCategory) {
      onOpenCategory('pizza');
      return;
    }
    if (!recent.includes(trimmed)) {
      setRecent((items) => [trimmed, ...items].slice(0, 5));
    }
    onSearch(trimmed);
  };

  return (
    <div className="bg-background min-h-full flex flex-col safe-t">
      <header className="px-4 pt-6 pb-2 sticky top-0 z-40 bg-background/90 backdrop-blur-md">
        <h1 className="text-2xl font-semibold text-on-surface mb-4">What are you craving?</h1>
        <div className="relative group">
          <MaterialIcon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary pointer-events-none"
          />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitSearch(query);
            }}
            placeholder="Restaurants, groceries, dishes..."
            className="w-full h-[52px] pl-12 pr-12 bg-surface-container border-none rounded-lg text-base text-on-surface outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary transition-all shadow-sm placeholder:text-on-surface-variant/60 input-touch"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-primary"
            >
              <MaterialIcon name="close" />
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {onOpenDeals && (
          <section className="mt-4 px-4">
            <button
              type="button"
              onClick={onOpenDeals}
              className="w-full bg-primary-container/10 border border-primary-container/20 rounded-xl p-4 flex items-center justify-between active:scale-[0.98] transition-transform"
            >
              <div className="text-left">
                <p className="text-headline-sm font-semibold text-on-surface">Deals Near You</p>
                <p className="text-body-sm text-on-surface-variant mt-1">Discover the best offers in your area</p>
              </div>
              <MaterialIcon name="local_offer" className="text-primary text-3xl" filled />
            </button>
          </section>
        )}

        <section className={`${onOpenDeals ? 'mt-6' : 'mt-4'} px-4`}>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-sm font-semibold tracking-wide text-on-surface-variant uppercase">Recent</h2>
            <button
              type="button"
              onClick={() => setRecent([])}
              className="text-xs font-medium text-primary hover:opacity-80"
            >
              Clear
            </button>
          </div>
          <ul className="flex flex-col">
            {recent.map((item, index) => (
              <li key={item}>
                <div className="flex items-center justify-between py-4 border-b border-surface-container-highest/50 last:border-0">
                  <button
                    type="button"
                    onClick={() => submitSearch(item)}
                    className="flex items-center gap-4 flex-1 text-left group"
                  >
                    <MaterialIcon name="history" className="text-outline group-hover:text-primary transition-colors" />
                    <span className="text-base text-on-surface">{item}</span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${item}`}
                    onClick={() => setRecent((items) => items.filter((_, i) => i !== index))}
                    className="text-outline hover:text-error p-2 -mr-2"
                  >
                    <MaterialIcon name="close" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6 px-4">
          <h2 className="text-sm font-semibold tracking-wide text-on-surface-variant uppercase mb-4">Trending</h2>
          <div className="flex flex-wrap gap-2">
            {TRENDING_SEARCHES.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label === 'Pizza' && onOpenCategory) {
                    onOpenCategory('pizza');
                  } else {
                    submitSearch(item.label);
                  }
                }}
                className="flex items-center gap-1 px-4 py-2.5 bg-surface-container rounded-full text-sm font-semibold tracking-wide text-on-surface hover:bg-surface-variant active:scale-95 transition-all shadow-sm"
              >
                <MaterialIcon name={item.icon} className="text-lg text-primary" filled />
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-6 px-4 mb-8">
          <h2 className="text-xl font-semibold text-on-surface mb-4">Browse Categories</h2>
          <div className="grid grid-cols-2 gap-4">
            {BROWSE_CATEGORIES.map((category) => (
              <button
                key={category.label}
                type="button"
                onClick={() => submitSearch(category.label)}
                className={`relative rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform group ${
                  category.large ? 'col-span-2 aspect-[21/9]' : 'aspect-square'
                }`}
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-105"
                  style={{ backgroundImage: `url('${category.image}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-on-surface/80 via-on-surface/20 to-transparent" />
                <div className={`absolute bottom-4 left-4 ${category.large ? '' : ''}`}>
                  <span className={`text-white font-semibold ${category.large ? 'text-xl' : 'text-sm tracking-wide'}`}>
                    {category.label}
                  </span>
                  {'count' in category && category.count && (
                    <span className="block text-xs text-white/80">{category.count}</span>
                  )}
                </div>
              </button>
            ))}
            <button
              type="button"
              className="aspect-square rounded-xl overflow-hidden shadow-sm active:scale-[0.98] transition-transform bg-surface-container flex flex-col items-center justify-center gap-2 hover:bg-surface-variant"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MaterialIcon name="apps" className="text-primary text-[28px]" />
              </div>
              <span className="text-sm font-semibold tracking-wide text-on-surface">View All</span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
