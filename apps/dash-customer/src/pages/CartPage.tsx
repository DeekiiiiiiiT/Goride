import { useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DeliveryInstructionsSheet } from '@/components/cart/DeliveryInstructionsSheet';
import { ItemDetailSheet } from '@/components/restaurant/ItemDetailSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { useCart } from '@/hooks/useCart';
import { getSavedAddress } from '@/lib/addressStorage';
import {
  getAppliedPromo,
  getCheckoutPreferences,
  saveCheckoutPreferences,
} from '@/lib/checkoutStorage';
import { cacheValidatedPromo, calculateOrderTotals, fetchMerchantCheckoutPricing, type CheckoutPricing } from '@/lib/orderPricing';
import { formatJmd, getRestaurantProfile } from '@/lib/restaurantContent';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
};

export default function CartPage({ onNavigate, session }: Props) {
  const { items, merchantName, merchantId, updateQuantity, removeItem, replaceItem, clearCart, subtotal } = useCart();
  const savedAddress = getSavedAddress();

  const [deliveryInstructions, setDeliveryInstructions] = useState(savedAddress?.instructions ?? '');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState(getCheckoutPreferences().appliedPromoCode ?? '');
  const [promoMessage, setPromoMessage] = useState('');
  const [appliedPromo, setAppliedPromo] = useState(getAppliedPromo());
  const [checkoutPricing, setCheckoutPricing] = useState<CheckoutPricing | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);

  const editingCartItem = items.find((i) => i.id === editingCartItemId);
  const editingMenuItem = editingCartItem && merchantId
    ? getRestaurantProfile(merchantId).items.find((i) => i.id === editingCartItem.itemId) ?? null
    : null;

  const deliveryAddress = savedAddress
    ? `${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : 'Add a delivery address';

  useEffect(() => {
    if (savedAddress?.instructions) {
      setDeliveryInstructions(savedAddress.instructions);
    }
  }, [savedAddress?.instructions]);

  useEffect(() => {
    if (!merchantId) {
      setCheckoutPricing(null);
      setPricingError(null);
      return;
    }
    let cancelled = false;
    setPricingLoading(true);
    void (async () => {
      try {
        const pricing = await fetchMerchantCheckoutPricing({
          merchantId,
          accessToken: session?.access_token,
          subtotal,
          dropoffLat: savedAddress?.lat,
          dropoffLng: savedAddress?.lng,
          paymentMethod: 'wipay',
        });
        if (cancelled) return;
        setCheckoutPricing(pricing);
        setPricingError(null);
      } catch (err) {
        if (cancelled) return;
        setCheckoutPricing(null);
        setPricingError(err instanceof Error ? err.message : 'Could not load pricing');
      } finally {
        if (!cancelled) setPricingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantId, session?.access_token, subtotal, savedAddress?.lat, savedAddress?.lng]);

  const hasLivePricing = checkoutPricing != null && !pricingError;
  const { discount, deliveryFee, serviceFee, tax, processingFee, smallOrderFee, total } = hasLivePricing
    && checkoutPricing
    ? calculateOrderTotals(subtotal, appliedPromo, 0, 0, undefined, undefined, {
        v2Quote: checkoutPricing,
      })
    : {
        discount: 0,
        deliveryFee: 0,
        serviceFee: 0,
        tax: 0,
        processingFee: 0,
        smallOrderFee: 0,
        total: subtotal,
      };

  const serviceFeeDistanceJmd = hasLivePricing
    ? Math.max(0, Number(checkoutPricing?.serviceFeeDistanceJmd ?? 0))
    : 0;
  const serviceFeeBasket = Math.max(0, serviceFee - serviceFeeDistanceJmd);

  const taxRateLabel = checkoutPricing?.taxRatePercent;
  const minOrder = Number(checkoutPricing?.minOrderSubtotalJmd ?? 0);
  const belowMinOrder = minOrder > 0 && subtotal < minOrder;

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) {
      setPromoMessage('Enter a code');
      return;
    }
    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/promotions/redeem`, {
        method: 'POST',
        headers: supabaseAnonFunctionHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          code,
          merchantId: checkoutPricing?.merchantId || merchantId || undefined,
          subtotal,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        discount?: number;
        promo?: {
          code: string;
          title: string;
          type: string;
          discountPercent: number | null;
          discountAmount: number | null;
          minOrder: number | null;
        };
      };
      if (!res.ok || !data.promo) {
        setPromoMessage(data.error || 'Invalid promo');
        return;
      }
      const value =
        data.promo.discountPercent != null
          ? Number(data.promo.discountPercent)
          : Number(data.promo.discountAmount || 0);
      const cached = {
        code: data.promo.code,
        title: data.promo.title,
        type: data.promo.type as 'percent_off' | 'amount_off' | 'free_delivery',
        value,
        minOrder: Number(data.promo.minOrder || 0),
      };
      cacheValidatedPromo(cached);
      saveCheckoutPreferences({ appliedPromoCode: data.promo.code });
      setAppliedPromo(cached);
      setPromoMessage(
        data.promo.type === 'free_delivery'
          ? 'Applied (free delivery)'
          : `Applied (−${formatJmd(Number(data.discount || 0))})`,
      );
    } catch {
      setPromoMessage('Could not validate promo');
    }
  };

  const handleClearPromo = () => {
    saveCheckoutPreferences({ appliedPromoCode: null });
    setAppliedPromo(null);
    setPromoInput('');
    setPromoMessage('');
  };

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
    if (pricingError || !hasLivePricing) {
      toast.error('Wait for pricing to load, or retry');
      return;
    }
    if (belowMinOrder) {
      toast.error(`Minimum order is ${formatJmd(minOrder)}`);
      return;
    }
    onNavigate('checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-dvh bg-surface pb-32">
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
    <div className="bg-background text-on-background antialiased pb-32 min-h-dvh">
      <header className="bg-surface shadow-sm sticky top-0 z-50 safe-t">
        <div className="flex justify-between items-center px-4 min-h-16 max-w-[1200px] mx-auto">
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
          <div className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
            <label htmlFor="cart-promo" className="block text-label-md font-semibold mb-2">
              Promo code
            </label>
            <div className="flex gap-2">
              <input
                id="cart-promo"
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value)}
                placeholder="Enter code"
                className="flex-1 bg-surface-container rounded-lg px-4 py-3 text-body-md"
              />
              {appliedPromo ? (
                <button
                  type="button"
                  onClick={handleClearPromo}
                  className="px-4 py-3 rounded-lg border border-outline-variant text-label-md font-semibold"
                >
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleApplyPromo()}
                  className="bg-primary text-on-primary font-semibold text-label-md px-4 py-3 rounded-lg"
                >
                  Apply
                </button>
              )}
            </div>
            {promoMessage && <p className="text-body-sm text-primary mt-2">{promoMessage}</p>}
          </div>
        </section>

        <section className="px-4 mb-8">
          <h2 className="text-headline-sm font-semibold text-on-surface mb-4 px-1">Order Summary</h2>
          {pricingError && (
            <p className="mb-3 text-body-sm text-error px-1">
              {pricingError}. Totals may be incomplete — pull to refresh or try again.
            </p>
          )}
          {belowMinOrder && (
            <p className="mb-3 text-body-sm text-amber-700 px-1">
              Add {formatJmd(minOrder - subtotal)} more to meet the {formatJmd(minOrder)} minimum.
            </p>
          )}
          {hasLivePricing && (checkoutPricing?.menuInflationPercent ?? 0) > 0 && (
            <p className="mb-3 text-body-sm text-on-surface-variant px-1">
              Menu prices may include up to{' '}
              {Math.round((checkoutPricing!.menuInflationPercent ?? 0) * 1000) / 10}% above
              in-store.
            </p>
          )}
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
              <span>{!hasLivePricing ? '—' : deliveryFee === 0 ? 'FREE' : formatJmd(deliveryFee)}</span>
            </div>
            <div className="flex justify-between text-body-md text-on-surface-variant">
              <span>Service Fee</span>
              <span>{hasLivePricing ? formatJmd(serviceFeeBasket) : '—'}</span>
            </div>
            {serviceFeeDistanceJmd > 0 && (
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Distance service</span>
                <span>{formatJmd(serviceFeeDistanceJmd)}</span>
              </div>
            )}
            {checkoutPricing?.rushPassApplied && (
              <p className="text-body-sm text-primary font-medium">
                {checkoutPricing.freeDeliveryApplied
                  ? 'Rush Pass — free delivery within 8 km & lower service fee'
                  : checkoutPricing.rushPassFreeDeliveryDeniedReason === 'distance'
                    ? 'Rush Pass — lower service fee (outside free-delivery distance)'
                    : checkoutPricing.rushPassFreeDeliveryDeniedReason === 'budget'
                      ? 'Rush Pass — lower service fee (monthly free-delivery credit used)'
                      : 'Rush Pass — lower service fee'}
              </p>
            )}
            {smallOrderFee > 0 && (
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Small order fee</span>
                <span>{formatJmd(smallOrderFee)}</span>
              </div>
            )}
            {(taxRateLabel != null && taxRateLabel > 0) || tax > 0 ? (
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Tax (GCT {taxRateLabel ?? 0}%)</span>
                <span>{hasLivePricing ? formatJmd(tax) : '—'}</span>
              </div>
            ) : null}
            {processingFee > 0 && (
              <div className="flex justify-between text-body-md text-on-surface-variant">
                <span>Card processing</span>
                <span>{formatJmd(processingFee)}</span>
              </div>
            )}
            <div className="h-px w-full bg-surface-variant my-2" />
            <div className="flex justify-between text-headline-md font-semibold text-on-surface">
              <span>Total</span>
              <span>{hasLivePricing ? formatJmd(total) : pricingLoading ? '…' : '—'}</span>
            </div>
          </div>
        </section>
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] z-50 bg-surface shadow-[0px_-10px_30px_rgba(0,0,0,0.08)] pb-safe pt-4 px-4 rounded-t-2xl">
        <button
          type="button"
          onClick={handleCheckout}
          disabled={!hasLivePricing || belowMinOrder || pricingLoading}
          className="w-full bg-primary text-on-primary rounded-lg py-4 px-6 flex justify-between items-center text-headline-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all mb-4 disabled:opacity-50"
        >
          <span>{belowMinOrder ? `Min ${formatJmd(minOrder)}` : 'Go to Checkout'}</span>
          <span>{hasLivePricing ? formatJmd(total) : '—'}</span>
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
