import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { DollarSign, ShoppingBag, Clock, TrendingUp, AlertCircle } from 'lucide-react';

interface DashboardPageProps {
  merchant: Merchant;
  onNavigate: (page: string) => void;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  customer: {
    name: string;
    phone: string;
  };
}

export default function DashboardPage({ merchant, onNavigate }: DashboardPageProps) {
  const { data: ordersData } = useQuery({
    queryKey: ['merchant-orders-active'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const orders: Order[] = ordersData?.orders || [];
  const newOrders = orders.filter(o => o.status === 'placed');
  const preparingOrders = orders.filter(o => ['accepted', 'preparing'].includes(o.status));
  const readyOrders = orders.filter(o => o.status === 'ready');

  const todayTotal = orders.reduce((sum, o) => sum + o.total, 0);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {merchant.name}</p>
      </div>

      {!merchant.is_active && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800">Restaurant Pending Verification</p>
            <p className="text-sm text-amber-700 mt-1">
              Your restaurant is being reviewed. You'll be able to receive orders once verified.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today's Sales</p>
              <p className="text-2xl font-bold text-gray-900">${todayTotal.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <ShoppingBag className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Orders</p>
              <p className="text-2xl font-bold text-gray-900">{orders.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Prep Time</p>
              <p className="text-2xl font-bold text-gray-900">{merchant.avg_prep_time_mins} min</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Rating</p>
              <p className="text-2xl font-bold text-gray-900">
                {merchant.rating?.toFixed(1) || 'New'}
                <span className="text-sm font-normal text-gray-500 ml-1">
                  ({merchant.total_ratings || 0})
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {newOrders.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center animate-pulse">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-red-800">
                  {newOrders.length} New Order{newOrders.length > 1 ? 's' : ''}!
                </p>
                <p className="text-sm text-red-700">Waiting for your confirmation</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600"
            >
              View Orders
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-yellow-500 rounded-full" />
            New ({newOrders.length})
          </h2>
          {newOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No new orders</p>
          ) : (
            <div className="space-y-3">
              {newOrders.slice(0, 5).map(order => (
                <div key={order.id} className="p-3 bg-yellow-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-gray-500">{order.customer.name}</p>
                    </div>
                    <p className="font-semibold">${order.total.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full" />
            Preparing ({preparingOrders.length})
          </h2>
          {preparingOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No orders in preparation</p>
          ) : (
            <div className="space-y-3">
              {preparingOrders.slice(0, 5).map(order => (
                <div key={order.id} className="p-3 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-gray-500">{order.customer.name}</p>
                    </div>
                    <p className="font-semibold">${order.total.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="w-3 h-3 bg-green-500 rounded-full" />
            Ready ({readyOrders.length})
          </h2>
          {readyOrders.length === 0 ? (
            <p className="text-gray-500 text-sm">No orders ready for pickup</p>
          ) : (
            <div className="space-y-3">
              {readyOrders.slice(0, 5).map(order => (
                <div key={order.id} className="p-3 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{order.order_number}</p>
                      <p className="text-sm text-gray-500">{order.customer.name}</p>
                    </div>
                    <p className="font-semibold">${order.total.toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
