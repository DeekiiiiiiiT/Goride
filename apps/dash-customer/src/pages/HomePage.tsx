import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { 
  Search, MapPin, Clock, Star, Filter, ChevronRight, 
  Utensils, Pizza, Coffee, Leaf, Beef, Fish, X 
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
  { id: 'all', label: 'All', icon: Utensils },
  { id: 'jamaican', label: 'Jamaican', icon: Utensils },
  { id: 'chinese', label: 'Chinese', icon: Utensils },
  { id: 'indian', label: 'Indian', icon: Utensils },
  { id: 'pizza', label: 'Pizza', icon: Pizza },
  { id: 'fast-food', label: 'Fast Food', icon: Utensils },
  { id: 'healthy', label: 'Healthy', icon: Leaf },
  { id: 'seafood', label: 'Seafood', icon: Fish },
  { id: 'cafe', label: 'Cafe', icon: Coffee },
  { id: 'grill', label: 'Grill', icon: Beef },
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
  const [showFilters, setShowFilters] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [showAddressInput, setShowAddressInput] = useState(false);

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

  const featuredMerchants = merchants.filter(m => m.is_featured).slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <section className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-6 md:p-10 mb-8 text-white">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Delicious food, delivered to you
        </h1>
        <p className="text-emerald-100 mb-6">
          Order from the best local restaurants
        </p>

        <div className="bg-white rounded-xl p-2 flex flex-col md:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 px-3">
            <MapPin className="w-5 h-5 text-emerald-500" />
            <input
              type="text"
              placeholder="Enter delivery address"
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              className="flex-1 py-2 text-gray-900 focus:outline-none"
            />
          </div>
          <div className="hidden md:block w-px bg-gray-200" />
          <div className="flex-1 flex items-center gap-2 px-3">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search restaurants or dishes"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 py-2 text-gray-900 focus:outline-none"
            />
          </div>
          <button className="bg-emerald-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-600">
            Search
          </button>
        </div>
      </section>

      <section className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Browse by cuisine</h2>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {CUISINE_FILTERS.map(cuisine => {
            const Icon = cuisine.icon;
            return (
              <button
                key={cuisine.id}
                onClick={() => setSelectedCuisine(cuisine.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  selectedCuisine === cuisine.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                <Icon className="w-4 h-4" />
                {cuisine.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-gray-900">
            {selectedCuisine === 'all' ? 'All Restaurants' : `${selectedCuisine.charAt(0).toUpperCase() + selectedCuisine.slice(1)} Restaurants`}
          </h2>
          <span className="text-gray-500 text-sm">({filteredAndSortedMerchants.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {searchQuery && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-gray-500">Showing results for:</span>
          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-sm flex items-center gap-1">
            "{searchQuery}"
            <button onClick={() => setSearchQuery('')}>
              <X className="w-4 h-4" />
            </button>
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="bg-white rounded-xl overflow-hidden shadow-sm animate-pulse">
              <div className="h-48 bg-gray-200" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <X className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-red-500 font-medium">Failed to load restaurants</p>
          <p className="text-gray-500 text-sm mt-1">Please check your connection and try again</p>
        </div>
      ) : filteredAndSortedMerchants.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Search className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-900 font-medium">No restaurants found</p>
          <p className="text-gray-500 text-sm mt-1">
            {searchQuery ? 'Try a different search term' : 'Check back later for new restaurants'}
          </p>
          {(searchQuery || selectedCuisine !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCuisine('all');
              }}
              className="mt-4 px-4 py-2 text-emerald-600 font-medium hover:bg-emerald-50 rounded-lg"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedMerchants.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => onNavigate('restaurant', { merchantId: merchant.id })}
              className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all text-left group"
            >
              <div className="h-48 bg-gray-100 relative overflow-hidden">
                {merchant.cover_image_url ? (
                  <img
                    src={merchant.cover_image_url}
                    alt={merchant.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600">
                    <span className="text-white text-5xl font-bold">
                      {merchant.name.charAt(0)}
                    </span>
                  </div>
                )}
                {merchant.is_featured && (
                  <div className="absolute top-3 left-3 px-2 py-1 bg-amber-500 text-white text-xs font-medium rounded">
                    Featured
                  </div>
                )}
                {merchant.logo_url && (
                  <img
                    src={merchant.logo_url}
                    alt=""
                    className="absolute bottom-3 left-3 w-14 h-14 rounded-xl border-2 border-white shadow-md object-cover bg-white"
                  />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg group-hover:text-emerald-600 transition-colors">
                      {merchant.name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {merchant.cuisine_type || 'Restaurant'}
                    </p>
                  </div>
                  {merchant.rating && (
                    <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-lg">
                      <Star className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">{merchant.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-4 mt-3 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{merchant.avg_prep_time_mins || 30}-{(merchant.avg_prep_time_mins || 30) + 15} min</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{merchant.delivery_radius_km || 5} km</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-emerald-600 font-semibold">
                      ${merchant.delivery_fee?.toFixed(0) || 0} delivery
                    </span>
                    {merchant.min_order_amount > 0 && (
                      <span className="text-gray-400">
                        • Min ${merchant.min_order_amount}
                      </span>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-emerald-500 transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
