import React, { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

export type FilterState = {
  sort: string;
  prices: string[];
  rating: string;
  dietary: string[];
  deliveryFee: string;
};

const DEFAULT_FILTERS: FilterState = {
  sort: 'recommended',
  prices: ['1', '2'],
  rating: '4.5',
  dietary: ['vegetarian'],
  deliveryFee: 'under_100',
};

type FilterSortSheetProps = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
  resultCount?: number;
};

const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'fastest', label: 'Fastest Delivery' },
  { value: 'rating', label: 'Rating' },
  { value: 'distance', label: 'Distance' },
  { value: 'price_asc', label: 'Price: Low to High' },
  { value: 'price_desc', label: 'Price: High to Low' },
];

const PRICE_OPTIONS = ['$', '$$', '$$$', '$$$$'];
const RATING_OPTIONS = ['4.5', '4.0', '3.5'];
const DIETARY_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'halal', label: 'Halal' },
  { value: 'gluten_free', label: 'Gluten-free' },
];
const DELIVERY_FEE_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'under_100', label: 'Under J$100' },
  { value: 'under_200', label: 'Under J$200' },
];

export function FilterSortSheet({ open, onClose, onApply, resultCount = 124 }: FilterSortSheetProps) {
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  if (!open) return null;

  const togglePrice = (index: string) => {
    setFilters((prev) => ({
      ...prev,
      prices: prev.prices.includes(index)
        ? prev.prices.filter((p) => p !== index)
        : [...prev.prices, index],
    }));
  };

  const toggleDietary = (value: string) => {
    setFilters((prev) => ({
      ...prev,
      dietary: prev.dietary.includes(value)
        ? prev.dietary.filter((d) => d !== value)
        : [...prev.dietary, value],
    }));
  };

  const reset = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-on-surface/40" onClick={onClose} />
      <div className="absolute bottom-0 left-0 right-0 bg-surface rounded-t-[24px] flex flex-col max-h-[85dvh] shadow-[0px_-10px_30px_rgba(0,0,0,0.1)]">
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-outline-variant rounded-full" />
        </div>

        <div className="px-4 pb-4 flex justify-between items-center border-b border-surface-variant">
          <h2 className="text-2xl font-semibold text-on-surface">Filter &amp; Sort</h2>
          <button type="button" onClick={reset} className="text-sm font-semibold tracking-wide text-primary">
            Reset
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-hide px-4 py-6 space-y-8 pb-28">
          <section>
            <h3 className="text-xl font-semibold mb-4">Sort by</h3>
            <div className="flex flex-wrap gap-2">
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, sort: option.value }))}
                  className={`px-4 py-2 rounded-full border text-sm font-semibold tracking-wide transition-colors ${
                    filters.sort === option.value
                      ? 'bg-primary-container text-on-primary-container border-primary-container'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">Price range</h3>
            <div className="flex gap-2">
              {PRICE_OPTIONS.map((price, index) => {
                const value = String(index + 1);
                const active = filters.prices.includes(value);
                return (
                  <button
                    key={price}
                    type="button"
                    onClick={() => togglePrice(value)}
                    className={`flex-1 h-12 rounded-lg border text-lg transition-colors ${
                      active
                        ? 'bg-primary-container text-on-primary-container border-primary-container'
                        : 'border-outline-variant text-on-surface-variant'
                    }`}
                  >
                    {price}
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">Rating</h3>
            <div className="flex flex-wrap gap-2">
              {RATING_OPTIONS.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, rating }))}
                  className={`px-4 py-2 rounded-full border text-sm font-semibold tracking-wide flex items-center gap-1 transition-colors ${
                    filters.rating === rating
                      ? 'bg-primary-container text-on-primary-container border-primary-container'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {rating}+ <MaterialIcon name="star" className="text-base" filled />
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">Dietary</h3>
            <div className="space-y-1">
              {DIETARY_OPTIONS.map((option, index) => (
                <label
                  key={option.value}
                  className={`flex items-center justify-between py-3 cursor-pointer ${
                    index < DIETARY_OPTIONS.length - 1 ? 'border-b border-surface-variant' : ''
                  }`}
                >
                  <span className="text-base">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={filters.dietary.includes(option.value)}
                    onChange={() => toggleDietary(option.value)}
                    className="dash-filter-checkbox"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">Delivery fee</h3>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_FEE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilters((prev) => ({ ...prev, deliveryFee: option.value }))}
                  className={`px-4 py-2 rounded-full border text-sm font-semibold tracking-wide transition-colors ${
                    filters.deliveryFee === option.value
                      ? 'bg-primary-container text-on-primary-container border-primary-container'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 bg-surface shadow-[0px_-4px_20px_rgba(0,0,0,0.04)] border-t border-surface-variant pb-safe">
          <button
            type="button"
            onClick={() => {
              onApply(filters);
              onClose();
            }}
            className="w-full bg-primary text-on-primary text-sm font-semibold tracking-wide py-4 rounded-lg hover:opacity-90 active:scale-[0.98] transition-all"
          >
            Show Results ({resultCount})
          </button>
        </div>
      </div>
    </div>
  );
}
