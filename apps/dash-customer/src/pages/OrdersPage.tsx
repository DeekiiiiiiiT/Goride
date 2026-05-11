import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { ArrowLeft, Clock, ChevronRight } from 'lucide-react';

interface OrdersPageProps {
  onNavigate: (page: string, data?: any) => void;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  merchant: {
    id: string;
    name: string;
    logo_url: string;
  };
  items: Array<{
    name: string;
    quantity: number;
  }>;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  placed: { label: 'Order Placed', color: 'text-blue-600 bg-blue-50' },
  accepted: { label: 'Accepted', color: 'text-emerald-600 bg-emerald-50' },
  preparing: { label: 'Preparing', color: 'text-yellow-600 bg-yellow-50' },
  ready: { label: 'Ready for Pickup', color: 'text-orange-600 bg-orange-50' },
  picked_up: { label: 'Out for Delivery', color: 'text-purple-600 bg-purple-50' },
  in_transit: { label: 'On the Way', color: 'text-purple-600 bg-purple-50' },
  delivered: { label: 'Delivered', color: 'text-emerald-600 bg-emerald-50' },
  completed: { label: 'Completed', color: 'text-gray-600 bg-gray-100' },
  cancelled: { label: 'Cancelled', color: 'text-red-600 bg-red-50' },
};

export default function OrdersPage({ onNavigate }: OrdersPageProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
  });

  const orders: Order[] = data?.orders || [];
  const activeOrders = orders.filter(o => !['completed', 'cancelled'].includes(o.status));
  const pastOrders = orders.filter(o => ['completed', 'cancelled'].includes(o.status));

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => onNavigate('home')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Orders</h1>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-4 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-red-500">Failed to load orders</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 rounded-full flex items-center justify-center">
            <Clock className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No orders yet</h2>
          <p className="text-gray-500 mb-6">Your order history will appear here</p>
          <button
            onClick={() => onNavigate('home')}
            className="px-6 py-3 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600"
          >
            Start ordering
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {activeOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Active Orders</h2>
              <div className="space-y-3">
                {activeOrders.map(order => {
                  const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-100' };
                  
                  return (
                    <button
                      key={order.id}
                      onClick={() => onNavigate('tracking', { orderId: order.id })}
                      className="w-full bg-white rounded-xl p-4 shadow-sm text-left flex items-center gap-4 hover:shadow-md transition-shadow"
                    >
                      {order.merchant.logo_url ? (
                        <img
                          src={order.merchant.logo_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center">
                          <span className="text-emerald-600 font-bold">
                            {order.merchant.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{order.merchant.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          {order.items.map(i => `${i.quantity}x ${i.name}`).slice(0, 2).join(', ')}
                          {order.items.length > 2 && ` +${order.items.length - 2} more`}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                          {order.order_number} • ${order.total.toFixed(2)}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {pastOrders.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Past Orders</h2>
              <div className="space-y-3">
                {pastOrders.map(order => {
                  const statusInfo = STATUS_LABELS[order.status] || { label: order.status, color: 'text-gray-600 bg-gray-100' };
                  
                  return (
                    <button
                      key={order.id}
                      onClick={() => onNavigate('tracking', { orderId: order.id })}
                      className="w-full bg-white rounded-xl p-4 shadow-sm text-left flex items-center gap-4 hover:shadow-md transition-shadow"
                    >
                      {order.merchant.logo_url ? (
                        <img
                          src={order.merchant.logo_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover opacity-75"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-500 font-bold">
                            {order.merchant.name.charAt(0)}
                          </span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-700">{order.merchant.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>
                            {statusInfo.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500">
                          ${order.total.toFixed(2)} • {formatDate(order.created_at)}
                        </p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
