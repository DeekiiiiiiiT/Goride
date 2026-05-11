import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { Check, X, Clock, ChefHat, Package, Phone } from 'lucide-react';

interface OrdersPageProps {
  merchant: Merchant;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  created_at: string;
  placed_at: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  customer: {
    name: string;
    phone: string;
  };
  delivery_address: string;
  delivery_instructions: string;
}

export default function OrdersPage({ merchant }: OrdersPageProps) {
  const [filter, setFilter] = useState<string>('active');
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['merchant-orders', filter],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const url = filter === 'active'
        ? `${API_ENDPOINTS.delivery}/merchant/orders`
        : `${API_ENDPOINTS.delivery}/merchant/orders?status=${filter}`;

      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    refetchInterval: 15000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status, actorType: 'merchant' }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update order');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-orders'] });
      toast.success('Order updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const orders: Order[] = data?.orders || [];

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.round((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 60) return `${diffMins} min ago`;
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const getStatusActions = (status: string) => {
    switch (status) {
      case 'placed':
        return [
          { label: 'Accept', status: 'accepted', color: 'bg-green-500 hover:bg-green-600' },
          { label: 'Reject', status: 'cancelled', color: 'bg-red-500 hover:bg-red-600' },
        ];
      case 'accepted':
        return [
          { label: 'Start Preparing', status: 'preparing', color: 'bg-blue-500 hover:bg-blue-600' },
        ];
      case 'preparing':
        return [
          { label: 'Mark Ready', status: 'ready', color: 'bg-green-500 hover:bg-green-600' },
        ];
      default:
        return [];
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="text-gray-500">Manage incoming orders</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { key: 'active', label: 'Active' },
          { key: 'placed', label: 'New' },
          { key: 'preparing', label: 'Preparing' },
          { key: 'ready', label: 'Ready' },
          { key: 'completed', label: 'Completed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              filter === tab.key
                ? 'bg-amber-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-1/4 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-white rounded-xl p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const actions = getStatusActions(order.status);

            return (
              <div key={order.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-lg">{order.order_number}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          order.status === 'placed' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'accepted' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'preparing' ? 'bg-purple-100 text-purple-700' :
                          order.status === 'ready' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        <Clock className="w-4 h-4 inline mr-1" />
                        {formatTime(order.placed_at || order.created_at)}
                      </p>
                    </div>
                    <p className="text-xl font-bold">${order.total.toFixed(2)}</p>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Items</h4>
                      <ul className="space-y-1">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="text-sm">
                            {item.quantity}x {item.name}
                            <span className="text-gray-500 ml-2">${(item.price * item.quantity).toFixed(2)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-2">Customer</h4>
                      <p className="text-sm font-medium">{order.customer.name}</p>
                      {order.customer.phone && (
                        <a href={`tel:${order.customer.phone}`} className="text-sm text-amber-600 flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {order.customer.phone}
                        </a>
                      )}
                      <p className="text-sm text-gray-500 mt-2">{order.delivery_address}</p>
                      {order.delivery_instructions && (
                        <p className="text-xs text-gray-400 mt-1">Note: {order.delivery_instructions}</p>
                      )}
                    </div>
                  </div>

                  {actions.length > 0 && (
                    <div className="flex gap-2 pt-4 border-t">
                      {actions.map(action => (
                        <button
                          key={action.status}
                          onClick={() => updateStatusMutation.mutate({ orderId: order.id, status: action.status })}
                          disabled={updateStatusMutation.isPending}
                          className={`px-4 py-2 rounded-lg text-white font-medium text-sm ${action.color} disabled:opacity-50`}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
