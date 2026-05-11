import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { 
  ArrowLeft, Check, Clock, MapPin, Phone, ChefHat, Bike, Package,
  RefreshCw, MessageCircle, HelpCircle, Star, X
} from 'lucide-react';
import { toast } from 'sonner';
import { useCart } from '../hooks/useCart';

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
    item_id: string;
    name: string;
    quantity: number;
    price: number;
    options?: any[];
  }>;
  merchant: {
    id: string;
    name: string;
    logo_url: string;
    phone: string;
    address: string;
  };
  courier?: {
    id: string;
    name: string;
    phone: string;
    vehicle_type: string;
    vehicle_plate: string;
    rating: number;
  };
}

interface OrderEvent {
  id: string;
  status: string;
  notes: string;
  created_at: string;
  actor_type: string;
}

const STATUS_STEPS = [
  { key: 'placed', label: 'Order Placed', icon: Package, description: 'Your order has been received' },
  { key: 'accepted', label: 'Confirmed', icon: Check, description: 'Restaurant is preparing your order' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, description: 'Your food is being prepared' },
  { key: 'ready', label: 'Ready', icon: Package, description: 'Order is ready for pickup' },
  { key: 'picked_up', label: 'On the Way', icon: Bike, description: 'Courier is delivering your order' },
  { key: 'delivered', label: 'Delivered', icon: MapPin, description: 'Enjoy your meal!' },
];

export default function OrderTrackingPage({ orderId, onNavigate }: OrderTrackingPageProps) {
  const { addItem, clearCart } = useCart();
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [rating, setRating] = useState(0);

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
    refetchInterval: 15000,
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
  const currentStep = STATUS_STEPS[currentStatusIndex];

  const formatTime = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const handleReorder = () => {
    if (!order) return;
    
    clearCart();
    
    order.items.forEach(item => {
      addItem({
        itemId: item.item_id,
        merchantId: order.merchant.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        options: item.options,
      }, order.merchant.name);
    });

    toast.success('Items added to cart!');
    onNavigate('cart');
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
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <button
        onClick={() => onNavigate('orders')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to orders</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              {order.merchant.logo_url ? (
                <img
                  src={order.merchant.logo_url}
                  alt=""
                  className="w-14 h-14 rounded-xl object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <span className="text-emerald-600 text-xl font-bold">
                    {order.merchant.name.charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-gray-900">{order.merchant.name}</h1>
                <p className="text-gray-500">Order #{order.order_number}</p>
              </div>
            </div>
            <button
              onClick={() => setShowHelpModal(true)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
            >
              <HelpCircle className="w-6 h-6" />
            </button>
          </div>

          {!isCancelled && currentStep && (
            <div className={`rounded-xl p-4 ${isCompleted ? 'bg-emerald-50' : 'bg-amber-50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                }`}>
                  <currentStep.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <p className={`font-semibold ${isCompleted ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {currentStep.label}
                  </p>
                  <p className={`text-sm ${isCompleted ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {currentStep.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {!isCancelled && !isCompleted && (
          <div className="px-6 pb-6">
            <div className="flex items-center justify-between py-4">
              {STATUS_STEPS.map((step, index) => {
                const isActive = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;

                return (
                  <React.Fragment key={step.key}>
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          isActive
                            ? 'bg-emerald-500 text-white'
                            : 'bg-gray-100 text-gray-400'
                        } ${isCurrent ? 'ring-4 ring-emerald-100 scale-110' : ''}`}
                      >
                        {isActive && index < currentStatusIndex ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <step.icon className="w-4 h-4" />
                        )}
                      </div>
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-1 mx-1 rounded-full ${
                          index < currentStatusIndex ? 'bg-emerald-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {order.estimated_delivery_at && (
              <div className="flex items-center justify-center gap-2 text-gray-600 mt-2">
                <Clock className="w-4 h-4" />
                <span className="text-sm">
                  Estimated delivery: <strong>{formatTime(order.estimated_delivery_at)}</strong>
                </span>
              </div>
            )}
          </div>
        )}

        {isCancelled && (
          <div className="px-6 pb-6">
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-red-800 font-semibold">Order Cancelled</p>
              <p className="text-red-600 text-sm mt-1">
                This order was cancelled. Contact support if you need assistance.
              </p>
            </div>
          </div>
        )}
      </div>

      {order.courier && order.status === 'picked_up' && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Your Courier</h2>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <Bike className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{order.courier.name}</p>
                <p className="text-sm text-gray-500">
                  {order.courier.vehicle_type} • {order.courier.vehicle_plate}
                </p>
                {order.courier.rating && (
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                    <span className="text-sm text-gray-600">{order.courier.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>
            {order.courier.phone && (
              <a
                href={`tel:${order.courier.phone}`}
                className="p-3 bg-emerald-500 text-white rounded-full hover:bg-emerald-600"
              >
                <Phone className="w-5 h-5" />
              </a>
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Delivery Details</h2>
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-emerald-500 mt-0.5" />
          <div>
            <p className="text-gray-900">{order.delivery_address}</p>
            {order.delivery_instructions && (
              <p className="text-gray-500 text-sm mt-1">{order.delivery_instructions}</p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <a
            href={`tel:${order.merchant.phone}`}
            className="flex items-center gap-3 text-emerald-600 hover:text-emerald-700"
          >
            <Phone className="w-5 h-5" />
            <span>Contact restaurant</span>
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Order Summary</h2>
        <div className="space-y-3">
          {order.items.map((item, index) => (
            <div key={index} className="flex justify-between">
              <div>
                <span className="text-gray-900">
                  {item.quantity}x {item.name}
                </span>
                {item.options && item.options.length > 0 && (
                  <p className="text-xs text-gray-500">
                    {item.options.map((o: any) => o.selections?.map((s: any) => s.name).join(', ')).join(', ')}
                  </p>
                )}
              </div>
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
            <span>${((order.platform_fee || 0) + (order.tax || 0)).toFixed(2)}</span>
          </div>
          {order.tip > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tip</span>
              <span>${order.tip.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-semibold pt-2 border-t">
            <span>Total</span>
            <span className="text-emerald-600">${order.total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {events.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-4">Order Timeline</h2>
          <div className="space-y-4">
            {events.map((event, index) => (
              <div key={event.id} className="flex gap-4">
                <div className="relative">
                  <div className={`w-3 h-3 rounded-full ${
                    index === 0 ? 'bg-emerald-500' : 'bg-gray-300'
                  }`} />
                  {index < events.length - 1 && (
                    <div className="absolute top-3 left-1.5 w-0.5 h-full -translate-x-1/2 bg-gray-200" />
                  )}
                </div>
                <div className="pb-4 -mt-1">
                  <p className="text-gray-900 font-medium capitalize">
                    {event.status.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatTime(event.created_at)} • {formatDate(event.created_at)}
                  </p>
                  {event.notes && (
                    <p className="text-sm text-gray-600 mt-1">{event.notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          <button
            onClick={handleReorder}
            className="flex-1 py-3 bg-emerald-500 text-white rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-emerald-600"
          >
            <RefreshCw className="w-5 h-5" />
            Reorder
          </button>
          {isCompleted && (
            <button
              onClick={() => setShowRatingModal(true)}
              className="px-6 py-3 border border-gray-300 rounded-xl font-semibold flex items-center gap-2 hover:bg-gray-50"
            >
              <Star className="w-5 h-5" />
              Rate
            </button>
          )}
        </div>
      </div>

      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Need Help?</h2>
              <button onClick={() => setShowHelpModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <a
                href={`tel:${order.merchant.phone}`}
                className="flex items-center gap-3 p-4 border rounded-xl hover:bg-gray-50"
              >
                <Phone className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="font-medium">Call Restaurant</p>
                  <p className="text-sm text-gray-500">Questions about your order</p>
                </div>
              </a>
              {order.courier?.phone && (
                <a
                  href={`tel:${order.courier.phone}`}
                  className="flex items-center gap-3 p-4 border rounded-xl hover:bg-gray-50"
                >
                  <Bike className="w-5 h-5 text-emerald-500" />
                  <div>
                    <p className="font-medium">Call Courier</p>
                    <p className="text-sm text-gray-500">Delivery questions</p>
                  </div>
                </a>
              )}
              <button
                onClick={() => {
                  toast.info('Support chat coming soon');
                  setShowHelpModal(false);
                }}
                className="flex items-center gap-3 p-4 border rounded-xl hover:bg-gray-50 w-full"
              >
                <MessageCircle className="w-5 h-5 text-emerald-500" />
                <div className="text-left">
                  <p className="font-medium">Chat with Support</p>
                  <p className="text-sm text-gray-500">Get help from our team</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {showRatingModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Rate Your Order</h2>
              <button onClick={() => setShowRatingModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-600 mb-4">How was your experience with {order.merchant.name}?</p>
            <div className="flex justify-center gap-2 mb-6">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1"
                >
                  <Star
                    className={`w-10 h-10 transition-colors ${
                      star <= rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                toast.success('Thanks for your feedback!');
                setShowRatingModal(false);
              }}
              disabled={rating === 0}
              className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold disabled:opacity-50"
            >
              Submit Rating
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
