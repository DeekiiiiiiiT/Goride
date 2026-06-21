import { useState } from 'react';
import { ReorderSheet } from '@/components/orders/ReorderSheet';
import { useCart } from '@/hooks/useCart';
import { buildReorderCartItems, MOCK_ORDERS } from '@/lib/ordersContent';
import { formatJmd } from '@/lib/restaurantContent';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

const QUICK_REORDER_ORDERS = MOCK_ORDERS.filter((o) => o.status === 'delivered').slice(0, 2);

export function QuickReorderSection({ onNavigate }: Props) {
  const [reorderOpen, setReorderOpen] = useState(false);
  const { addItem } = useCart();

  if (QUICK_REORDER_ORDERS.length === 0) return null;

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
    toast.success('Items added to cart');
    setReorderOpen(false);
    onNavigate('cart');
  };

  return (
    <section className="max-w-[1200px] mx-auto">
      <div className="px-4 flex justify-between items-end mb-3">
        <h2 className="text-xl font-bold text-on-surface">Quick Reorder</h2>
      </div>
      <div className="flex overflow-x-auto px-4 gap-4 pb-2 no-scrollbar">
        {QUICK_REORDER_ORDERS.map((order) => (
          <div
            key={order.id}
            className="min-w-[280px] shrink-0 bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] p-4 border border-surface-container-high"
          >
            <div className="flex items-center gap-3 mb-3">
              <img src={order.merchantLogo} alt="" className="w-12 h-12 rounded-lg object-cover" />
              <div className="min-w-0">
                <h3 className="text-label-md font-semibold truncate">{order.merchantName}</h3>
                <p className="text-body-sm text-on-surface-variant truncate">{order.itemSummary}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-headline-sm font-semibold">{formatJmd(order.total)}</span>
              <button
                type="button"
                onClick={() => setReorderOpen(true)}
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
          onNavigate('restaurant', { merchantId: 'island-grill' });
        }}
      />
    </section>
  );
}
