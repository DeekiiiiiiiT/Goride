import { useMemo, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ReorderSheet } from '@/components/orders/ReorderSheet';
import { PROFILE_HEADER_AVATAR } from '@/lib/accountContent';
import { buildReorderCartItems, getOrderById, ISLAND_GRILL_ORDER_DETAIL } from '@/lib/ordersContent';
import { formatJmd } from '@/lib/restaurantContent';
import { useCart } from '@/hooks/useCart';

type Props = {
  orderId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function OrderDetailsPage({ orderId, onNavigate }: Props) {
  const [reorderOpen, setReorderOpen] = useState(false);
  const { addItem } = useCart();

  const order = useMemo(() => getOrderById(orderId) ?? ISLAND_GRILL_ORDER_DETAIL, [orderId]);

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

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-32">
      <header className="w-full top-0 sticky bg-surface shadow-sm z-50">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto">
          <button
            type="button"
            aria-label="Back"
            onClick={() => onNavigate('orders')}
            className="flex items-center justify-center p-2 rounded-full hover:bg-surface-container-high transition-colors"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold">Order Details</h1>
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high">
            <img src={PROFILE_HEADER_AVATAR} alt="Profile" className="w-full h-full object-cover" />
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 pt-6 flex flex-col gap-6">
        <section className="bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-6 flex items-center gap-4 border-b border-surface-container-high">
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-surface-container-low shadow-sm shrink-0">
              <img src={order.merchantLogo} alt={order.merchantName} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-headline-sm font-bold">{order.merchantName}</h2>
              <p className="text-body-sm text-on-surface-variant flex items-center gap-1 mt-1">
                <MaterialIcon name="check_circle" className="text-[16px] text-primary" filled />
                {order.deliveredLabel ?? 'Delivered'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('restaurant', { merchantId: order.merchantId })}
              className="p-2 rounded-full hover:bg-surface-container-high text-primary shrink-0"
            >
              <MaterialIcon name="chevron_right" />
            </button>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-headline-sm font-bold mb-4">Items</h3>
          <ul className="flex flex-col gap-4">
            {order.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className={`flex justify-between items-start ${index < order.items.length - 1 ? 'pb-4 border-b border-surface-container-high' : ''}`}
              >
                <div className="flex gap-3">
                  <span className="text-body-md font-semibold bg-surface-container py-1 px-2 rounded-md h-fit">
                    {item.quantity}x
                  </span>
                  <div>
                    <p className="text-body-md font-medium">{item.name}</p>
                    {item.note && <p className="text-body-sm text-on-surface-variant mt-1">{item.note}</p>}
                  </div>
                </div>
                <span className="text-body-md font-medium whitespace-nowrap">{formatJmd(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-6">
          <h3 className="text-headline-sm font-bold mb-4">Summary</h3>
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
            <div className="flex justify-between text-headline-sm font-bold text-on-surface mt-2 pt-2 border-t border-surface-container-high">
              <span>Total</span>
              <span>{formatJmd(order.total)}</span>
            </div>
          </div>

          {order.paymentMethod && (
            <div className="mt-6 pt-6 border-t border-surface-container-high">
              <h4 className="text-label-md font-semibold text-on-surface-variant mb-2 uppercase">Payment Method</h4>
              <div className="flex items-center gap-3">
                <div className="w-10 h-6 bg-surface-container-high rounded flex items-center justify-center">
                  <MaterialIcon name="credit_card" className="text-[16px] text-on-surface-variant" />
                </div>
                <span className="text-body-md">{order.paymentMethod}</span>
              </div>
            </div>
          )}

          {order.deliveryAddress && (
            <div className="mt-6 pt-6 border-t border-surface-container-high">
              <h4 className="text-label-md font-semibold text-on-surface-variant mb-2 uppercase">Delivery Address</h4>
              <div className="flex items-center gap-3">
                <MaterialIcon name="location_on" className="text-on-surface-variant" />
                <span className="text-body-md">{order.deliveryAddress}</span>
              </div>
            </div>
          )}

          <button type="button" className="w-full mt-6 py-3 flex items-center justify-center gap-2 text-primary font-semibold text-label-md hover:bg-surface-container transition-colors rounded-lg">
            <MaterialIcon name="download" className="text-[20px]" />
            Download Receipt
          </button>
        </section>

        <section className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => setReorderOpen(true)}
            className="w-full bg-primary text-on-primary font-semibold text-label-md py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
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
                deliveredAt: order.deliveredLabel?.split(' at ').pop() ?? '12:45 PM',
              })
            }
            className="w-full bg-transparent border border-primary text-primary font-semibold text-label-md py-4 rounded-lg hover:bg-surface-container-low active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <MaterialIcon name="star" />
            Rate Order
          </button>
          <button
            type="button"
            className="w-full bg-transparent text-on-surface-variant font-semibold text-label-md py-3 hover:text-primary transition-colors flex items-center justify-center gap-2"
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
          onNavigate('restaurant', { merchantId: 'island-grill' });
        }}
      />
    </div>
  );
}
