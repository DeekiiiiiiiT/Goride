import { useCallback, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ActiveOrderBanner } from '@/components/home/ActiveOrderBanner';
import { QuickReorderSection } from '@/components/home/QuickReorderSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { PromoCarousel } from '@/components/ui/PromoCarousel';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { RestaurantCardSkeleton } from '@/components/ui/RestaurantCardSkeleton';
import { toast } from '@/lib/toast';
import {
  CUISINE_CHIPS,
  FEATURED_RESTAURANTS,
  HOME_CATEGORY_CHIPS,
  POPULAR_RESTAURANTS,
  RECOMMENDED_RESTAURANTS,
} from '@/lib/discoverContent';
import { getSavedAddress } from '@/lib/addressStorage';

type HomePageProps = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  onSearchFocus?: () => void;
  showActiveOrder?: boolean;
  showQuickReorder?: boolean;
};

const CUISINE_MATCH: Record<string, string> = {
  all: '',
  jamaican: 'jamaican',
  pizza: 'pizza',
  'fast-food': 'fast food',
  chinese: 'chinese',
  indian: 'indian',
  healthy: 'healthy',
  cafe: 'cafe',
  desserts: 'dessert',
  breakfast: 'breakfast',
};

function RatingBadge({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1 bg-surface-container px-1.5 py-0.5 rounded text-on-surface text-xs font-medium">
      <MaterialIcon name="star" className="text-sm text-primary" filled />
      {rating}
    </div>
  );
}

export default function HomePage({ onNavigate, onSearchFocus, showActiveOrder, showQuickReorder }: HomePageProps) {
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [loading, setLoading] = useState(false);
  const savedAddress = getSavedAddress();
  const addressLabel = savedAddress
    ? `${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : '45 Constant Spring Rd';

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    toast.success('Feed updated');
  }, []);

  const filteredPopular =
    selectedCuisine === 'all'
      ? POPULAR_RESTAURANTS
      : POPULAR_RESTAURANTS.filter((r) =>
          r.cuisines.toLowerCase().includes(CUISINE_MATCH[selectedCuisine] ?? selectedCuisine),
        );

  return (
    <PullToRefresh onRefresh={handleRefresh} className="bg-surface min-h-full">
      {showActiveOrder ? (
        <main className="flex flex-col gap-6 px-4 mt-4 max-w-[1200px] mx-auto">
          <ActiveOrderBanner onTrack={() => onNavigate('tracking', { orderId: '8492' })} />
          <section className="flex overflow-x-auto no-scrollbar gap-2 pb-1 -mx-4 px-4">
            {HOME_CATEGORY_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-semibold tracking-wide whitespace-nowrap active:scale-95 transition-transform ${chip.className}`}
              >
                {chip.label}
              </button>
            ))}
          </section>
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold text-on-surface">Recommended for you</h2>
            {loading ? (
              <RestaurantCardSkeleton count={2} variant="card" />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {RECOMMENDED_RESTAURANTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onNavigate('restaurant', { merchantId: item.id })}
                    className={`bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col active:scale-[0.98] transition-transform text-left group ${
                      item.large ? 'col-span-2' : 'col-span-1'
                    }`}
                  >
                    <div className={`w-full relative overflow-hidden bg-surface-variant ${item.large ? 'aspect-[16/9]' : 'aspect-square'}`}>
                      <img alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" src={item.image} />
                    </div>
                    <div className={`bg-surface-container-lowest w-full ${item.large ? 'p-4' : 'p-3'}`}>
                      <h3 className={`font-semibold text-on-surface truncate ${item.large ? 'text-xl' : 'text-sm'}`}>{item.name}</h3>
                      <p className="text-sm text-on-surface-variant mt-1 truncate">{item.meta}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </main>
      ) : (
        <main>
          <div className="px-4 py-2 flex flex-col gap-1 mt-1 max-w-[1200px] mx-auto">
            <div className="flex items-center gap-1 text-on-surface">
              <MaterialIcon name="location_on" className="text-primary text-lg" filled />
              <span className="text-sm font-semibold tracking-wide">{addressLabel}</span>
              <MaterialIcon name="expand_more" className="text-on-surface-variant text-base" />
            </div>
            <div className="flex items-center gap-1 text-on-surface-variant ml-6">
              <MaterialIcon name="schedule" className="text-sm" />
              <span className="text-sm">Now • 25-35 min</span>
            </div>
          </div>

          <div className="px-4 py-2 mt-1 max-w-[1200px] mx-auto">
            <button
              type="button"
              onClick={onSearchFocus}
              className="w-full bg-surface-container-high rounded-lg flex items-center px-4 py-3 shadow-sm text-left"
            >
              <MaterialIcon name="search" className="text-on-surface-variant" />
              <span className="ml-2 text-base text-on-surface-variant">Search for restaurants or dishes</span>
            </button>
          </div>

          <PromoCarousel onPromoClick={() => onNavigate('promotions')} />

          {showQuickReorder && (
            <div className="mt-4">
              <QuickReorderSection onNavigate={onNavigate} />
            </div>
          )}

          <div className="flex overflow-x-auto px-4 gap-2 py-2 no-scrollbar items-center max-w-[1200px] mx-auto">
            {CUISINE_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => setSelectedCuisine(chip.id)}
                className={`flex items-center gap-1 px-4 py-2 rounded-full whitespace-nowrap text-sm font-semibold tracking-wide transition-colors active:scale-95 ${
                  selectedCuisine === chip.id
                    ? 'bg-surface-variant text-on-surface shadow-sm'
                    : 'bg-surface-container text-on-surface border border-transparent hover:border-outline-variant'
                }`}
              >
                {chip.emoji} {chip.label}
              </button>
            ))}
          </div>

          <section className="mt-6 max-w-[1200px] mx-auto">
            <div className="px-4 flex justify-between items-end mb-2">
              <h2 className="text-xl font-bold text-on-surface">Featured</h2>
            </div>
            {loading ? (
              <div className="px-4">
                <RestaurantCardSkeleton count={2} variant="card" />
              </div>
            ) : (
              <div className="flex overflow-x-auto px-4 gap-4 pb-4 pt-1 no-scrollbar snap-x">
                {FEATURED_RESTAURANTS.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    type="button"
                    onClick={() => onNavigate('restaurant', { merchantId: restaurant.id })}
                    className="min-w-[80%] sm:min-w-[280px] snap-start bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col active:scale-[0.98] transition-transform border border-surface-container-high text-left"
                  >
                    <div className="h-32 w-full relative">
                      <img alt={restaurant.name} className="w-full h-full object-cover" src={restaurant.image} />
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold text-on-surface">{restaurant.name}</h3>
                        <RatingBadge rating={restaurant.rating} />
                      </div>
                      <p className="text-sm text-on-surface-variant">{restaurant.cuisines}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="mt-6 max-w-[1200px] mx-auto">
            <div className="px-4 mb-2">
              <h2 className="text-xl font-bold text-on-surface">Popular Near You</h2>
            </div>
            <div className="flex flex-col gap-6 px-4">
              {loading ? (
                <RestaurantCardSkeleton count={2} />
              ) : filteredPopular.length === 0 ? (
                <EmptyState
                  icon="restaurant"
                  title="No restaurants found"
                  description="Try a different cuisine filter or pull to refresh."
                  actionLabel="Clear filters"
                  onAction={() => setSelectedCuisine('all')}
                />
              ) : (
                filteredPopular.map((restaurant) => (
                  <button
                    key={restaurant.id}
                    type="button"
                    onClick={() => onNavigate('restaurant', { merchantId: restaurant.id })}
                    className="bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden flex flex-col active:scale-[0.98] transition-transform border border-surface-container-high group text-left"
                  >
                    <div className="h-48 w-full relative overflow-hidden">
                      <img
                        alt={restaurant.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        src={restaurant.image}
                      />
                      {restaurant.promoted && (
                        <div className="absolute top-2 left-2 bg-surface-container-lowest/90 backdrop-blur-sm text-on-surface text-xs px-2 py-1 rounded-full shadow-sm flex items-center gap-1 border border-surface-container-high">
                          <MaterialIcon name="campaign" className="text-xs text-primary" />
                          Promoted
                        </div>
                      )}
                      <div className="absolute top-2 right-2">
                        <FavoriteButton merchantId={restaurant.id} merchantName={restaurant.name} />
                      </div>
                    </div>
                    <div className="p-4 flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-on-surface">{restaurant.name}</h3>
                        <div className="flex items-center gap-1 bg-surface-container px-2 py-1 rounded-full text-sm font-semibold tracking-wide">
                          <MaterialIcon name="star" className="text-base text-primary" filled />
                          {restaurant.rating}
                        </div>
                      </div>
                      <p className="text-sm text-on-surface-variant">{restaurant.cuisines}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>
        </main>
      )}
    </PullToRefresh>
  );
}
