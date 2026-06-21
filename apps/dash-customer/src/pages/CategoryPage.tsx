import { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { getCategoryPage } from '@/lib/discoverContent';
import { PROFILE_HEADER_AVATAR } from '@/lib/accountContent';

type Props = {
  categoryId: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onBack: () => void;
};

type CategoryFilter = 'sort' | 'price' | 'rating' | 'time' | 'offers';

export default function CategoryPage({ categoryId, onNavigate, onBack }: Props) {
  const category = getCategoryPage(categoryId);
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>('rating');

  const restaurants = useMemo(() => category?.restaurants ?? [], [category]);

  if (!category) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <p className="text-body-md text-on-surface-variant">Category not found.</p>
      </div>
    );
  }

  return (
    <div className="pb-24 bg-background min-h-full">
      <header className="sticky top-0 z-50 bg-surface shadow-sm flex items-center justify-between px-4 h-16">
        <button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          className="p-2 rounded-full bg-surface-container-high active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary capitalize">{category.id}</h1>
        <div className="w-10 h-10 rounded-full bg-surface-container-high overflow-hidden shadow-sm">
          <img src={PROFILE_HEADER_AVATAR} alt="Profile" className="w-full h-full object-cover" />
        </div>
      </header>

      <div className="relative w-full h-64 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('${category.heroImage}')` }}
        />
        <div className="absolute inset-0 category-hero-overlay flex items-end p-6">
          <div className="text-white">
            <h2 className="text-headline-lg-mobile font-bold mb-2">{category.title}</h2>
            <p className="text-body-lg opacity-90 max-w-md">{category.subtitle}</p>
          </div>
        </div>
      </div>

      <div className="sticky top-16 z-40 bg-background/95 backdrop-blur-sm py-4 border-b border-surface-variant/50 overflow-x-auto no-scrollbar px-4">
        <div className="flex items-center gap-3 min-w-max">
          <button
            type="button"
            onClick={() => setActiveFilter('sort')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              activeFilter === 'sort'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <MaterialIcon name="tune" size={18} />
            <span className="text-label-md font-semibold tracking-wide">Sort</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('price')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              activeFilter === 'price'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <span className="text-label-md font-semibold tracking-wide">Price</span>
            <MaterialIcon name="expand_more" size={18} />
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('rating')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              activeFilter === 'rating'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <MaterialIcon name="star" size={18} filled />
            <span className="text-label-md font-semibold tracking-wide">4.0+ Rating</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('time')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              activeFilter === 'time'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <span className="text-label-md font-semibold tracking-wide">Under 30 Min</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveFilter('offers')}
            className={`flex items-center gap-1 px-4 py-2 rounded-full border transition-colors ${
              activeFilter === 'offers'
                ? 'chip-active'
                : 'border-outline-variant bg-surface text-on-surface hover:bg-surface-variant/50'
            }`}
          >
            <span className="text-label-md font-semibold tracking-wide">Offers</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 p-4">
        {restaurants.map((restaurant) => (
          <article
            key={restaurant.id}
            role="button"
            tabIndex={0}
            onClick={() => onNavigate('restaurant', { merchantId: restaurant.id })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onNavigate('restaurant', { merchantId: restaurant.id });
            }}
            className="bg-surface rounded-2xl overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)] hover:shadow-[0px_10px_30px_rgba(0,0,0,0.08)] transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="relative h-48 w-full overflow-hidden">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${restaurant.image}')` }}
              />
              <div className="absolute top-4 right-4 bg-surface text-on-surface rounded-full px-3 py-1 shadow-sm">
                <span className="text-label-md font-semibold tracking-wide">{restaurant.eta}</span>
              </div>
            </div>
            <div className="p-5">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-headline-sm font-semibold text-on-surface">{restaurant.name}</h3>
                <div className="flex items-center bg-surface-container-high px-2 py-1 rounded-lg">
                  <span className="text-label-md font-semibold tracking-wide mr-1">{restaurant.rating}</span>
                  <MaterialIcon name="star" size={16} className="text-[#F59E0B]" filled />
                </div>
              </div>
              <p className="text-body-sm text-outline mb-4">{restaurant.cuisines}</p>
              <div className="flex items-center text-outline gap-4">
                <div className="flex items-center gap-1">
                  <MaterialIcon name="local_shipping" size={18} />
                  <span className="text-label-sm font-medium">{restaurant.deliveryFee}</span>
                </div>
                {restaurant.offer && (
                  <>
                    <div className="w-1 h-1 rounded-full bg-outline-variant" />
                    <div className="flex items-center gap-1 text-primary">
                      <MaterialIcon name="local_offer" size={18} />
                      <span className="text-label-sm font-medium">{restaurant.offer}</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="w-full py-12 flex flex-col items-center justify-center opacity-60 px-4">
        <MaterialIcon name="restaurant" className="text-4xl mb-2" />
        <p className="text-body-md text-center">No more restaurants found matching your criteria.</p>
      </div>
    </div>
  );
}
