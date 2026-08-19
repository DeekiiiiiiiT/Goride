import { useEffect, useState } from 'react';
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
  prices: [],
  rating: '',
  dietary: [],
  deliveryFee: '',
};

type FilterSortSheetProps = {
  open: boolean;
  onClose: () => void;
  onApply: (filters: FilterState) => void;
  value?: FilterState;
  resultCount?: number;
};

export const SORT_OPTIONS = [
  { value: 'recommended', label: 'Recommended' },
  { value: 'fastest', label: 'Fastest Delivery' },
  { value: 'rating', label: 'Rating' },
  { value: 'distance', label: 'Distance' },
  { value: 'price_asc', label: 'Lowest delivery fee' },
  { value: 'price_desc', label: 'Highest delivery fee' },
];

const RATING_OPTIONS = ['4.5', '4.0', '3.5'];
const PRICE_OPTIONS = ['$', '$$', '$$$'];
const DIETARY_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'halal', label: 'Halal' },
];
const DELIVERY_FEE_OPTIONS = [
  { value: 'free', label: 'Free' },
  { value: 'under_100', label: 'Under J$100' },
  { value: 'under_200', label: 'Under J$200' },
];

export function sortLabel(sort: string): string {
  return SORT_OPTIONS.find((option) => option.value === sort)?.label ?? 'Recommended';
}

export function FilterSortSheet({
  open,
  onClose,
  onApply,
  value = DEFAULT_FILTERS,
  resultCount = 0,
}: FilterSortSheetProps) {
  const [filters, setFilters] = useState<FilterState>(value);

  useEffect(() => {
    if (open) setFilters(value);
  }, [open, value]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close filters" className="absolute inset-0 bg-on-surface/40" onClick={onClose} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-surface rounded-t-[24px] flex flex-col max-h-[85dvh] shadow-[0px_-10px_30px_rgba(0,0,0,0.1)] safe-x">
        <div className="w-full flex justify-center pt-4 pb-2">
          <div className="w-12 h-1.5 bg-outline-variant rounded-full" />
        </div>

        <div className="px-4 pb-4 flex justify-between items-center border-b border-surface-variant">
          <h2 className="text-2xl font-semibold text-on-surface">Filter &amp; Sort</h2>
          <button type="button" onClick={() => setFilters(DEFAULT_FILTERS)} className="text-sm font-semibold tracking-wide text-primary">
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
            <h3 className="text-xl font-semibold mb-4">Rating</h3>
            <div className="flex flex-wrap gap-2">
              {RATING_OPTIONS.map((rating) => (
                <button
                  key={rating}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, rating: prev.rating === rating ? '' : rating }))
                  }
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
            <h3 className="text-xl font-semibold mb-4">Price</h3>
            <div className="flex flex-wrap gap-2">
              {PRICE_OPTIONS.map((price) => (
                <button
                  key={price}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      prices: prev.prices.includes(price)
                        ? prev.prices.filter((p) => p !== price)
                        : [...prev.prices, price],
                    }))
                  }
                  className={`px-4 py-2 rounded-full border text-sm font-semibold tracking-wide transition-colors ${
                    filters.prices.includes(price)
                      ? 'bg-primary-container text-on-primary-container border-primary-container'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  {price}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xl font-semibold mb-4">Dietary</h3>
            <div className="flex flex-wrap gap-2">
              {DIETARY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      dietary: prev.dietary.includes(option.value)
                        ? prev.dietary.filter((d) => d !== option.value)
                        : [...prev.dietary, option.value],
                    }))
                  }
                  className={`px-4 py-2 rounded-full border text-sm font-semibold tracking-wide transition-colors ${
                    filters.dietary.includes(option.value)
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
            <h3 className="text-xl font-semibold mb-4">Delivery fee</h3>
            <div className="flex flex-wrap gap-2">
              {DELIVERY_FEE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      deliveryFee: prev.deliveryFee === option.value ? '' : option.value,
                    }))
                  }
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
