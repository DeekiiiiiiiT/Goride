import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { ReorderSheet } from '@/components/orders/ReorderSheet';
import { useCart } from '@/hooks/useCart';
import {
  buildReorderFromOrder,
  type OrderHistoryEntry,
} from '@/lib/ordersContent';
import { formatJmd } from '@/lib/restaurantContent';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type ApiOrder = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
  merchant_id?: string;
  merchant: { id: string; name: string; logo_url: string };
  items: Array<{
    name: string;
    quantity: number;
    price?: number;
    menuItemId?: string;
    id?: string;
    item_id?: string;
    image?: string;
    image_url?: string;
  }>;
};

function mapApiOrder(order: ApiOrder): OrderHistoryEntry {
  return {
    id: order.id,
    orderNumber: order.order_number,
    merchantId: order.merchant?.id ?? order.merchant_id ?? '',
    merchantName: order.merchant?.name ?? 'Restaurant',
    merchantLogo: order.merchant?.logo_url ?? '',
    status: ['completed', 'cancelled', 'delivered'].includes(order.status)
      ? order.status === 'cancelled'
        ? 'cancelled'
        : 'delivered'
      : 'active',
    items: order.items.map((i) => ({
      quantity: i.quantity,
      name: i.name,
      price: i.price ?? 0,
      menuItemId: i.menuItemId ?? i.id ?? i.item_id,
    })),
    itemSummary: order.items.map((i) => `${i.quantity}x ${i.name}`).join(', '),
    total: order.total,
    placedAt: order.created_at,
    deliveredLabel: new Date(order.created_at).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

export function QuickReorderSection({ onNavigate }: Props) {
  const [reorderOpen, setReorderOpen] = useState(false);
  const [selected, setSelected] = useState<OrderHistoryEntry | null>(null);
  const { addItem } = useCart();

  const { data } = useQuery({
    queryKey: ['customer-orders', 'quick-reorder'],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return { orders: [] as ApiOrder[] };
      const res = await fetch(`${API_ENDPOINTS.delivery}/customer/orders`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch orders');
      return res.json() as Promise<{ orders: ApiOrder[] }>;
    },
    retry: false,
  });

  const orders = useMemo(() => {
    return (data?.orders ?? [])
      .map(mapApiOrder)
      .filter((o) => o.status === 'delivered')
      .slice(0, 2);
  }, [data]);

  const handleReorderAdd = useCallback(() => {
    if (!selected) return;
    const rawItems = (data?.orders ?? []).find((o) => o.id === selected.id)?.items as
      | Array<Record<string, unknown>>
      | undefined;
    const lines = buildReorderFromOrder(selected, rawItems);
    if (!lines.length) {
      toast.error('Cannot reorder — menu items are unavailable');
      return;
    }
    lines.forEach((line, index) => {
      addItem(
        {
          itemId: line.itemId,
          merchantId: selected.merchantId,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
          imageUrl: line.imageUrl,
        },
        selected.merchantName,
        { replace: index === 0 },
      );
    });
    toast.success('Items added to cart');
    setReorderOpen(false);
    onNavigate('cart');
  }, [addItem, data?.orders, onNavigate, selected]);

  if (orders.length === 0) return null;

  return (
    <section className="max-w-[1200px] mx-auto">
      <div className="px-4 flex justify-between items-end mb-3">
        <h2 className="text-xl font-bold text-on-surface">Quick Reorder</h2>
      </div>
      <div className="flex overflow-x-auto px-4 gap-4 pb-2 no-scrollbar">
        {orders.map((order) => (
          <div
            key={order.id}
            className="min-w-[280px] shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-4 border border-surface-container-high"
          >
            <div className="flex items-center gap-3 mb-3">
              {order.merchantLogo ? (
                <img src={order.merchantLogo} alt="" className="w-12 h-12 rounded-lg object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-surface-variant" />
              )}
              <div className="min-w-0">
                <h3 className="text-label-md font-semibold truncate">{order.merchantName}</h3>
                <p className="text-body-sm text-on-surface-variant truncate">{order.itemSummary}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-headline-sm font-semibold">{formatJmd(order.total)}</span>
              <button
                type="button"
                onClick={() => {
                  setSelected(order);
                  setReorderOpen(true);
                }}
                className="bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md font-semibold active:scale-95 transition-transform"
              >
                Reorder
              </button>
            </div>
          </div>
        ))}
      </div>

      <ReorderSheet
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        onAddToCart={handleReorderAdd}
        onViewMenu={() => {
          setReorderOpen(false);
          if (selected?.merchantId) {
            onNavigate('restaurant', { merchantId: selected.merchantId });
          }
        }}
      />
    </section>
  );
}
