import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { 
  DollarSign, ShoppingBag, Clock, TrendingUp, AlertCircle, 
  Star, CheckCircle, XCircle, ArrowUp, ArrowDown
} from 'lucide-react';
import { VerificationStatusBanner } from '../components/VerificationStatusBanner';

interface DashboardPageProps {
  merchant: Merchant;
  onNavigate: (page: string) => void;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  created_at: string;
  placed_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  customer: {
    name: string;
    phone: string;
  };
}

export default function DashboardPage({ merchant, onNavigate }: DashboardPageProps) {
  const queryClient = useQueryClient();
  const { data: ordersData } = useQuery({
    queryKey: ['merchant-orders-all'],
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

  const { data: completedData } = useQuery({
    queryKey: ['merchant-orders-completed'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/merchant/orders?status=delivered`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    refetchInterval: 60000,
  });

  const activeOrders: Order[] = ordersData?.orders || [];
  const completedOrders: Order[] = completedData?.orders || [];
  const allOrders = [...activeOrders, ...completedOrders];

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);

    const todayOrders = allOrders.filter(o => {
      const orderDate = new Date(o.placed_at || o.created_at);
      return orderDate >= todayStart && !['cancelled'].includes(o.status);
    });

    const yesterdayOrders = allOrders.filter(o => {
      const orderDate = new Date(o.placed_at || o.created_at);
      return orderDate >= yesterdayStart && orderDate < todayStart && !['cancelled'].includes(o.status);
    });

    const weekOrders = allOrders.filter(o => {
      const orderDate = new Date(o.placed_at || o.created_at);
      return orderDate >= weekStart && !['cancelled'].includes(o.status);
    });

    const todaySales = todayOrders.reduce((sum, o) => sum + o.total, 0);
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.total, 0);
    const weekSales = weekOrders.reduce((sum, o) => sum + o.total, 0);
    
    const salesChange = yesterdaySales > 0 
      ? ((todaySales - yesterdaySales) / yesterdaySales * 100).toFixed(0)
      : todaySales > 0 ? '100' : '0';

    const completedCount = allOrders.filter(o => o.status === 'delivered').length;
    const cancelledCount = allOrders.filter(o => o.status === 'cancelled').length;
    const completionRate = completedCount + cancelledCount > 0
      ? (completedCount / (completedCount + cancelledCount) * 100).toFixed(0)
      : '100';

    const avgOrderValue = todayOrders.length > 0 
      ? todaySales / todayOrders.length 
      : 0;

    return {
      todaySales,
      todayOrders: todayOrders.length,
      weekSales,
      weekOrders: weekOrders.length,
      salesChange: parseInt(salesChange),
      completionRate: parseInt(completionRate),
      avgOrderValue,
    };
  }, [allOrders]);

  const newOrders = activeOrders.filter(o => o.status === 'placed');
  const preparingOrders = activeOrders.filter(o => ['accepted', 'preparing'].includes(o.status));
  const readyOrders = activeOrders.filter(o => o.status === 'ready');

  const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ago`;
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {merchant.name}</p>
      </div>

      <VerificationStatusBanner
        merchant={merchant}
        onEdit={() => onNavigate('settings')}
        onRefresh={() => queryClient.invalidateQueries({ queryKey: ['my-merchant'] })}
        onResubmit={() => queryClient.invalidateQueries({ queryKey: ['my-merchant'] })}
      />

      {!merchant.is_accepting_orders && merchant.is_active && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Orders Paused</p>
            <p className="text-sm text-red-700 mt-1">
              You're currently not accepting orders. Go to Settings to resume.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Today's Sales</p>
              <p className="text-2xl font-bold text-gray-900">${stats.todaySales.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.todayOrders} orders</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          {stats.salesChange !== 0 && (
            <div className={`flex items-center gap-1 mt-3 text-sm ${stats.salesChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {stats.salesChange > 0 ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
              {Math.abs(stats.salesChange)}% vs yesterday
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">This Week</p>
              <p className="text-2xl font-bold text-gray-900">${stats.weekSales.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">{stats.weekOrders} orders</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Completion Rate</p>
              <p className="text-2xl font-bold text-gray-900">{stats.completionRate}%</p>
              <p className="text-xs text-gray-500 mt-1">Orders completed</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-gray-500 mb-1">Rating</p>
              <p className="text-2xl font-bold text-gray-900 flex items-center gap-1">
                {merchant.rating?.toFixed(1) || 'New'}
                <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
              </p>
              <p className="text-xs text-gray-500 mt-1">{merchant.total_ratings || 0} reviews</p>
            </div>
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
          </div>
        </div>
      </div>

      {newOrders.length > 0 && (
        <div className="bg-gradient-to-r from-red-500 to-orange-500 rounded-xl p-5 mb-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center animate-pulse">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-xl">
                  {newOrders.length} New Order{newOrders.length > 1 ? 's' : ''}!
                </p>
                <p className="text-white/80 text-sm">Waiting for your confirmation</p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('orders')}
              className="px-5 py-2.5 bg-white text-red-600 rounded-lg font-semibold hover:bg-white/90"
            >
              View Orders
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-yellow-500 rounded-full" />
              New Orders
            </h2>
            <span className="text-sm text-gray-500">{newOrders.length}</span>
          </div>
          <div className="p-4">
            {newOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No new orders</p>
            ) : (
              <div className="space-y-3">
                {newOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="p-3 bg-yellow-50 rounded-lg border border-yellow-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{order.order_number}</p>
                        <p className="text-sm text-gray-500">{order.customer.name}</p>
                        <p className="text-xs text-yellow-700 mt-1">{getTimeAgo(order.placed_at)}</p>
                      </div>
                      <p className="font-bold text-gray-900">${order.total.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-blue-500 rounded-full" />
              In Preparation
            </h2>
            <span className="text-sm text-gray-500">{preparingOrders.length}</span>
          </div>
          <div className="p-4">
            {preparingOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No orders being prepared</p>
            ) : (
              <div className="space-y-3">
                {preparingOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{order.order_number}</p>
                        <p className="text-sm text-gray-500">{order.customer.name}</p>
                        <p className="text-xs text-blue-700 mt-1">{getTimeAgo(order.placed_at)}</p>
                      </div>
                      <p className="font-bold text-gray-900">${order.total.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full" />
              Ready for Pickup
            </h2>
            <span className="text-sm text-gray-500">{readyOrders.length}</span>
          </div>
          <div className="p-4">
            {readyOrders.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-4">No orders ready</p>
            ) : (
              <div className="space-y-3">
                {readyOrders.slice(0, 5).map(order => (
                  <div key={order.id} className="p-3 bg-green-50 rounded-lg border border-green-100">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{order.order_number}</p>
                        <p className="text-sm text-gray-500">{order.customer.name}</p>
                        <p className="text-xs text-green-700 mt-1">{getTimeAgo(order.placed_at)}</p>
                      </div>
                      <p className="font-bold text-gray-900">${order.total.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Quick Stats</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-3xl font-bold text-gray-900">{merchant.avg_prep_time_mins}</p>
            <p className="text-sm text-gray-500">Avg Prep (min)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">${stats.avgOrderValue.toFixed(0)}</p>
            <p className="text-sm text-gray-500">Avg Order Value</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">{merchant.delivery_radius_km}</p>
            <p className="text-sm text-gray-500">Delivery Radius (km)</p>
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900">${merchant.delivery_fee}</p>
            <p className="text-sm text-gray-500">Delivery Fee</p>
          </div>
        </div>
      </div>
    </div>
  );
}
