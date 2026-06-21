import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { ReorderSheet } from '@/components/orders/ReorderSheet';
import { toast } from '@/lib/toast';
import { useCart } from '@/hooks/useCart';
import {
  buildReorderCartItems,
  groupOrdersByDate,
  MOCK_ORDERS,
  type OrderHistoryEntry,
} from '@/lib/ordersContent';
import { formatJmd } from '@/lib/restaurantContent';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type ApiOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  merchant: { id: string; name: string; logo_url: string };
  items: Array<{ name: string; quantity: number }>;
};

function mapApiOrder(order: ApiOrder): OrderHistoryEntry {
  const active = !['completed', 'cancelled', 'delivered'].includes(order.status);
  return {
    id: order.id,
    orderNumber: order.order_number,
    merchantId: order.merchant.id,
    merchantName: order.merchant.name,
    merchantLogo: order.merchant.logo_url,
    status: order.status === 'cancelled' ? 'cancelled' : active ? 'active' : 'delivered',
    items: order.items.map(i => ({ quantity: i.quantity, name: i.name, price: 0 })),
    itemSummary: order.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
    total: order.total,
    placedAt: order.created_at,
    deliveredLabel: new Date(order.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
    eta: active ? 'Arriving soon' : undefined,
    progress: active ? 66 : undefined,
  };
}

export default function OrdersPage({ onNavigate }: Props) {
  const { itemCount, addItem } = useCart();
  const [reorderOpen, setReorderOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customer-orders'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json();
    },
    retry: false,
  });

  const orders: OrderHistoryEntry[] = useMemo(() => {
    if (data?.orders?.length) {
      return (data.orders as ApiOrder[]).map(mapApiOrder);
    }
    return MOCK_ORDERS;
  }, [data]);

  const activeOrders = orders.filter(o => o.status === 'active');
  const pastOrders = orders.filter(o => o.status === 'delivered');
  const pastGroups = groupOrdersByDate(pastOrders);

  const handleReorderAdd = () => {
    buildReorderCartItems().forEach(({ item, quantity, merchantName }, index) => {
      addItem(
        {
          itemId: item.id,
          merchantId: 'island-grill',
          name: item.name,
          price: item.price,
          quantity,
          imageUrl: item.image,
        },
        merchantName,
        { replace: index === 0 },
      );
    });
    setReorderOpen(false);
    onNavigate('cart');
  };

  const handleRefresh = useCallback(async () => {
    await refetch();
    toast.success('Orders updated');
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh} className="max-w-[1200px] mx-auto px-4 py-6 pb-28">
      <h1 className="text-headline-lg-mobile font-bold mb-6">Your Orders</h1>

      {itemCount > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('cart')}
          className="w-full mb-6 p-4 bg-primary-container text-on-primary rounded-xl flex items-center justify-between font-semibold text-label-md"
        >
          <span>View cart ({itemCount} items)</span>
          <MaterialIcon name="chevron_right" />
        </button>
      )}

      {activeOrders.length > 0 && (
        <section className="mb-8">
          <h2 className="text-headline-sm font-semibold text-on-surface-variant mb-4">Active orders</h2>
          {activeOrders.map(order => (
            <div
              key={order.id}
              className="bg-surface-container-lowest rounded-xl shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4 mb-4"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 rounded-lg bg-surface-variant overflow-hidden shrink-0">
                    <img src={order.merchantLogo} alt={order.merchantName} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h4 className="text-label-md font-semibold">{order.merchantName}</h4>
                    <p className="text-body-sm text-on-surface-variant flex items-center gap-1">
                      <MaterialIcon name="schedule" className="text-[14px]" />
                      {order.eta ?? 'Arriving in 15-25 min'}
                    </p>
                  </div>
                </div>
              </div>
              <p className="text-body-sm text-on-surface-variant truncate mb-4">{order.itemSummary}</p>
              <div className="h-2 w-full bg-surface-variant rounded-full overflow-hidden mb-4">
                <div
                  className="h-full bg-gradient-to-r from-primary to-primary-container rounded-full"
                  style={{ width: `${order.progress ?? 66}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => onNavigate('tracking', { orderId: order.orderNumber })}
                className="w-full bg-primary text-on-primary font-semibold text-label-md py-3 rounded-lg shadow-sm hover:opacity-90 transition-opacity"
              >
                Track Order
              </button>
            </div>
          ))}
        </section>
      )}

      {pastOrders.length > 0 && (
        <section>
          <h2 className="text-headline-sm font-semibold text-on-surface-variant mb-4">Past orders</h2>
          {pastGroups.map(group => (
            <div key={group.label} className="mb-6">
              <h3 className="text-label-sm text-outline-variant uppercase tracking-wider mb-2">{group.label}</h3>
              {group.orders.map(order => (
                <div
                  key={order.id}
                  className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-4 mb-4"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-lg bg-surface-variant overflow-hidden shrink-0">
                        <img src={order.merchantLogo} alt={order.merchantName} className="w-full h-full object-cover" />
                      </div>
                      <div>
                        <h5 className="text-label-md font-semibold">{order.merchantName}</h5>
                        <p className="text-body-sm text-on-surface-variant">{order.deliveredLabel}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-label-md font-semibold">{formatJmd(order.total)}</p>
                      <p className="text-label-sm text-primary flex items-center justify-end gap-1">
                        Delivered
                        <MaterialIcon name="check_circle" className="text-[12px]" filled />
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-surface-variant pt-2 pb-4">
                    <p className="text-body-sm text-on-surface-variant line-clamp-2">{order.itemSummary}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setReorderOpen(true)}
                      className="flex-1 bg-transparent border border-primary text-primary font-semibold text-label-md py-2 rounded-lg hover:bg-surface-variant transition-colors"
                    >
                      Reorder
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('order-details', { orderId: order.id })}
                      className="flex-1 bg-surface-variant text-on-surface-variant font-semibold text-label-md py-2 rounded-lg hover:bg-outline-variant/20 transition-colors"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {activeOrders.length === 0 && pastOrders.length === 0 && (
        <EmptyState
          icon="receipt_long"
          title="No orders yet"
          description="Your order history will appear here once you place your first order."
          actionLabel="Browse restaurants"
          onAction={() => onNavigate('home')}
        />
      )}

      <ReorderSheet
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        onAddToCart={handleReorderAdd}
        onViewMenu={() => {
          setReorderOpen(false);
          onNavigate('restaurant', { merchantId: 'island-grill' });
        }}
      />
    </PullToRefresh>
  );
}
