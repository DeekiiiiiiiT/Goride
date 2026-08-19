import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ReorderSheet } from '@/components/orders/ReorderSheet';
import { PaymentPendingBanner } from '@/components/orders/PaymentPendingBanner';
import { NewCartModal } from '@/components/restaurant/NewCartModal';
import { PROFILE_HEADER_AVATAR } from '@/lib/accountContent';
import {
  buildReorderFromOrder,
  shareOrderReceipt,
  getOrderById,
  ISLAND_GRILL_ORDER_DETAIL,
  mapApiOrderToDetails,
  type OrderHistoryEntry,
} from '@/lib/ordersContent';
import { allowMocks } from '@/lib/mocksGate';
import { formatJmd } from '@/lib/restaurantContent';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { useCart } from '@/hooks/useCart';

type Props = {
  orderId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderDetailsPage({ orderId, onNavigate }: Props) {
  const [reorderOpen, setReorderOpen] = useState(false);
  const [cartConflictOpen, setCartConflictOpen] = useState(false);
  const { addItem, clearCart, merchantName } = useCart();
  const mocksOk = allowMocks();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (session) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch(`${API_ENDPOINTS.delivery}/orders/${orderId}`, { headers });
      if (!res.ok) throw new Error('Failed to fetch order');
      return res.json();
    },
    enabled: Boolean(orderId),
    retry: false,
  });

  const order: OrderHistoryEntry | null = useMemo(() => {
    if (data?.order) {
      return mapApiOrderToDetails(data.order as Record<string, unknown>);
    }
    if (mocksOk && (error || data !== undefined)) {
      return getOrderById(orderId) ?? ISLAND_GRILL_ORDER_DETAIL;
    }
    return null;
  }, [data, orderId, mocksOk, error]);

  const rawApiItems = (data?.order as { items?: Array<Record<string, unknown>> } | undefined)?.items;

  const addReorderLines = (replace = false) => {
    if (!order) return;
    const lines = buildReorderFromOrder(order, rawApiItems);
    if (lines.length === 0) {
      setReorderOpen(false);
      onNavigate('restaurant', { merchantId: order.merchantId });
      return;
    }
    lines.forEach((line, index) => {
      addItem(
        {
          itemId: line.itemId,
          merchantId: order.merchantId,
          name: line.name,
          price: line.price,
          quantity: line.quantity,
          imageUrl: line.imageUrl,
        },
        order.merchantName,
        { replace: replace && index === 0 },
      );
    });
    setReorderOpen(false);
    setCartConflictOpen(false);
    onNavigate('cart');
  };

  const handleReorderAdd = () => {
    if (!order) return;
    const lines = buildReorderFromOrder(order, rawApiItems);
    if (lines.length === 0) {
      setReorderOpen(false);
      onNavigate('restaurant', { merchantId: order.merchantId });
      return;
    }
    const first = lines[0];
    const result = addItem(
      {
        itemId: first.itemId,
        merchantId: order.merchantId,
        name: first.name,
        price: first.price,
        quantity: first.quantity,
        imageUrl: first.imageUrl,
      },
      order.merchantName,
    );
    if (result === 'conflict') {
      setReorderOpen(false);
      setCartConflictOpen(true);
      return;
    }
    if (lines.length > 1) {
      lines.slice(1).forEach((line) => {
        addItem(
          {
            itemId: line.itemId,
            merchantId: order.merchantId,
            name: line.name,
            price: line.price,
            quantity: line.quantity,
            imageUrl: line.imageUrl,
          },
          order.merchantName,
        );
      });
    }
    setReorderOpen(false);
    onNavigate('cart');
  };

  if (!orderId) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <p className="text-on-surface-variant">No order selected</p>
        <button type="button" onClick={() => onNavigate('orders')} className="font-semibold text-primary">
          View orders
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-b-2 border-primary-container" />
      </div>
    );
  }

  if (!order || (error && !mocksOk)) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4">
        <MaterialIcon name="error_outline" className="text-4xl text-on-surface-variant" />
        <p className="text-center text-on-surface-variant">Couldn&apos;t load this order.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-on-primary"
        >
          Retry
        </button>
        <button type="button" onClick={() => onNavigate('orders')} className="font-semibold text-primary">
          Back to orders
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-surface pb-32 text-on-surface">
      <NewCartModal
        open={cartConflictOpen}
        currentRestaurant={merchantName || order?.merchantName || 'Restaurant'}
        onConfirm={() => {
          clearCart();
          addReorderLines(true);
        }}
        onCancel={() => setCartConflictOpen(false)}
      />
      <header className="sticky top-0 z-50 w-full bg-surface shadow-sm safe-t">
        <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between px-4 py-2 min-h-14">
          <button
            type="button"
            aria-label="Back"
            onClick={() => onNavigate('orders')}
            className="flex items-center justify-center rounded-full p-2 transition-colors hover:bg-surface-container-high"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold">Order Details</h1>
          <div className="h-10 w-10 overflow-hidden rounded-full bg-surface-container-high">
            <img src={PROFILE_HEADER_AVATAR} alt="Profile" className="h-full w-full object-cover" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1200px] flex-col gap-6 px-4 pt-6">
        <section className="overflow-hidden rounded-[24px] bg-surface-container-lowest shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex items-center gap-4 border-b border-surface-container-high p-6">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-container-low shadow-sm">
              {order.merchantLogo ? (
                <img src={order.merchantLogo} alt={order.merchantName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <MaterialIcon name="storefront" className="text-2xl text-outline" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-headline-sm font-bold">{order.merchantName}</h2>
              <p className="mt-1 flex items-center gap-1 text-body-sm text-on-surface-variant">
                <MaterialIcon name="check_circle" className="text-[16px] text-primary" filled />
                {order.deliveredLabel ?? (order.status === 'active' ? 'In progress' : 'Delivered')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('restaurant', { merchantId: order.merchantId })}
              className="shrink-0 rounded-full p-2 text-primary hover:bg-surface-container-high"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
        </section>

        <section className="rounded-[24px] bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="mb-4 text-headline-sm font-bold">Items</h3>
          <ul className="flex flex-col gap-4">
            {order.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className={`flex items-start justify-between ${index < order.items.length - 1 ? 'border-b border-surface-container-high pb-4' : ''}`}
              >
                <div className="flex gap-3">
                  <span className="h-fit rounded-md bg-surface-container px-2 py-1 text-body-md font-semibold">
                    {item.quantity}x
                  </span>
                  <div>
                    <p className="text-body-md font-medium">{item.name}</p>
                    {item.note && <p className="mt-1 text-body-sm text-on-surface-variant">{item.note}</p>}
                  </div>
                </div>
                <span className="text-body-md font-medium whitespace-nowrap">
                  {formatJmd(item.price * item.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[24px] bg-surface-container-lowest p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h3 className="mb-4 text-headline-sm font-bold">Summary</h3>
          <div className="flex flex-col gap-2 text-body-sm text-on-surface-variant">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatJmd(order.subtotal ?? order.total)}</span>
            </div>
            {order.deliveryFee != null && (
              <div className="flex justify-between">
                <span>Delivery</span>
                <span>{formatJmd(order.deliveryFee)}</span>
              </div>
            )}
            {order.serviceFee != null && (
              <div className="flex justify-between">
                <span>Service</span>
                <span>{formatJmd(order.serviceFee)}</span>
              </div>
            )}
            {order.tax != null && (
              <div className="flex justify-between">
                <span>Tax</span>
                <span>{formatJmd(order.tax)}</span>
              </div>
            )}
            {order.tip != null && (
              <div className="flex justify-between">
                <span>Tip</span>
                <span>{formatJmd(order.tip)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-surface-container-high pt-2 text-headline-sm font-bold text-on-surface">
              <span>Total</span>
              <span>{formatJmd(order.total)}</span>
            </div>
          </div>

          {order.status === 'active' && (
            <PaymentPendingBanner
              className="mt-6 border-t border-surface-container-high pt-6"
              orderId={order.id}
              paymentStatus={order.paymentStatus}
              paymentMethod={order.paymentMethod}
              onNavigate={(page) => onNavigate(page)}
            />
          )}

          {order.paymentMethod && (
            <div className="mt-6 border-t border-surface-container-high pt-6">
              <h4 className="mb-2 text-label-md font-semibold text-on-surface-variant uppercase">Payment Method</h4>
              <div className="flex items-center gap-3">
                <div className="flex h-6 w-10 items-center justify-center rounded bg-surface-container-high">
                  <MaterialIcon name="credit_card" className="text-[16px] text-on-surface-variant" />
                </div>
                <span className="text-body-md">{order.paymentMethod}</span>
              </div>
            </div>
          )}

          {order.deliveryAddress && (
            <div className="mt-6 border-t border-surface-container-high pt-6">
              <h4 className="mb-2 text-label-md font-semibold text-on-surface-variant uppercase">Delivery Address</h4>
              <div className="flex items-center gap-3">
                <MaterialIcon name="location_on" className="text-on-surface-variant" />
                <span className="text-body-md">{order.deliveryAddress}</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void shareOrderReceipt(order)
                .then((result) => {
                  if (result === 'downloaded') toast.success('Receipt downloaded');
                  if (result === 'copied') toast.success('Receipt copied');
                })
                .catch(() => toast.error('Could not share this receipt'));
            }}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-label-md font-semibold text-primary transition-colors hover:bg-surface-container"
          >
            <MaterialIcon name="download" className="text-[20px]" />
            Download Receipt
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setReorderOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 text-label-md font-semibold text-on-primary shadow-sm transition-all hover:opacity-90 active:scale-95"
          >
            <MaterialIcon name="replay" />
            Reorder
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate('rate-order', {
                orderId: order.id,
                merchantName: order.merchantName,
                deliveredAt: order.deliveredLabel?.split(' at ').pop() ?? '',
              })
            }
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary bg-transparent py-4 text-label-md font-semibold text-primary transition-all hover:bg-surface-container-low active:scale-95"
          >
            <MaterialIcon name="star" />
            Rate Order
          </button>
          <button
            type="button"
            onClick={() =>
              onNavigate('report-issue', {
                orderId: order.id,
                returnTo: 'order-details',
                issueType: 'other',
              })
            }
            className="flex w-full items-center justify-center gap-2 bg-transparent py-3 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <MaterialIcon name="help" className="text-[20px]" />
            Get Help
          </button>
        </section>
      </main>

      <ReorderSheet
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        onAddToCart={handleReorderAdd}
        onViewMenu={() => {
          setReorderOpen(false);
          onNavigate('restaurant', { merchantId: order.merchantId });
        }}
        merchantName={order.merchantName}
        merchantLogo={order.merchantLogo}
        items={order.items}
        estimatedTotal={order.subtotal ?? order.total}
      />
    </div>
  );
}
