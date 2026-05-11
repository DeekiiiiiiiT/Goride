import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { Merchant } from '../hooks/useMerchant';
import { toast } from 'sonner';
import { 
  Check, X, Clock, ChefHat, Package, Phone, Printer, 
  Volume2, VolumeX, Bell, MapPin, MessageSquare 
} from 'lucide-react';

interface OrdersPageProps {
  merchant: Merchant;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  options?: Array<{
    name: string;
    selections: Array<{ name: string; priceAdjustment: number }>;
  }>;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  total: number;
  subtotal: number;
  delivery_fee: number;
  platform_fee: number;
  tax: number;
  tip: number;
  created_at: string;
  placed_at: string;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  items: OrderItem[];
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  delivery_address: string;
  delivery_instructions: string;
  payment_method: string;
  payment_status: string;
}

const ORDER_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

export default function OrdersPage({ merchant }: OrdersPageProps) {
  const [filter, setFilter] = useState<string>('active');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    audioRef.current = new Audio(ORDER_SOUND_URL);
    audioRef.current.volume = 0.5;
    
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('merchant-orders')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'delivery',
          table: 'orders',
          filter: `merchant_id=eq.${merchant.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['merchant-orders'] });
          
          const newOrder = payload.new as Order;
          setNewOrderIds(prev => new Set([...prev, newOrder.id]));
          
          if (soundEnabled && audioRef.current) {
            audioRef.current.play().catch(() => {});
          }
          
          toast.success(`New order received! #${newOrder.order_number || 'New'}`, {
            duration: 10000,
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'delivery',
          table: 'orders',
          filter: `merchant_id=eq.${merchant.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['merchant-orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchant.id, soundEnabled, queryClient]);

  const { data, isLoading } = useQuery({
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
    refetchInterval: 30000,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, notes }: { orderId: string; status: string; notes?: string }) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status, actorType: 'merchant', notes }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to update order');
      }
      return res.json();
    },
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: ['merchant-orders'] });
      setNewOrderIds(prev => {
        const updated = new Set(prev);
        updated.delete(orderId);
        return updated;
      });
      toast.success('Order updated');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleReject = (orderId: string) => {
    const reason = prompt('Reason for rejection (optional):');
    updateStatusMutation.mutate({ orderId, status: 'cancelled', notes: reason || 'Rejected by merchant' });
  };

  const printReceipt = (order: Order) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Order #${order.order_number}</title>
        <style>
          body { font-family: monospace; padding: 20px; max-width: 300px; margin: 0 auto; }
          h1 { font-size: 18px; text-align: center; margin-bottom: 5px; }
          h2 { font-size: 14px; text-align: center; margin-top: 0; color: #666; }
          .divider { border-top: 1px dashed #000; margin: 10px 0; }
          .item { display: flex; justify-content: space-between; margin: 5px 0; }
          .modifier { font-size: 12px; color: #666; margin-left: 15px; }
          .total { font-weight: bold; font-size: 16px; }
          .customer { margin-top: 15px; font-size: 12px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <h1>${merchant.name}</h1>
        <h2>Order #${order.order_number}</h2>
        <p style="text-align: center; font-size: 12px;">${new Date(order.placed_at).toLocaleString()}</p>
        <div class="divider"></div>
        ${order.items.map(item => `
          <div class="item">
            <span>${item.quantity}x ${item.name}</span>
            <span>$${(item.price * item.quantity).toFixed(2)}</span>
          </div>
          ${item.options?.map(opt => `
            <div class="modifier">+ ${opt.selections?.map(s => s.name).join(', ')}</div>
          `).join('') || ''}
        `).join('')}
        <div class="divider"></div>
        <div class="item"><span>Subtotal</span><span>$${order.subtotal.toFixed(2)}</span></div>
        <div class="item"><span>Delivery</span><span>$${order.delivery_fee.toFixed(2)}</span></div>
        <div class="item"><span>Tax</span><span>$${order.tax.toFixed(2)}</span></div>
        ${order.tip > 0 ? `<div class="item"><span>Tip</span><span>$${order.tip.toFixed(2)}</span></div>` : ''}
        <div class="divider"></div>
        <div class="item total"><span>TOTAL</span><span>$${order.total.toFixed(2)}</span></div>
        <div class="item"><span>Payment</span><span>${order.payment_method.toUpperCase()}</span></div>
        <div class="customer">
          <strong>Customer:</strong> ${order.customer.name}<br>
          ${order.customer.phone ? `Phone: ${order.customer.phone}<br>` : ''}
          <strong>Deliver to:</strong> ${order.delivery_address}
          ${order.delivery_instructions ? `<br><em>Note: ${order.delivery_instructions}</em>` : ''}
        </div>
        <script>window.print(); setTimeout(() => window.close(), 500);</script>
      </body>
      </html>
    `;
    
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const orders: Order[] = data?.orders || [];
  const newOrderCount = orders.filter(o => o.status === 'placed').length;

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffMins = Math.round((now.getTime() - date.getTime()) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const getElapsedTime = (order: Order) => {
    const startTime = order.accepted_at || order.placed_at;
    if (!startTime) return null;
    const elapsed = Math.round((Date.now() - new Date(startTime).getTime()) / 60000);
    return elapsed;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'placed': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'accepted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'preparing': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'ready': return 'bg-green-100 text-green-700 border-green-200';
      case 'picked_up': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getStatusActions = (status: string) => {
    switch (status) {
      case 'placed':
        return [
          { label: 'Accept Order', status: 'accepted', color: 'bg-green-500 hover:bg-green-600', icon: Check },
          { label: 'Reject', status: 'cancelled', color: 'bg-red-500 hover:bg-red-600', icon: X, isReject: true },
        ];
      case 'accepted':
        return [
          { label: 'Start Preparing', status: 'preparing', color: 'bg-blue-500 hover:bg-blue-600', icon: ChefHat },
        ];
      case 'preparing':
        return [
          { label: 'Mark Ready for Pickup', status: 'ready', color: 'bg-green-500 hover:bg-green-600', icon: Package },
        ];
      default:
        return [];
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <p className="text-gray-500">
            {newOrderCount > 0 && (
              <span className="text-amber-600 font-medium">{newOrderCount} new order{newOrderCount > 1 ? 's' : ''} • </span>
            )}
            Real-time updates enabled
          </p>
        </div>
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`p-2 rounded-lg ${soundEnabled ? 'bg-amber-100 text-amber-600' : 'bg-gray-100 text-gray-400'}`}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {[
          { key: 'active', label: 'Active', count: orders.filter(o => ['placed', 'accepted', 'preparing', 'ready'].includes(o.status)).length },
          { key: 'placed', label: 'New', count: newOrderCount },
          { key: 'preparing', label: 'Preparing', count: orders.filter(o => o.status === 'preparing').length },
          { key: 'ready', label: 'Ready', count: orders.filter(o => o.status === 'ready').length },
          { key: 'completed', label: 'Completed' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
              filter === tab.key
                ? 'bg-amber-500 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                filter === tab.key ? 'bg-white/20' : 'bg-amber-100 text-amber-700'
              }`}>
                {tab.count}
              </span>
            )}
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
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No orders yet</h3>
          <p className="text-gray-500">New orders will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(order => {
            const actions = getStatusActions(order.status);
            const isNew = newOrderIds.has(order.id);
            const elapsed = getElapsedTime(order);

            return (
              <div
                key={order.id}
                className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all ${
                  isNew ? 'ring-2 ring-amber-500 ring-offset-2' : ''
                } ${order.status === 'placed' ? 'border-l-4 border-l-yellow-500' : ''}`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-bold text-xl">{order.order_number}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                          {order.status.replace('_', ' ').toUpperCase()}
                        </span>
                        {isNew && (
                          <span className="px-2 py-1 bg-amber-500 text-white rounded text-xs font-bold animate-pulse">
                            NEW
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {formatTime(order.placed_at || order.created_at)}
                        </span>
                        {elapsed !== null && order.status !== 'placed' && (
                          <span className={`${elapsed > merchant.avg_prep_time_mins ? 'text-red-500 font-medium' : ''}`}>
                            {elapsed}m elapsed
                          </span>
                        )}
                        <span className="capitalize">{order.payment_method}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold">${order.total.toFixed(2)}</p>
                      <button
                        onClick={() => printReceipt(order)}
                        className="text-sm text-gray-500 hover:text-amber-600 flex items-center gap-1 mt-1"
                      >
                        <Printer className="w-4 h-4" />
                        Print
                      </button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6 mb-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-3">Order Items</h4>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between">
                            <div>
                              <span className="font-medium">{item.quantity}x</span> {item.name}
                              {item.options && item.options.length > 0 && (
                                <div className="text-xs text-gray-500 ml-5">
                                  {item.options.map((opt, oidx) => (
                                    <div key={oidx}>
                                      + {opt.selections?.map(s => s.name).join(', ')}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                            <span className="text-gray-600">${(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-3">Customer & Delivery</h4>
                      <div className="space-y-2">
                        <p className="font-medium text-gray-900">{order.customer.name}</p>
                        {order.customer.phone && (
                          <a
                            href={`tel:${order.customer.phone}`}
                            className="text-amber-600 hover:text-amber-700 flex items-center gap-2 text-sm"
                          >
                            <Phone className="w-4 h-4" />
                            {order.customer.phone}
                          </a>
                        )}
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{order.delivery_address}</span>
                        </div>
                        {order.delivery_instructions && (
                          <div className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 p-2 rounded">
                            <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{order.delivery_instructions}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {actions.length > 0 && (
                    <div className="flex gap-3 pt-4 border-t">
                      {actions.map(action => {
                        const Icon = action.icon;
                        return (
                          <button
                            key={action.status}
                            onClick={() => {
                              if (action.isReject) {
                                handleReject(order.id);
                              } else {
                                updateStatusMutation.mutate({ orderId: order.id, status: action.status });
                              }
                            }}
                            disabled={updateStatusMutation.isPending}
                            className={`px-5 py-2.5 rounded-lg text-white font-medium text-sm ${action.color} disabled:opacity-50 flex items-center gap-2`}
                          >
                            <Icon className="w-4 h-4" />
                            {action.label}
                          </button>
                        );
                      })}
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
