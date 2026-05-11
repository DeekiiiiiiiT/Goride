import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { 
  ArrowLeft, Clock, Star, Plus, Minus, X, MapPin, 
  Phone, ChevronRight, Info, ShoppingBag 
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { toast } from 'sonner';

interface RestaurantPageProps {
  merchantId: string;
  onNavigate: (page: string, data?: any) => void;
}

interface ModifierOption {
  id: string;
  name: string;
  priceAdjustment: number;
}

interface ModifierGroup {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: ModifierOption[];
}

interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  prep_time_mins: number;
  calories: number | null;
  options: ModifierGroup[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export default function RestaurantPage({ merchantId, onNavigate }: RestaurantPageProps) {
  const { addItem, items } = useCart();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});

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

  const itemsByCategory = useMemo(() => {
    const grouped: Record<string, MenuItem[]> = { uncategorized: [] };
    categories.forEach(c => { grouped[c.id] = []; });
    menuItems.forEach(item => {
      if (item.category_id && grouped[item.category_id]) {
        grouped[item.category_id].push(item);
      } else {
        grouped.uncategorized.push(item);
      }
    });
    return grouped;
  }, [categories, menuItems]);

  const featuredItems = menuItems.filter(item => item.is_featured).slice(0, 6);

  const getItemQuantityInCart = (itemId: string) => {
    const item = items.find(i => i.itemId === itemId);
    return item?.quantity || 0;
  };

  const openItemModal = (item: MenuItem) => {
    setSelectedItem(item);
    setQuantity(1);
    setSelectedModifiers({});
  };

  const closeItemModal = () => {
    setSelectedItem(null);
    setQuantity(1);
    setSelectedModifiers({});
  };

  const toggleModifier = (groupId: string, optionId: string, maxSelections: number) => {
    setSelectedModifiers(prev => {
      const current = prev[groupId] || [];
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter(id => id !== optionId) };
      } else {
        if (maxSelections === 1) {
          return { ...prev, [groupId]: [optionId] };
        } else if (current.length < maxSelections) {
          return { ...prev, [groupId]: [...current, optionId] };
        }
        return prev;
      }
    });
  };

  const calculateItemTotal = () => {
    if (!selectedItem) return 0;
    let total = selectedItem.price;
    
    selectedItem.options?.forEach(group => {
      const selected = selectedModifiers[group.id] || [];
      selected.forEach(optionId => {
        const option = group.options.find(o => o.id === optionId);
        if (option) total += option.priceAdjustment;
      });
    });
    
    return total * quantity;
  };

  const validateModifiers = () => {
    if (!selectedItem?.options) return true;
    
    for (const group of selectedItem.options) {
      const selected = selectedModifiers[group.id] || [];
      if (group.required && selected.length < group.minSelections) {
        return false;
      }
    }
    return true;
  };

  const handleAddToCart = () => {
    if (!selectedItem || !merchant) return;
    
    if (!validateModifiers()) {
      toast.error('Please select all required options');
      return;
    }

    const modifierSummary = selectedItem.options?.map(group => ({
      name: group.name,
      selections: (selectedModifiers[group.id] || []).map(optionId => {
        const option = group.options.find(o => o.id === optionId);
        return option ? { name: option.name, priceAdjustment: option.priceAdjustment } : null;
      }).filter(Boolean),
    })).filter(g => g.selections.length > 0);

    addItem(
      {
        itemId: selectedItem.id,
        merchantId: merchant.id,
        name: selectedItem.name,
        price: calculateItemTotal() / quantity,
        quantity,
        imageUrl: selectedItem.image_url,
        options: modifierSummary,
      },
      merchant.name
    );
    toast.success(`Added ${quantity}x ${selectedItem.name} to cart`);
    closeItemModal();
  };

  const handleQuickAdd = (item: MenuItem) => {
    if (item.options && item.options.length > 0) {
      openItemModal(item);
      return;
    }
    
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

  const cartItemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const cartTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="pb-24">
      <div className="relative">
        <div className="h-56 md:h-72 bg-gray-100">
          {merchant.cover_image_url ? (
            <img
              src={merchant.cover_image_url}
              alt={merchant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-400 to-emerald-600">
              <span className="text-white text-7xl font-bold">{merchant.name.charAt(0)}</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>

        <button
          onClick={() => onNavigate('home')}
          className="absolute top-4 left-4 p-2 bg-white rounded-full shadow-md hover:bg-gray-50"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 text-white">
          <div className="max-w-4xl mx-auto flex items-end gap-4">
            {merchant.logo_url && (
              <img
                src={merchant.logo_url}
                alt=""
                className="w-20 h-20 rounded-xl border-2 border-white shadow-lg object-cover bg-white"
              />
            )}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">{merchant.name}</h1>
              <p className="text-white/80">{merchant.cuisine_type}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4">
        <div className="bg-white rounded-xl shadow-sm -mt-4 relative z-10 p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-1">
              <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              <span className="font-semibold">{merchant.rating?.toFixed(1) || 'New'}</span>
              <span className="text-gray-500">({merchant.total_ratings || 0})</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <Clock className="w-4 h-4" />
              <span>{merchant.avg_prep_time_mins || 30}-{(merchant.avg_prep_time_mins || 30) + 15} min</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600">
              <MapPin className="w-4 h-4" />
              <span>{merchant.delivery_radius_km || 5} km delivery</span>
            </div>
            <div className="text-emerald-600 font-semibold">
              ${merchant.delivery_fee?.toFixed(0) || 0} delivery
            </div>
          </div>
          {merchant.description && (
            <p className="text-gray-600 text-sm mt-3 border-t pt-3">{merchant.description}</p>
          )}
        </div>

        {featuredItems.length > 0 && !selectedCategory && (
          <section className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Popular Items</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {featuredItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => openItemModal(item)}
                  className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow text-left"
                >
                  <div className="h-32 bg-gray-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-100 to-emerald-200">
                        <span className="text-3xl">🍽️</span>
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-medium text-gray-900 text-sm truncate">{item.name}</h3>
                    <p className="text-emerald-600 font-semibold text-sm">${item.price.toFixed(2)}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {categories.length > 0 && (
          <div className="sticky top-16 bg-gray-50 py-3 -mx-4 px-4 border-b z-20">
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  !selectedCategory
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
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
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8 mt-6">
          {(selectedCategory ? [selectedCategory] : [...categories.map(c => c.id), 'uncategorized'])
            .filter(catId => itemsByCategory[catId]?.length > 0)
            .map(catId => {
              const category = categories.find(c => c.id === catId);
              const categoryItems = itemsByCategory[catId];

              return (
                <section key={catId}>
                  {category && (
                    <h2 className="text-xl font-semibold text-gray-900 mb-4">{category.name}</h2>
                  )}
                  <div className="space-y-4">
                    {categoryItems.map(item => {
                      const quantityInCart = getItemQuantityInCart(item.id);
                      
                      return (
                        <div
                          key={item.id}
                          className={`bg-white rounded-xl p-4 shadow-sm flex gap-4 ${!item.is_available ? 'opacity-60' : 'hover:shadow-md cursor-pointer'}`}
                          onClick={() => item.is_available && openItemModal(item)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start gap-2">
                              <h3 className="font-medium text-gray-900">{item.name}</h3>
                              {item.is_featured && (
                                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Popular</span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                            )}
                            <div className="flex items-center gap-3 mt-2">
                              <p className="text-lg font-semibold text-gray-900">${item.price.toFixed(2)}</p>
                              {item.calories && (
                                <span className="text-xs text-gray-400">{item.calories} cal</span>
                              )}
                              {item.options && item.options.length > 0 && (
                                <span className="text-xs text-emerald-600">Customizable</span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end justify-between flex-shrink-0">
                            {item.image_url ? (
                              <img
                                src={item.image_url}
                                alt={item.name}
                                className="w-24 h-24 rounded-lg object-cover"
                              />
                            ) : (
                              <div className="w-24 h-24 rounded-lg bg-gray-100 flex items-center justify-center">
                                <span className="text-3xl">🍽️</span>
                              </div>
                            )}
                            {item.is_available ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickAdd(item);
                                }}
                                className="mt-2 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center hover:bg-emerald-600 shadow-md"
                              >
                                <Plus className="w-5 h-5" />
                              </button>
                            ) : (
                              <span className="text-xs text-gray-500 mt-2">Unavailable</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>
      </div>

      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center justify-center">
          <div className="bg-white w-full md:max-w-lg md:rounded-xl max-h-[90vh] overflow-y-auto">
            <div className="relative">
              {selectedItem.image_url ? (
                <img
                  src={selectedItem.image_url}
                  alt={selectedItem.name}
                  className="w-full h-48 object-cover"
                />
              ) : (
                <div className="w-full h-48 bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center">
                  <span className="text-6xl">🍽️</span>
                </div>
              )}
              <button
                onClick={closeItemModal}
                className="absolute top-3 right-3 p-2 bg-white rounded-full shadow-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4">
              <h2 className="text-xl font-bold text-gray-900">{selectedItem.name}</h2>
              {selectedItem.description && (
                <p className="text-gray-600 mt-1">{selectedItem.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2">
                <p className="text-xl font-semibold text-emerald-600">${selectedItem.price.toFixed(2)}</p>
                {selectedItem.calories && (
                  <span className="text-sm text-gray-500">{selectedItem.calories} cal</span>
                )}
              </div>

              {selectedItem.options && selectedItem.options.length > 0 && (
                <div className="mt-6 space-y-6">
                  {selectedItem.options.map(group => (
                    <div key={group.id}>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900">{group.name}</h3>
                          <p className="text-sm text-gray-500">
                            {group.required ? 'Required' : 'Optional'}
                            {group.maxSelections > 1 && ` • Select up to ${group.maxSelections}`}
                          </p>
                        </div>
                        {group.required && (selectedModifiers[group.id]?.length || 0) < group.minSelections && (
                          <span className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded">Required</span>
                        )}
                      </div>
                      <div className="space-y-2">
                        {group.options.map(option => {
                          const isSelected = selectedModifiers[group.id]?.includes(option.id);
                          return (
                            <button
                              key={option.id}
                              onClick={() => toggleModifier(group.id, option.id, group.maxSelections)}
                              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                                isSelected
                                  ? 'border-emerald-500 bg-emerald-50'
                                  : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <span className="text-gray-900">{option.name}</span>
                              <div className="flex items-center gap-2">
                                {option.priceAdjustment > 0 && (
                                  <span className="text-sm text-gray-500">+${option.priceAdjustment.toFixed(2)}</span>
                                )}
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                  isSelected ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && <span className="text-white text-xs">✓</span>}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-center gap-4 mt-6 py-4 border-t">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="text-xl font-semibold w-8 text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-10 h-10 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                disabled={!validateModifiers()}
                className="w-full bg-emerald-500 text-white py-4 rounded-xl font-semibold hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShoppingBag className="w-5 h-5" />
                Add to Cart • ${calculateItemTotal().toFixed(2)}
              </button>
            </div>
          </div>
        </div>
      )}

      {cartItemCount > 0 && !selectedItem && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4 z-30">
          <div className="max-w-4xl mx-auto">
            <button
              onClick={() => onNavigate('cart')}
              className="w-full bg-emerald-500 text-white py-4 rounded-xl font-semibold hover:bg-emerald-600 flex items-center justify-between px-6"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                <span>View Cart ({cartItemCount} items)</span>
              </div>
              <span className="text-lg">${cartTotal.toFixed(2)}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
