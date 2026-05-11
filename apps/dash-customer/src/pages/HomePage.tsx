import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { Search, MapPin, Clock, Star } from 'lucide-react';

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
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [searchQuery, setSearchQuery] = React.useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchants'],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants`);
      if (!res.ok) throw new Error('Failed to fetch restaurants');
      return res.json();
    },
  });

  const merchants: Merchant[] = data?.merchants || [];
  const filteredMerchants = merchants.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.cuisine_type?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Hungry? We've got you covered
        </h1>
        <p className="text-gray-600 mb-4">
          Order from the best restaurants near you
        </p>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search restaurants or cuisines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
        </div>
      </section>

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
        <div className="text-center py-12">
          <p className="text-red-500">Failed to load restaurants. Please try again.</p>
        </div>
      ) : filteredMerchants.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500">No restaurants found. Check back later!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredMerchants.map((merchant) => (
            <button
              key={merchant.id}
              onClick={() => onNavigate('restaurant', { merchantId: merchant.id })}
              className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left"
            >
              <div className="h-48 bg-gray-100 relative">
                {merchant.cover_image_url ? (
                  <img
                    src={merchant.cover_image_url}
                    alt={merchant.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600">
                    <span className="text-white text-4xl font-bold">
                      {merchant.name.charAt(0)}
                    </span>
                  </div>
                )}
                {merchant.logo_url && (
                  <img
                    src={merchant.logo_url}
                    alt=""
                    className="absolute bottom-2 left-2 w-12 h-12 rounded-lg border-2 border-white shadow-sm object-cover bg-white"
                  />
                )}
              </div>
              <div className="p-4">
                <h3 className="font-semibold text-gray-900 text-lg">
                  {merchant.name}
                </h3>
                <p className="text-sm text-gray-500 mb-2">
                  {merchant.cuisine_type || 'Restaurant'}
                </p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                    <span>{merchant.rating?.toFixed(1) || 'New'}</span>
                    {merchant.total_ratings > 0 && (
                      <span className="text-gray-400">({merchant.total_ratings})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span>{merchant.avg_prep_time_mins || 30} min</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm">
                  <span className="text-emerald-600 font-medium">
                    ${merchant.delivery_fee?.toFixed(0) || 0} delivery
                  </span>
                  {merchant.min_order_amount > 0 && (
                    <span className="text-gray-400">
                      • Min ${merchant.min_order_amount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
