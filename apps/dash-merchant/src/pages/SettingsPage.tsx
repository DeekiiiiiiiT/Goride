import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { Store, MapPin, Clock, DollarSign, Save, ImageIcon } from 'lucide-react';
import ImageUpload from '../components/ImageUpload';

interface SettingsPageProps {
  merchant: Merchant;
}

interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const CUISINE_TYPES = [
  'Jamaican', 'Caribbean', 'Chinese', 'Indian', 'Italian', 'American',
  'Fast Food', 'Pizza', 'Seafood', 'Vegetarian', 'Vegan', 'Bakery',
  'Cafe', 'Mexican', 'Japanese', 'Thai', 'BBQ', 'Healthy', 'Desserts', 'Other'
];

export default function SettingsPage({ merchant }: SettingsPageProps) {
  const [formData, setFormData] = useState({
    name: merchant.name,
    description: merchant.description || '',
    address: merchant.address,
    phone: merchant.phone || '',
    email: merchant.email || '',
    cuisineType: merchant.cuisine_type || '',
    avgPrepTimeMins: merchant.avg_prep_time_mins || 30,
    minOrderAmount: merchant.min_order_amount || 0,
    deliveryFee: merchant.delivery_fee || 0,
    deliveryRadiusKm: merchant.delivery_radius_km || 10,
    isAcceptingOrders: merchant.is_accepting_orders,
    logoUrl: merchant.logo_url || '',
    coverImageUrl: merchant.cover_image_url || '',
  });

  const [hours, setHours] = useState<DayHours[]>(
    DAYS.map(() => ({ open: '09:00', close: '21:00', isClosed: false }))
  );

  const queryClient = useQueryClient();

  const { data: hoursData } = useQuery({
    queryKey: ['merchant-hours', merchant.id],
    queryFn: async () => {
      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`);
      if (!res.ok) return [];
      const { hours } = await res.json();
      return hours;
    },
  });

  useEffect(() => {
    if (hoursData && hoursData.length > 0) {
      const updatedHours = DAYS.map((_, index) => {
        const dayData = hoursData.find((h: any) => h.day_of_week === index);
        if (dayData) {
          return {
            open: dayData.open_time?.slice(0, 5) || '09:00',
            close: dayData.close_time?.slice(0, 5) || '21:00',
            isClosed: dayData.is_closed || false,
          };
        }
        return { open: '09:00', close: '21:00', isClosed: false };
      });
      setHours(updatedHours);
    }
  }, [hoursData]);

  const updateHours = (dayIndex: number, field: keyof DayHours, value: any) => {
    setHours(prev => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: value };
      return updated;
    });
  };

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          address: data.address,
          phone: data.phone,
          email: data.email,
          cuisine_type: data.cuisineType,
          avg_prep_time_mins: data.avgPrepTimeMins,
          min_order_amount: data.minOrderAmount,
          delivery_fee: data.deliveryFee,
          delivery_radius_km: data.deliveryRadiusKm,
          is_accepting_orders: data.isAcceptingOrders,
          logo_url: data.logoUrl,
          cover_image_url: data.coverImageUrl,
        }),
      });
      if (!res.ok) throw new Error('Failed to update settings');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-merchant'] });
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const hoursMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const hoursPayload = hours.map((h, index) => ({
        dayOfWeek: index,
        openTime: h.open,
        closeTime: h.close,
        isClosed: h.isClosed,
      }));

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchants/${merchant.id}/hours`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ hours: hoursPayload }),
      });
      if (!res.ok) throw new Error('Failed to update hours');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-hours', merchant.id] });
    },
    onError: () => toast.error('Failed to save hours'),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      await Promise.all([
        updateMutation.mutateAsync(formData),
        hoursMutation.mutateAsync(),
      ]);
      toast.success('Settings saved');
    } catch {
      // Error handling is done in mutation onError
    }
  };

  const isPending = updateMutation.isPending || hoursMutation.isPending;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Manage your restaurant settings</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-gray-400" />
            Branding
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            <ImageUpload
              value={formData.logoUrl}
              onChange={(url) => setFormData({ ...formData, logoUrl: url })}
              folder="logos"
              aspectRatio="logo"
              label="Restaurant Logo"
              placeholder="Upload logo"
            />
            <div className="md:col-span-2">
              <ImageUpload
                value={formData.coverImageUrl}
                onChange={(url) => setFormData({ ...formData, coverImageUrl: url })}
                folder="covers"
                aspectRatio="cover"
                label="Cover Image"
                placeholder="Upload cover photo"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Store className="w-5 h-5 text-gray-400" />
            Basic Information
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cuisine Type</label>
              <select
                value={formData.cuisineType}
                onChange={(e) => setFormData({ ...formData, cuisineType: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select cuisine type</option>
                {CUISINE_TYPES.map(cuisine => (
                  <option key={cuisine} value={cuisine}>{cuisine}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            Contact & Location
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Operating Hours
          </h2>
          <div className="space-y-3">
            {DAYS.map((day, index) => (
              <div
                key={day}
                className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                  hours[index].isClosed ? 'bg-gray-50' : 'bg-white border border-gray-200'
                }`}
              >
                <div className="w-24 font-medium text-gray-700 text-sm">{day}</div>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!hours[index].isClosed}
                    onChange={(e) => updateHours(index, 'isClosed', !e.target.checked)}
                    className="w-4 h-4 accent-amber-500"
                  />
                  <span className="text-sm text-gray-500">Open</span>
                </label>

                {!hours[index].isClosed && (
                  <>
                    <input
                      type="time"
                      value={hours[index].open}
                      onChange={(e) => updateHours(index, 'open', e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm"
                    />
                    <span className="text-gray-400">to</span>
                    <input
                      type="time"
                      value={hours[index].close}
                      onChange={(e) => updateHours(index, 'close', e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded text-sm"
                    />
                  </>
                )}

                {hours[index].isClosed && (
                  <span className="text-sm text-gray-400 italic">Closed</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" />
            Operations
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="font-medium">Accepting Orders</p>
                <p className="text-sm text-gray-500">Toggle to pause/resume incoming orders</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isAcceptingOrders: !formData.isAcceptingOrders })}
                className={`w-12 h-6 rounded-full transition-colors ${formData.isAcceptingOrders ? 'bg-green-500' : 'bg-gray-300'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.isAcceptingOrders ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Average Prep Time (minutes)</label>
              <input
                type="number"
                value={formData.avgPrepTimeMins}
                onChange={(e) => setFormData({ ...formData, avgPrepTimeMins: parseInt(e.target.value) || 30 })}
                min="5"
                max="120"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-gray-400" />
            Pricing
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Fee ($)</label>
              <input
                type="number"
                value={formData.deliveryFee}
                onChange={(e) => setFormData({ ...formData, deliveryFee: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Order ($)</label>
              <input
                type="number"
                value={formData.minOrderAmount}
                onChange={(e) => setFormData({ ...formData, minOrderAmount: parseFloat(e.target.value) || 0 })}
                min="0"
                step="0.01"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Radius (km)</label>
              <input
                type="number"
                value={formData.deliveryRadiusKm}
                onChange={(e) => setFormData({ ...formData, deliveryRadiusKm: parseFloat(e.target.value) || 10 })}
                min="1"
                max="50"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending}
          className="w-full py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-5 h-5" />
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
