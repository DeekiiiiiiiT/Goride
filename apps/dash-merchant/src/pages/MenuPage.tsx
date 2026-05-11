import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, DollarSign, X, GripVertical, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import MenuItemModal from '../components/MenuItemModal';

interface MenuPageProps {
  merchant: Merchant;
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
  prep_time_mins: number | null;
  calories: number | null;
  options: any[];
}

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export default function MenuPage({ merchant }: MenuPageProps) {
  const [showItemModal, setShowItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['merchant-menu', merchant.id],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}`);
      if (!res.ok) throw new Error('Failed to fetch menu');
      return res.json();
    },
  });

  const categories: Category[] = data?.categories || [];
  const items: MenuItem[] = data?.items || [];

  const toggleCategory = (catId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(catId)) {
        newSet.delete(catId);
      } else {
        newSet.add(catId);
      }
      return newSet;
    });
  };

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    };
  };

  // Category mutations
  const saveCategoryMutation = useMutation({
    mutationFn: async ({ id, name }: { id?: string; name: string }) => {
      const headers = await getAuthHeaders();
      
      if (id) {
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories/${id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('Failed to update category');
        return res.json();
      } else {
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, sortOrder: categories.length }),
        });
        if (!res.ok) throw new Error('Failed to add category');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(editingCategory ? 'Category updated' : 'Category added');
      closeCategoryModal();
    },
    onError: () => toast.error('Failed to save category'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories/${categoryId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete category');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('Category deleted');
    },
    onError: () => toast.error('Failed to delete category'),
  });

  // Item mutations
  const saveItemMutation = useMutation({
    mutationFn: async (item: MenuItem) => {
      const headers = await getAuthHeaders();
      
      const payload = {
        name: item.name,
        description: item.description,
        price: item.price,
        categoryId: item.category_id || null,
        imageUrl: item.image_url,
        isAvailable: item.is_available,
        isFeatured: item.is_featured,
        prepTimeMins: item.prep_time_mins,
        calories: item.calories,
        options: item.options,
      };

      if (item.id) {
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${item.id}`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            name: item.name,
            description: item.description,
            price: item.price,
            category_id: item.category_id || null,
            image_url: item.image_url,
            is_available: item.is_available,
            is_featured: item.is_featured,
            prep_time_mins: item.prep_time_mins,
            calories: item.calories,
            options: item.options,
          }),
        });
        if (!res.ok) throw new Error('Failed to update item');
        return res.json();
      } else {
        const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Failed to add item');
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(editingItem ? 'Item updated' : 'Item added');
      closeItemModal();
    },
    onError: () => toast.error('Failed to save item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${itemId}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) throw new Error('Failed to delete item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('Item deleted');
    },
    onError: () => toast.error('Failed to delete item'),
  });

  const toggleAvailabilityMutation = useMutation({
    mutationFn: async ({ itemId, isAvailable }: { itemId: string; isAvailable: boolean }) => {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${itemId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_available: isAvailable }),
      });
      if (!res.ok) throw new Error('Failed to update availability');
      return res.json();
    },
    onSuccess: (_, { isAvailable }) => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success(isAvailable ? 'Item is now available' : 'Item marked as unavailable');
    },
    onError: () => toast.error('Failed to update availability'),
  });

  const openCategoryModal = (category?: Category) => {
    setEditingCategory(category || null);
    setCategoryName(category?.name || '');
    setShowCategoryModal(true);
  };

  const closeCategoryModal = () => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryName('');
  };

  const openItemModal = (item?: MenuItem) => {
    setEditingItem(item || null);
    setShowItemModal(true);
  };

  const closeItemModal = () => {
    setShowItemModal(false);
    setEditingItem(null);
  };

  const handleSaveCategory = () => {
    if (!categoryName.trim()) return;
    saveCategoryMutation.mutate({
      id: editingCategory?.id,
      name: categoryName.trim(),
    });
  };

  const handleDeleteCategory = (category: Category) => {
    const itemsInCategory = items.filter(i => i.category_id === category.id).length;
    const message = itemsInCategory > 0
      ? `Delete "${category.name}"? ${itemsInCategory} items will be moved to Uncategorized.`
      : `Delete "${category.name}"?`;
    
    if (confirm(message)) {
      deleteCategoryMutation.mutate(category.id);
    }
  };

  const itemsByCategory = React.useMemo(() => {
    const grouped: Record<string, MenuItem[]> = { uncategorized: [] };
    categories.forEach(c => { grouped[c.id] = []; });
    items.forEach(item => {
      if (item.category_id && grouped[item.category_id]) {
        grouped[item.category_id].push(item);
      } else {
        grouped.uncategorized.push(item);
      }
    });
    return grouped;
  }, [categories, items]);

  const allCategories = [
    ...categories.map(c => ({ id: c.id, name: c.name, isReal: true })),
    { id: 'uncategorized', name: 'Uncategorized', isReal: false },
  ].filter(cat => itemsByCategory[cat.id]?.length > 0 || cat.isReal);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          <p className="text-gray-500">{items.length} items in {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => openCategoryModal()}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Add Category
          </button>
          <button
            onClick={() => openItemModal()}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </h2>
              <button onClick={closeCategoryModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              placeholder="Category name (e.g., Main Dishes, Sides, Drinks)"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={closeCategoryModal}
                className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategory}
                disabled={!categoryName.trim() || saveCategoryMutation.isPending}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg disabled:opacity-50"
              >
                {saveCategoryMutation.isPending ? 'Saving...' : editingCategory ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      <MenuItemModal
        isOpen={showItemModal}
        onClose={closeItemModal}
        onSave={(item) => saveItemMutation.mutate(item as MenuItem)}
        item={editingItem}
        categories={categories}
        isPending={saveItemMutation.isPending}
      />

      {/* Content */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 && categories.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Start building your menu</h3>
          <p className="text-gray-500 mb-6">Add categories to organize your items, then add menu items.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => openCategoryModal()}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Add Category
            </button>
            <button
              onClick={() => openItemModal()}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium"
            >
              Add Item
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {allCategories.map(category => {
            const categoryItems = itemsByCategory[category.id] || [];
            const isExpanded = expandedCategories.has(category.id) || categoryItems.length <= 3;
            const displayItems = isExpanded ? categoryItems : categoryItems.slice(0, 3);

            return (
              <div key={category.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-4 bg-gray-50 border-b">
                  <div className="flex items-center gap-3">
                    <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
                    <h2 className="font-semibold text-gray-900">{category.name}</h2>
                    <span className="text-sm text-gray-500">({categoryItems.length} items)</span>
                  </div>
                  {category.isReal && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openCategoryModal(categories.find(c => c.id === category.id))}
                        className="p-2 text-gray-400 hover:text-gray-600"
                        title="Edit category"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(categories.find(c => c.id === category.id)!)}
                        className="p-2 text-gray-400 hover:text-red-500"
                        title="Delete category"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="divide-y">
                  {displayItems.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-4 hover:bg-gray-50 transition-colors ${
                        !item.is_available ? 'opacity-60' : ''
                      }`}
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                            <DollarSign className="w-6 h-6 text-gray-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{item.name}</p>
                            {item.is_featured && (
                              <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Featured</span>
                            )}
                            {item.options?.length > 0 && (
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                {item.options.length} modifier{item.options.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-sm text-gray-500 truncate">{item.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="font-semibold text-gray-900">${item.price.toFixed(2)}</span>
                        
                        <button
                          onClick={() => toggleAvailabilityMutation.mutate({
                            itemId: item.id,
                            isAvailable: !item.is_available,
                          })}
                          className={`p-1 rounded transition-colors ${
                            item.is_available
                              ? 'text-green-600 hover:bg-green-50'
                              : 'text-gray-400 hover:bg-gray-100'
                          }`}
                          title={item.is_available ? 'Mark as unavailable' : 'Mark as available'}
                        >
                          {item.is_available ? (
                            <ToggleRight className="w-6 h-6" />
                          ) : (
                            <ToggleLeft className="w-6 h-6" />
                          )}
                        </button>

                        <button
                          onClick={() => openItemModal(item)}
                          className="p-2 text-gray-400 hover:text-amber-500"
                          title="Edit item"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => {
                            if (confirm(`Delete "${item.name}"?`)) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-500"
                          title="Delete item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {categoryItems.length > 3 && (
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Show {categoryItems.length - 3} more items
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
