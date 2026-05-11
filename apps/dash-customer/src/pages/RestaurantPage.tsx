import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { ArrowLeft, Clock, Star, Plus, Minus } from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { toast } from 'sonner';

interface RestaurantPageProps {
  merchantId: string;
  onNavigate: (page: string, data?: any) => void;
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  prep_time_mins: number;
}

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export default function RestaurantPage({ merchantId, onNavigate }: RestaurantPageProps) {
  const { addItem, items } = useCart();
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['merchant', merchantId],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchantId}`);
      if (!res.ok) throw new Error('Failed to fetch restaurant');
      return res.json();
    },
    enabled: !!merchantId,
  });

  const merchant = data?.merchant;
  const categories: Category[] = data?.categories || [];
  const menuItems: MenuItem[] = data?.items || [];

  const itemsByCategory = React.useMemo(() => {
    const grouped: Record<string, MenuItem[]> = { uncategorized: [] };
    categories.forEach(c => {
      grouped[c.id] = [];
    });
    menuItems.forEach(item => {
      if (item.category_id && grouped[item.category_id]) {
        grouped[item.category_id].push(item);
      } else {
        grouped.uncategorized.push(item);
      }
    });
    return grouped;
  }, [categories, menuItems]);

  const getItemQuantityInCart = (itemId: string) => {
    const item = items.find(i => i.itemId === itemId);
    return item?.quantity || 0;
  };

  const handleAddToCart = (item: MenuItem) => {
    addItem(
      {
        itemId: item.id,
        merchantId: merchant.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        imageUrl: item.image_url,
      },
      merchant.name
    );
    toast.success(`Added ${item.name} to cart`);
  };

  if (!merchantId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No restaurant selected</p>
        <button
          onClick={() => onNavigate('home')}
          className="mt-4 text-emerald-600 font-medium"
        >
          Browse restaurants
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-64 bg-gray-200 rounded-xl" />
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error || !merchant) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load restaurant</p>
        <button
          onClick={() => onNavigate('home')}
          className="mt-4 text-emerald-600 font-medium"
        >
          Back to restaurants
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <button
        onClick={() => onNavigate('home')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      <div className="bg-white rounded-xl overflow-hidden shadow-sm mb-6">
        <div className="h-48 bg-gray-100 relative">
          {merchant.cover_image_url ? (
            <img
              src={merchant.cover_image_url}
              alt={merchant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600">
              <span className="text-white text-6xl font-bold">
                {merchant.name.charAt(0)}
              </span>
            </div>
          )}
        </div>
        <div className="p-6">
          <h1 className="text-2xl font-bold text-gray-900">{merchant.name}</h1>
          <p className="text-gray-500 mt-1">{merchant.cuisine_type}</p>
          {merchant.description && (
            <p className="text-gray-600 mt-2">{merchant.description}</p>
          )}
          <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span className="font-medium">{merchant.rating?.toFixed(1) || 'New'}</span>
              {merchant.total_ratings > 0 && (
                <span>({merchant.total_ratings} reviews)</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{merchant.avg_prep_time_mins || 30} min</span>
            </div>
            <div>
              <span className="text-emerald-600 font-medium">
                ${merchant.delivery_fee || 0} delivery
              </span>
            </div>
          </div>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="sticky top-16 bg-gray-50 py-3 mb-4 -mx-4 px-4 border-b">
          <div className="flex gap-2 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !selectedCategory
                  ? 'bg-emerald-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === category.id
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {category.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-8">
        {(selectedCategory ? [selectedCategory] : [...categories.map(c => c.id), 'uncategorized'])
          .filter(catId => itemsByCategory[catId]?.length > 0)
          .map(catId => {
            const category = categories.find(c => c.id === catId);
            const categoryItems = itemsByCategory[catId];

            return (
              <section key={catId}>
                {category && (
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    {category.name}
                  </h2>
                )}
                <div className="grid gap-4">
                  {categoryItems.map(item => {
                    const quantityInCart = getItemQuantityInCart(item.id);
                    
                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-xl p-4 shadow-sm flex gap-4"
                      >
                        <div className="flex-1">
                          <h3 className="font-medium text-gray-900">{item.name}</h3>
                          {item.description && (
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                          <p className="text-lg font-semibold text-gray-900 mt-2">
                            ${item.price.toFixed(2)}
                          </p>
                        </div>
                        <div className="flex flex-col items-end justify-between">
                          {item.image_url && (
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-24 h-24 rounded-lg object-cover"
                            />
                          )}
                          <button
                            onClick={() => handleAddToCart(item)}
                            disabled={!item.is_available}
                            className={`mt-2 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${
                              item.is_available
                                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            <Plus className="w-4 h-4" />
                            Add
                            {quantityInCart > 0 && (
                              <span className="bg-white text-emerald-600 px-2 py-0.5 rounded-full text-xs">
                                {quantityInCart}
                              </span>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => onNavigate('cart')}
              className="w-full bg-emerald-500 text-white py-3 rounded-xl font-medium hover:bg-emerald-600 flex items-center justify-between px-4"
            >
              <span>View Cart ({items.reduce((sum, i) => sum + i.quantity, 0)} items)</span>
              <span>${items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
