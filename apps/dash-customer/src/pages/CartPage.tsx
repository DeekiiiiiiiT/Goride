import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryInstructionsSheet } from '@/components/cart/DeliveryInstructionsSheet';
import { ItemDetailSheet } from '@/components/restaurant/ItemDetailSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { PromoCodeInput } from '@/components/ui/PromoCodeInput';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useCart } from '@/hooks/useCart';
import { getSavedAddress } from '@/lib/addressStorage';
import { saveCheckoutPreferences } from '@/lib/checkoutStorage';
import { calculateOrderTotals, PROMO_CODES, type PromoCode } from '@/lib/orderPricing';
import { formatJmd, getRestaurantProfile } from '@/lib/restaurantContent';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
};

export default function CartPage({ onNavigate, session }: Props) {
  const { items, merchantName, merchantId, updateQuantity, removeItem, replaceItem, clearCart, subtotal } = useCart();
  const savedAddress = getSavedAddress();

  const [deliveryInstructions, setDeliveryInstructions] = useState(savedAddress?.instructions ?? 'Leave at door • Gate code: 1234');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<PromoCode | null>(PROMO_CODES.WELCOME);

  const editingCartItem = items.find((i) => i.id === editingCartItemId);
  const editingMenuItem = editingCartItem && merchantId
    ? getRestaurantProfile(merchantId).items.find((i) => i.id === editingCartItem.itemId) ?? null
    : null;

  const deliveryAddress = savedAddress
    ? `${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : '45 Constant Spring Rd, Apt 12B';

  useEffect(() => {
    if (savedAddress?.instructions) {
      setDeliveryInstructions(savedAddress.instructions);
    }
  }, [savedAddress?.instructions]);

  const applyPromoCode = () => {
    const code = promoCode.toUpperCase().trim();
    const promo = PROMO_CODES[code];
    if (!promo) {
      toast.error('Invalid promo code');
      return;
    }
    if (subtotal < promo.minOrder) {
      toast.error(`Minimum order of ${formatJmd(promo.minOrder)} required`);
      return;
    }
    setAppliedPromo(promo);
    toast.promoApplied(code);
  };

  const { discount, deliveryFee, serviceFee, tax, total } = calculateOrderTotals(subtotal, appliedPromo);

  const handleCheckout = () => {
    if (!session) {
      toast.error('Please sign in to checkout');
      onNavigate('login');
      return;
    }
    if (items.length === 0) {
      toast.error('Your cart is empty');
      return;
    }
    saveCheckoutPreferences({ appliedPromoCode: appliedPromo?.code ?? null });
    onNavigate('checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-surface pb-32">
        <EmptyState
          icon="shopping_bag"
          title="Your cart is empty"
          description="Browse restaurants and add items to get started"
          actionLabel="Browse Restaurants"
          onAction={() => onNavigate('home')}
        />
      </div>
    );
  }

  return (
    <div className="bg-background text-on-background antialiased pb-32 min-h-screen">
      <header className="bg-surface shadow-sm sticky top-0 z-50">
        <div className="flex justify-between items-center px-4 h-16 max-w-[1200px] mx-auto">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="text-on-surface-variant p-2 rounded-full"
          >
            <MaterialIcon name="close" />
          </button>
          <div className="text-center">
            <h1 className="text-headline-sm font-semibold text-on-surface">Your Cart</h1>
            <p className="text-body-sm text-on-surface-variant">{merchantName}</p>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto">
        <section className="p-4 bg-surface-container-lowest mb-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-start mb-4">
            <div className="flex items-start gap-4">
              <MaterialIcon name="location_on" className="text-primary mt-1" filled />
              <div>
                <h3 className="text-headline-sm font-semibold text-on-surface">Delivery Address</h3>
                <p className="text-body-md text-on-surface-variant mt-1">{deliveryAddress}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('saved-addresses', { returnTo: 'cart' })}
              className="text-label-md font-semibold text-primary"
            >
              Change
            </button>
          </div>
          <div className="h-px w-full bg-surface-variant my-4" />
          <div className="flex justify-between items-start">
            <div>
              <h4 className="text-label-sm font-medium text-on-surface-variant mb-1 uppercase tracking-wider">
                Delivery Instructions
              </h4>
              <p className="text-body-md text-on-surface">{deliveryInstructions}</p>
            </div>
            <button
              type="button"
              onClick={() => setInstructionsOpen(true)}
              className="text-label-md font-semibold text-primary"
            >
              Edit
            </button>
          </div>
        </section>

        <section className="p-4 bg-surface-container-lowest mb-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-headline-sm font-semibold text-on-surface mb-4">Order Items</h2>
          {items.map(item => {
            const customization = item.options?.find(o => o.name === 'Customizations')?.selections[0]?.name;
            return (
              <div key={item.id} className="flex items-start gap-4 py-4">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt={item.name} className="w-20 h-20 object-cover rounded-lg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="text-headline-sm font-semibold text-on-surface">{item.name}</h3>
                    <p className="text-headline-sm font-semibold text-on-surface shrink-0">
                      {formatJmd(item.price * item.quantity)}
                    </p>
                  </div>
                  {customization && (
                    <p className="text-body-sm text-on-surface-variant mt-1 mb-4">{customization}</p>
                  )}
                  <div className="flex justify-between items-center">
                    <QuantityStepper
                      value={item.quantity}
                      size="sm"
                      min={0}
                      onChange={(q) => updateQuantity(item.id, q)}
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingCartItemId(item.id)}
                        className="p-2 text-on-surface-variant"
                      >
                        <MaterialIcon name="edit" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="p-2 text-on-surface-variant hover:text-error"
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => merchantId && onNavigate('restaurant', { merchantId })}
            className="flex items-center gap-2 text-primary font-semibold text-label-md mt-4"
          >
            <MaterialIcon name="add_circle" />
            Add more items
          </button>
        </section>

        <section className="px-4 mb-6">
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] border border-surface-variant">
            <PromoCodeInput
              value={promoCode}
              onChange={setPromoCode}
              onApply={applyPromoCode}
              appliedLabel={
                appliedPromo
                  ? `${appliedPromo.code}${appliedPromo.type === 'free_delivery' ? ' — Free delivery' : ` — ${appliedPromo.value}% off`}`
                  : null
              }
            />
          </div>
        </section>

        <section className="px-4 mb-8">
          <h2 className="text-headline-sm font-semibold text-on-surface mb-4 px-1">Order Summary</h2>
          <div className="bg-surface-container-lowest p-4 rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col gap-2">
            <div className="flex justify-between text-body-md text-on-surface-variant">
              <span>Subtotal</span>
              <span>{formatJmd(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-body-md text-primary-container">
                <span>Discount</span>
                <span>-{formatJmd(discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-body-md text-primary-container">
              <span>Delivery</span>
              <span>{deliveryFee === 0 ? 'FREE' : formatJmd(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-body-md text-on-surface-variant">
              <span>Service Fee</span>
              <span>{formatJmd(serviceFee)}</span>
            </div>
            <div className="flex justify-between text-body-md text-on-surface-variant">
              <span>Tax</span>
              <span>{formatJmd(tax)}</span>
            </div>
            <div className="h-px w-full bg-surface-variant my-2" />
            <div className="flex justify-between text-headline-md font-semibold text-on-surface">
              <span>Total</span>
              <span>{formatJmd(total)}</span>
            </div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 w-full z-50 bg-surface shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] pb-safe pt-4 px-4 rounded-t-2xl">
        <button
          type="button"
          onClick={handleCheckout}
          className="w-full bg-primary text-on-primary rounded-lg py-4 px-6 flex justify-between items-center text-headline-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all mb-4"
        >
          <span>Go to Checkout</span>
          <span>{formatJmd(total)}</span>
        </button>
      </div>

      <DeliveryInstructionsSheet
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        value={deliveryInstructions}
        onSave={setDeliveryInstructions}
      />

      <ItemDetailSheet
        item={editingMenuItem}
        open={!!editingCartItemId && !!editingMenuItem}
        mode="edit"
        initialQuantity={editingCartItem?.quantity ?? 1}
        initialInstructions={
          editingCartItem?.options?.find((o) => o.name === 'Instructions')?.selections[0]?.name ?? ''
        }
        submitLabel="Update Item"
        onClose={() => setEditingCartItemId(null)}
        onAdd={(data) => {
          if (!editingCartItemId || !editingCartItem || !merchantId) return;
          const options =
            data.optionsLabel || data.instructions
              ? [
                  ...(data.optionsLabel
                    ? [{ name: 'Customizations', selections: [{ name: data.optionsLabel, priceAdjustment: 0 }] }]
                    : []),
                  ...(data.instructions
                    ? [{ name: 'Instructions', selections: [{ name: data.instructions, priceAdjustment: 0 }] }]
                    : []),
                ]
              : undefined;
          replaceItem(editingCartItemId, {
            itemId: editingCartItem.itemId,
            merchantId,
            name: editingCartItem.name,
            price: data.unitPrice,
            quantity: data.quantity,
            imageUrl: editingCartItem.imageUrl,
            options,
          });
          setEditingCartItemId(null);
          toast.success('Item updated');
        }}
      />
    </div>
  );
}
