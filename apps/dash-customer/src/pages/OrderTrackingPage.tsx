import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { ArrowLeft, Check, Clock, MapPin, Phone, ChefHat, Bike, Package } from 'lucide-react';

interface OrderTrackingPageProps {
  orderId: string;
  onNavigate: (page: string, data?: any) => void;
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
  delivery_address: string;
  delivery_instructions: string;
  estimated_delivery_at: string;
  placed_at: string;
  accepted_at: string;
  preparing_at: string;
  ready_at: string;
  picked_up_at: string;
  delivered_at: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  merchant: {
    id: string;
    name: string;
    logo_url: string;
    phone: string;
    address: string;
  };
}

interface OrderEvent {
  id: string;
  status: string;
  notes: string;
  created_at: string;
}

const STATUS_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: Package },
  { key: 'accepted', label: 'Accepted', icon: Check },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: Package },
  { key: 'picked_up', label: 'Picked Up', icon: Bike },
  { key: 'delivered', label: 'Delivered', icon: MapPin },
];

export default function OrderTrackingPage({ orderId, onNavigate }: OrderTrackingPageProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
    enabled: !!orderId,
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!orderId) return;

    const channel = supabase
      .channel(`order-${orderId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'delivery',
        table: 'orders',
        filter: `id=eq.${orderId}`,
      }, () => {
        refetch();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  const order: Order | null = data?.order;
  const events: OrderEvent[] = data?.events || [];

  const getStatusIndex = (status: string) => {
    return STATUS_STEPS.findIndex(s => s.key === status);
  };

  const currentStatusIndex = order ? getStatusIndex(order.status) : -1;

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  if (!orderId) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">No order selected</p>
        <button
          onClick={() => onNavigate('orders')}
          className="mt-4 text-emerald-600 font-medium"
        >
          View orders
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/2" />
          <div className="h-32 bg-gray-200 rounded-xl" />
          <div className="h-48 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Failed to load order</p>
        <button
          onClick={() => onNavigate('orders')}
          className="mt-4 text-emerald-600 font-medium"
        >
          Back to orders
        </button>
      </div>
    );
  }

  const isCancelled = order.status === 'cancelled';
  const isCompleted = order.status === 'completed' || order.status === 'delivered';

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => onNavigate('orders')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to orders</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <div className="flex items-center gap-4 mb-4">
          {order.merchant.logo_url ? (
            <img
              src={order.merchant.logo_url}
              alt=""
              className="w-14 h-14 rounded-lg object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-lg bg-emerald-100 flex items-center justify-center">
              <span className="text-emerald-600 text-xl font-bold">
                {order.merchant.name.charAt(0)}
              </span>
            </div>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900">{order.merchant.name}</h1>
            <p className="text-gray-500">Order {order.order_number}</p>
          </div>
        </div>

        {!isCancelled && (
          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              {STATUS_STEPS.slice(0, -1).map((step, index) => {
                const Icon = step.icon;
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isActive
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                        } ${isCurrent ? 'ring-4 ring-emerald-100' : ''}`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <span
                        className={`text-xs mt-2 ${
                          isActive ? 'text-emerald-600 font-medium' : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < STATUS_STEPS.length - 2 && (
                      <div
                        className={`flex-1 h-1 mx-2 rounded ${
                          index < currentStatusIndex ? 'bg-emerald-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {order.estimated_delivery_at && !isCompleted && (
              <div className="bg-emerald-50 rounded-lg p-4 flex items-center gap-3">
                <Clock className="w-5 h-5 text-emerald-600" />
                <div>
                  <p className="text-sm text-emerald-800 font-medium">
                    Estimated delivery
                  </p>
                  <p className="text-emerald-600">
                    {formatTime(order.estimated_delivery_at)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {isCancelled && (
          <div className="bg-red-50 rounded-lg p-4 mt-4">
            <p className="text-red-800 font-medium">Order Cancelled</p>
            <p className="text-red-600 text-sm mt-1">
              This order was cancelled. Contact support if you have questions.
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
          <div>
            <p className="text-gray-900">{order.delivery_address}</p>
            {order.delivery_instructions && (
              <p className="text-gray-500 text-sm mt-1">{order.delivery_instructions}</p>
            )}
          </div>
        </div>

        {order.merchant.phone && (
          <a
            href={`tel:${order.merchant.phone}`}
            className="mt-4 flex items-center gap-3 text-emerald-600 hover:text-emerald-700"
          >
            <Phone className="w-5 h-5" />
            <span>Contact restaurant</span>
          </a>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order Items</h2>
        <div className="space-y-3">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between">
              <span className="text-gray-700">
                {item.quantity}x {item.name}
              </span>
              <span className="text-gray-600">
                ${(item.price * item.quantity).toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t mt-4 pt-4 space-y-2 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${order.subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Delivery</span>
            <span>${order.delivery_fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Fees & Tax</span>
            <span>${(order.platform_fee + order.tax).toFixed(2)}</span>
          </div>
          {order.tip > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tip</span>
              <span>${order.tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-2 border-t">
            <span>Total</span>
            <span>${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Order Timeline</h2>
          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-4">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  {index < events.length - 1 && (
                    <div className="absolute top-3 left-1.5 w-0.5 h-full -translate-x-1/2 bg-gray-200" />
                  )}
                </div>
                <div className="pb-4">
                  <p className="text-gray-900 font-medium capitalize">
                    {event.status.replace('_', ' ')}
                  </p>
                  <p className="text-sm text-gray-500">{formatTime(event.created_at)}</p>
                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
