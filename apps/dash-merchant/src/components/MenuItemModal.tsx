import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical } from 'lucide-react';
import ImageUpload from './ImageUpload';

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
  id?: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  category_id: string;
  is_available: boolean;
  is_featured: boolean;
  prep_time_mins: number | null;
  calories: number | null;
  options: ModifierGroup[];
}

interface Category {
  id: string;
  name: string;
}

interface MenuItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: MenuItem) => void;
  item?: MenuItem | null;
  categories: Category[];
  isPending?: boolean;
}

const DIETARY_TAGS = [
  { id: 'vegetarian', label: 'Vegetarian', icon: '🥬' },
  { id: 'vegan', label: 'Vegan', icon: '🌱' },
  { id: 'gluten-free', label: 'Gluten Free', icon: '🌾' },
  { id: 'halal', label: 'Halal', icon: '☪️' },
  { id: 'spicy', label: 'Spicy', icon: '🌶️' },
];

const generateId = () => Math.random().toString(36).substring(2, 9);

export default function MenuItemModal({
  isOpen,
  onClose,
  onSave,
  item,
  categories,
  isPending,
}: MenuItemModalProps) {
  const [formData, setFormData] = useState<MenuItem>({
    name: '',
    description: '',
    price: 0,
    image_url: '',
    category_id: '',
    is_available: true,
    is_featured: false,
    prep_time_mins: null,
    calories: null,
    options: [],
  });

  const [activeTab, setActiveTab] = useState<'basic' | 'modifiers'>('basic');

  useEffect(() => {
    if (item) {
      setFormData({
        ...item,
        options: item.options || [],
      });
    } else {
      setFormData({
        name: '',
        description: '',
        price: 0,
        image_url: '',
        category_id: '',
        is_available: true,
        is_featured: false,
        prep_time_mins: null,
        calories: null,
        options: [],
      });
    }
    setActiveTab('basic');
  }, [item, isOpen]);

  const addModifierGroup = () => {
    setFormData(prev => ({
      ...prev,
      options: [
        ...prev.options,
        {
          id: generateId(),
          name: '',
          required: false,
          minSelections: 0,
          maxSelections: 1,
          options: [{ id: generateId(), name: '', priceAdjustment: 0 }],
        },
      ],
    }));
  };

  const updateModifierGroup = (groupId: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map(g =>
        g.id === groupId ? { ...g, [field]: value } : g
      ),
    }));
  };

  const removeModifierGroup = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.filter(g => g.id !== groupId),
    }));
  };

  const addModifierOption = (groupId: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map(g =>
        g.id === groupId
          ? { ...g, options: [...g.options, { id: generateId(), name: '', priceAdjustment: 0 }] }
          : g
      ),
    }));
  };

  const updateModifierOption = (groupId: string, optionId: string, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map(g =>
        g.id === groupId
          ? {
              ...g,
              options: g.options.map(o =>
                o.id === optionId ? { ...o, [field]: value } : o
              ),
            }
          : g
      ),
    }));
  };

  const removeModifierOption = (groupId: string, optionId: string) => {
    setFormData(prev => ({
      ...prev,
      options: prev.options.map(g =>
        g.id === groupId
          ? { ...g, options: g.options.filter(o => o.id !== optionId) }
          : g
      ),
    }));
  };

  const handleSubmit = () => {
    if (!formData.name || formData.price <= 0) return;
    onSave(formData);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">
            {item?.id ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('basic')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'basic'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Basic Info
          </button>
          <button
            onClick={() => setActiveTab('modifiers')}
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'modifiers'
                ? 'border-amber-500 text-amber-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Modifiers ({formData.options.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <ImageUpload
                    value={formData.image_url}
                    onChange={(url) => setFormData({ ...formData, image_url: url })}
                    folder="menu-items"
                    aspectRatio="cover"
                    label="Item Photo"
                    placeholder="Add a photo"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Item Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Jerk Chicken, Curry Goat"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Describe this item..."
                    rows={2}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Price ($) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="">No category</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Prep Time (mins)
                  </label>
                  <input
                    type="number"
                    value={formData.prep_time_mins || ''}
                    onChange={(e) => setFormData({ ...formData, prep_time_mins: parseInt(e.target.value) || null })}
                    placeholder="15"
                    min="1"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Calories
                  </label>
                  <input
                    type="number"
                    value={formData.calories || ''}
                    onChange={(e) => setFormData({ ...formData, calories: parseInt(e.target.value) || null })}
                    placeholder="500"
                    min="0"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="md:col-span-2 flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_available}
                      onChange={(e) => setFormData({ ...formData, is_available: e.target.checked })}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="text-sm">Available for ordering</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <span className="text-sm">Featured item</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'modifiers' && (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-amber-800">
                  <strong>Modifiers</strong> let customers customize their order. 
                  Examples: "Size" (Small, Medium, Large), "Add-ons" (Extra cheese, Bacon), 
                  "Cooking preference" (Rare, Medium, Well done)
                </p>
              </div>

              {formData.options.map((group, groupIndex) => (
                <div key={group.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={group.name}
                      onChange={(e) => updateModifierGroup(group.id, 'name', e.target.value)}
                      placeholder="Group name (e.g., Size, Toppings)"
                      className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                    <button
                      onClick={() => removeModifierGroup(group.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex gap-4 mb-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={group.required}
                        onChange={(e) => updateModifierGroup(group.id, 'required', e.target.checked)}
                        className="w-4 h-4 accent-amber-500"
                      />
                      Required
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Min:</span>
                      <input
                        type="number"
                        value={group.minSelections}
                        onChange={(e) => updateModifierGroup(group.id, 'minSelections', parseInt(e.target.value) || 0)}
                        min="0"
                        className="w-16 px-2 py-1 border border-gray-200 rounded text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Max:</span>
                      <input
                        type="number"
                        value={group.maxSelections}
                        onChange={(e) => updateModifierGroup(group.id, 'maxSelections', parseInt(e.target.value) || 1)}
                        min="1"
                        className="w-16 px-2 py-1 border border-gray-200 rounded text-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-2 pl-6">
                    {group.options.map((option, optionIndex) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option.name}
                          onChange={(e) => updateModifierOption(group.id, option.id, 'name', e.target.value)}
                          placeholder="Option name"
                          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-sm text-gray-500">+$</span>
                          <input
                            type="number"
                            value={option.priceAdjustment || ''}
                            onChange={(e) => updateModifierOption(group.id, option.id, 'priceAdjustment', parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            step="0.01"
                            min="0"
                            className="w-20 px-2 py-2 border border-gray-200 rounded-lg text-sm"
                          />
                        </div>
                        {group.options.length > 1 && (
                          <button
                            onClick={() => removeModifierOption(group.id, option.id)}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      onClick={() => addModifierOption(group.id)}
                      className="text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add option
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={addModifierGroup}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-amber-500 hover:text-amber-600 flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Modifier Group
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-2 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!formData.name || formData.price <= 0 || isPending}
            className="flex-1 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving...' : item?.id ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
