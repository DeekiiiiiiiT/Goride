import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, DollarSign, X } from 'lucide-react';

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
}

interface Category {
  id: string;
  name: string;
  description: string;
  sort_order: number;
}

export default function MenuPage({ merchant }: MenuPageProps) {
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newItem, setNewItem] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
  });
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

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to add category');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('Category added');
      setShowAddCategory(false);
      setNewCategory('');
    },
    onError: () => toast.error('Failed to add category'),
  });

  const addItemMutation = useMutation({
    mutationFn: async (item: typeof newItem) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: item.name,
          description: item.description,
          price: parseFloat(item.price),
          categoryId: item.categoryId || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to add item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-menu'] });
      toast.success('Item added');
      setShowAddItem(false);
      setNewItem({ name: '', description: '', price: '', categoryId: '' });
    },
    onError: () => toast.error('Failed to add item'),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/items/${itemId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu</h1>
          <p className="text-gray-500">Manage your menu items</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAddCategory(true)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            Add Category
          </button>
          <button
            onClick={() => setShowAddItem(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        </div>
      </div>

      {showAddCategory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Category</h2>
              <button onClick={() => setShowAddCategory(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category name"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg mb-4"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowAddCategory(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => addCategoryMutation.mutate(newCategory)}
                disabled={!newCategory || addCategoryMutation.isPending}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add Menu Item</h2>
              <button onClick={() => setShowAddItem(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <input
                type="text"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="Item name"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg"
              />
              <textarea
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Description (optional)"
                rows={2}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg"
              />
              <input
                type="number"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                placeholder="Price"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg"
              />
              <select
                value={newItem.categoryId}
                onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg"
              >
                <option value="">No category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowAddItem(false)} className="flex-1 py-2 border border-gray-300 rounded-lg">
                Cancel
              </button>
              <button
                onClick={() => addItemMutation.mutate(newItem)}
                disabled={!newItem.name || !newItem.price || addItemMutation.isPending}
                className="flex-1 py-2 bg-amber-500 text-white rounded-lg disabled:opacity-50"
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <DollarSign className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No menu items yet</p>
          <button
            onClick={() => setShowAddItem(true)}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium"
          >
            Add your first item
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {[...categories.map(c => ({ id: c.id, name: c.name })), { id: 'uncategorized', name: 'Uncategorized' }]
            .filter(cat => itemsByCategory[cat.id]?.length > 0)
            .map(category => (
              <div key={category.id} className="bg-white rounded-xl shadow-sm p-6">
                <h2 className="font-semibold text-lg mb-4">{category.name}</h2>
                <div className="space-y-3">
                  {itemsByCategory[category.id].map(item => (
                    <div key={item.id} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-4">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                            <DollarSign className="w-5 h-5 text-gray-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium">{item.name}</p>
                          {item.description && <p className="text-sm text-gray-500 truncate max-w-xs">{item.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold">${item.price.toFixed(2)}</span>
                        <span className={`text-xs px-2 py-1 rounded ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {item.is_available ? 'Available' : 'Unavailable'}
                        </span>
                        <button
                          onClick={() => {
                            if (confirm('Delete this item?')) {
                              deleteItemMutation.mutate(item.id);
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
