import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { 
  Search, MapPin, Clock, Star, ChevronRight, 
  X, Sparkles, Zap, Tag, TrendingUp
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (page: string, data?: any) => void;
}

interface Merchant {
  id: string;
  name: string;
  description: string;
  logo_url: string;
  cover_image_url: string;
  cuisine_type: string;
  rating: number;
  total_ratings: number;
  avg_prep_time_mins: number;
  delivery_fee: number;
  min_order_amount: number;
  is_featured: boolean;
  delivery_radius_km: number;
}

const CUISINE_FILTERS = [
  { id: 'all', label: 'All', emoji: '🍽️' },
  { id: 'jamaican', label: 'Jamaican', emoji: '🇯🇲' },
  { id: 'chinese', label: 'Chinese', emoji: '🥡' },
  { id: 'indian', label: 'Indian', emoji: '🍛' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'fast-food', label: 'Fast Food', emoji: '🍔' },
  { id: 'healthy', label: 'Healthy', emoji: '🥗' },
  { id: 'seafood', label: 'Seafood', emoji: '🦐' },
  { id: 'cafe', label: 'Cafe', emoji: '☕' },
  { id: 'grill', label: 'Grill', emoji: '🥩' },
  { id: 'desserts', label: 'Desserts', emoji: '🍰' },
  { id: 'breakfast', label: 'Breakfast', emoji: '🥞' },
];

const PROMO_BANNERS = [
  {
    id: 1,
    title: 'Free Delivery',
    subtitle: 'On your first order',
    code: 'WELCOME',
    bgClass: 'from-emerald-500 to-teal-600',
    icon: Zap,
  },
  {
    id: 2,
    title: '20% Off',
    subtitle: 'Orders over $30',
    code: 'SAVE20',
    bgClass: 'from-amber-500 to-orange-600',
    icon: Tag,
  },
  {
    id: 3,
    title: 'Daily Deals',
    subtitle: 'Up to 50% off popular meals',
    code: 'New deals daily',
    bgClass: 'from-pink-500 to-rose-600',
    icon: Sparkles,
  },
];

const SORT_OPTIONS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'rating', label: 'Highest Rated' },
  { id: 'delivery-time', label: 'Fastest Delivery' },
  { id: 'delivery-fee', label: 'Lowest Delivery Fee' },
];

export default function HomePage({ onNavigate }: HomePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('all');
  const [sortBy, setSortBy] = useState('recommended');
  const [deliveryAddress, setDeliveryAddress] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchants'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants`);
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return res.json();
    },
  });

  const merchants: Merchant[] = data?.merchants || [];

  const filteredAndSortedMerchants = useMemo(() => {
    let result = [...merchants];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(m =>
        m.name.toLowerCase().includes(query) ||
        m.cuisine_type?.toLowerCase().includes(query) ||
        m.description?.toLowerCase().includes(query)
      );
    }

    if (selectedCuisine !== 'all') {
      result = result.filter(m =>
        m.cuisine_type?.toLowerCase().includes(selectedCuisine.toLowerCase())
      );
    }

    switch (sortBy) {
      case 'rating':
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'delivery-time':
        result.sort((a, b) => (a.avg_prep_time_mins || 30) - (b.avg_prep_time_mins || 30));
        break;
      case 'delivery-fee':
        result.sort((a, b) => (a.delivery_fee || 0) - (b.delivery_fee || 0));
        break;
      default:
        result.sort((a, b) => {
          if (a.is_featured && !b.is_featured) return -1;
          if (!a.is_featured && b.is_featured) return 1;
          return (b.rating || 0) - (a.rating || 0);
        });
    }

    return result;
  }, [merchants, searchQuery, selectedCuisine, sortBy]);

  const featuredMerchants = useMemo(
    () => merchants.filter(m => m.is_featured).slice(0, 6),
    [merchants]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 overflow-hidden">
        {/* Background decorative elements */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute -top-20 -left-20 w-96 h-96 bg-white rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-yellow-200 rounded-full blur-3xl" />
        </div>
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 right-[15%] text-7xl opacity-15 rotate-12">🍕</div>
          <div className="absolute bottom-10 left-[10%] text-6xl opacity-15 -rotate-12">🍔</div>
          <div className="absolute top-1/2 right-[5%] text-5xl opacity-10">🥗</div>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-12 md:py-16 lg:py-20">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-3 py-1.5 rounded-full mb-4 border border-white/20">
              <Sparkles className="w-4 h-4 text-yellow-300" />
              <span className="text-white text-sm font-medium">New restaurants added daily</span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-3 leading-tight">
              Delicious food,<br />
              <span className="text-white/90">delivered to you</span>
            </h1>
            <p className="text-emerald-50 text-lg md:text-xl mb-8 max-w-xl">
              Order from your favorite local restaurants and get it delivered hot to your door in 30 minutes or less.
            </p>

            {/* Search Bar */}
            <div className="bg-white rounded-2xl p-2 shadow-2xl shadow-emerald-900/20 flex flex-col md:flex-row gap-2">
              <div className="flex-1 flex items-center gap-3 px-4 py-2">
                <MapPin className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Enter delivery address"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  className="flex-1 py-2 text-gray-900 focus:outline-none text-base"
                />
              </div>
              <div className="hidden md:block w-px bg-gray-200 my-2" />
              <div className="flex-1 flex items-center gap-3 px-4 py-2">
                <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Search restaurants or dishes"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 py-2 text-gray-900 focus:outline-none text-base"
                />
              </div>
              <button className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 shadow-lg shadow-emerald-500/30 transition-all">
                Find Food
              </button>
            </div>

            {/* Quick Stats */}
            <div className="flex flex-wrap items-center gap-6 mt-8 text-white/90 text-sm">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Star key={i} className="w-4 h-4 fill-yellow-300 text-yellow-300" />
                  ))}
                </div>
                <span className="font-medium">4.8 average rating</span>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span>30 min average delivery</span>
              </div>
              <div className="hidden md:flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>50,000+ happy customers</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-8 md:py-12">
        {/* Promo Banners */}
        <section className="mb-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PROMO_BANNERS.map((promo) => {
              const Icon = promo.icon;
              return (
                <div
                  key={promo.id}
                  className={`relative bg-gradient-to-br ${promo.bgClass} rounded-2xl p-5 text-white overflow-hidden cursor-pointer hover:shadow-xl transition-all group`}
                >
                  <div className="relative z-10">
                    <Icon className="w-8 h-8 mb-3" />
                    <h3 className="text-2xl font-bold mb-1">{promo.title}</h3>
                    <p className="text-white/90 text-sm mb-3">{promo.subtitle}</p>
                    <span className="inline-block bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-semibold border border-white/30">
                      {promo.code}
                    </span>
                  </div>
                  <Icon className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover:opacity-20 transition-opacity" />
                </div>
              );
            })}
          </div>
        </section>

        {/* Cuisine Browser */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Browse by cuisine</h2>
              <p className="text-gray-500 text-sm mt-1">Find your favorite food</p>
            </div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-3">
            {CUISINE_FILTERS.map(cuisine => (
              <button
                key={cuisine.id}
                onClick={() => setSelectedCuisine(cuisine.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl transition-all border-2 ${
                  selectedCuisine === cuisine.id
                    ? 'bg-emerald-50 border-emerald-500 scale-105 shadow-md'
                    : 'bg-white border-transparent hover:border-gray-200 hover:shadow-sm hover:-translate-y-0.5'
                }`}
              >
                <span className="text-3xl">{cuisine.emoji}</span>
                <span className={`text-xs font-medium text-center ${
                  selectedCuisine === cuisine.id ? 'text-emerald-700' : 'text-gray-700'
                }`}>
                  {cuisine.label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Featured Restaurants */}
        {featuredMerchants.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-500" />
                  <h2 className="text-2xl font-bold text-gray-900">Featured</h2>
                </div>
                <p className="text-gray-500 text-sm mt-1">Top picks from our editors</p>
              </div>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scrollbar-hide">
              {featuredMerchants.map((merchant) => (
                <button
                  key={merchant.id}
                  onClick={() => onNavigate('restaurant', { merchantId: merchant.id })}
                  className="flex-shrink-0 w-72 sm:w-80 snap-start bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all text-left group"
                >
                  <div className="h-44 bg-gray-100 relative overflow-hidden">
                    {merchant.cover_image_url ? (
                      <img
                        src={merchant.cover_image_url}
                        alt={merchant.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-400 to-orange-600">
                        <span className="text-white text-6xl font-bold">
                          {merchant.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white text-xs font-semibold rounded-full flex items-center gap-1 shadow-md">
                      <Sparkles className="w-3 h-3" />
                      Featured
                    </div>
                    {merchant.rating && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white px-2 py-1 rounded-full shadow-md">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-xs font-semibold text-gray-900">{merchant.rating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 text-lg mb-1 group-hover:text-emerald-600 transition-colors">
                      {merchant.name}
                    </h3>
                    <p className="text-sm text-gray-500 mb-3">
                      {merchant.cuisine_type || 'Restaurant'}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span>{merchant.avg_prep_time_mins || 30} min</span>
                      </div>
                      <span className="text-gray-300">•</span>
                      <span className="text-emerald-600 font-semibold">
                        ${merchant.delivery_fee?.toFixed(0) || 0} delivery
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* All Restaurants */}
        <section>
          <div className="flex items-center justify-between mb-5 gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedCuisine === 'all' 
                  ? 'All Restaurants' 
                  : `${CUISINE_FILTERS.find(c => c.id === selectedCuisine)?.label} Restaurants`}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {filteredAndSortedMerchants.length} {filteredAndSortedMerchants.length === 1 ? 'restaurant' : 'restaurants'} available
              </p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer hover:border-gray-300"
              >
                {SORT_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {searchQuery && (
            <div className="mb-5 flex items-center gap-2 flex-wrap">
              <span className="text-gray-500 text-sm">Showing results for:</span>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium flex items-center gap-1.5">
                "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="hover:bg-emerald-200 rounded-full p-0.5">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse">
                  <div className="h-48 bg-gray-200" />
                  <div className="p-4 space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <X className="w-10 h-10 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Failed to load restaurants</h3>
              <p className="text-gray-500 text-sm">Please check your connection and try again</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-5 px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : filteredAndSortedMerchants.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-10 h-10 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">No restaurants found</h3>
              <p className="text-gray-500 text-sm">
                {searchQuery ? 'Try a different search term' : merchants.length === 0 ? 'Check back later for new restaurants' : 'Try a different cuisine or filter'}
              </p>
              {(searchQuery || selectedCuisine !== 'all') && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCuisine('all');
                  }}
                  className="mt-5 px-5 py-2.5 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredAndSortedMerchants.map((merchant) => (
                <button
                  key={merchant.id}
                  onClick={() => onNavigate('restaurant', { merchantId: merchant.id })}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all text-left group border border-gray-100"
                >
                  <div className="h-48 bg-gray-100 relative overflow-hidden">
                    {merchant.cover_image_url ? (
                      <img
                        src={merchant.cover_image_url}
                        alt={merchant.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-teal-600">
                        <span className="text-white text-6xl font-bold">
                          {merchant.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    {merchant.is_featured && (
                      <div className="absolute top-3 left-3 px-2.5 py-1 bg-amber-500 text-white text-xs font-semibold rounded-full flex items-center gap-1 shadow-md">
                        <Sparkles className="w-3 h-3" />
                        Featured
                      </div>
                    )}
                    {merchant.rating ? (
                      <div className="absolute top-3 right-3 flex items-center gap-1 bg-white px-2.5 py-1 rounded-full shadow-md">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="text-xs font-bold text-gray-900">{merchant.rating.toFixed(1)}</span>
                      </div>
                    ) : null}
                    {merchant.logo_url && (
                      <img
                        src={merchant.logo_url}
                        alt=""
                        className="absolute bottom-3 left-3 w-14 h-14 rounded-xl border-2 border-white shadow-lg object-cover bg-white"
                      />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-bold text-gray-900 text-lg group-hover:text-emerald-600 transition-colors line-clamp-1">
                      {merchant.name}
                    </h3>
                    <p className="text-sm text-gray-500 line-clamp-1">
                      {merchant.cuisine_type || 'Restaurant'}
                    </p>
                    
                    <div className="flex items-center gap-3 mt-3 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{merchant.avg_prep_time_mins || 30}-{(merchant.avg_prep_time_mins || 30) + 15} min</span>
                      </div>
                      <span className="text-gray-300">•</span>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{merchant.delivery_radius_km || 5} km</span>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-emerald-600 font-bold">
                          ${merchant.delivery_fee?.toFixed(0) || 0} delivery
                        </span>
                        {merchant.min_order_amount > 0 && (
                          <span className="text-gray-400 text-xs">
                            • Min ${merchant.min_order_amount}
                          </span>
                        )}
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Bottom CTA Section (only shown when no restaurants yet) */}
        {!isLoading && !error && merchants.length === 0 && (
          <section className="mt-12 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 md:p-12 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <div className="absolute top-10 left-10 text-6xl">🍕</div>
              <div className="absolute top-20 right-20 text-5xl">🍔</div>
              <div className="absolute bottom-10 left-20 text-7xl">🌮</div>
              <div className="absolute bottom-20 right-10 text-6xl">🍣</div>
            </div>
            <div className="relative">
              <h3 className="text-3xl font-bold mb-3">Are you a restaurant owner?</h3>
              <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
                Join Roam Dash and reach thousands of hungry customers. Grow your business with our delivery platform.
              </p>
              <a
                href="https://partner.roamdash.co"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-500/30"
              >
                Partner with us
                <ChevronRight className="w-5 h-5" />
              </a>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
