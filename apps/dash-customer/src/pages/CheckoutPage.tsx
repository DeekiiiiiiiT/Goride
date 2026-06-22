import { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AddTipSheet } from '@/components/checkout/AddTipSheet';
import { ScheduleDeliverySheet } from '@/components/checkout/ScheduleDeliverySheet';
import { useCart } from '@/hooks/useCart';
import { getSavedAddress } from '@/lib/addressStorage';
import {
  getApiPaymentMethod,
  getAppliedPromo,
  getCheckoutPreferences,
  getPaymentLabel,
  saveCheckoutPreferences,
} from '@/lib/checkoutStorage';
import { calculateOrderTotals } from '@/lib/orderPricing';
import { formatJmd } from '@/lib/restaurantContent';
import { toast } from 'sonner';
import { isAgeVerified } from '@/pages/AgeVerificationPage';
import PharmacyNoticeSheet, {
  isPharmacyNoticeAcknowledged,
} from '@/components/checkout/PharmacyNoticeSheet';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
  session: Session | null;
};

const TIP_PRESETS = [50, 100, 150, 200];

export default function CheckoutPage({ onNavigate, session }: Props) {
  const { items, merchantId, clearCart, subtotal } = useCart();
  const savedAddress = getSavedAddress();
  const initialPrefs = getCheckoutPreferences();

  const [deliveryMode, setDeliveryMode] = useState<'standard' | 'scheduled'>(initialPrefs.deliveryMode);
  const [scheduledDateId, setScheduledDateId] = useState<string | null>(initialPrefs.scheduledDateId);
  const [scheduledSlotId, setScheduledSlotId] = useState<string | null>(initialPrefs.scheduledSlotId);
  const [scheduledLabel, setScheduledLabel] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<'hand' | 'door'>(initialPrefs.handoff);
  const [tip, setTip] = useState(initialPrefs.tip);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showTipSheet, setShowTipSheet] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [showPharmacyNotice, setShowPharmacyNotice] = useState(false);

  const deliveryAddress = savedAddress
    ? `${savedAddress.line1}${savedAddress.line2 ? `, ${savedAddress.line2}` : ''}`
    : '45 Constant Spring Rd, Apt 12B';

  const instructions =
    savedAddress?.instructions ?? 'Leave at door • Gate code: 1234';

  const appliedPromo = getAppliedPromo();
  const totals = useMemo(() => calculateOrderTotals(subtotal, appliedPromo, tip), [subtotal, appliedPromo, tip]);
  const paymentLabel = getPaymentLabel(getCheckoutPreferences().paymentMethodId);

  useEffect(() => {
    if (items.length === 0) {
      onNavigate('cart');
    }
  }, [items.length, onNavigate]);

  useEffect(() => {
    const vertical = sessionStorage.getItem('roam_cart_vertical');
    if (vertical === 'alcohol' && !isAgeVerified()) {
      onNavigate('age-verification');
    }
    if (vertical === 'pharmacy' && !isPharmacyNoticeAcknowledged()) {
      setShowPharmacyNotice(true);
    }
  }, [onNavigate]);

  const handleDeliveryModeChange = (mode: 'standard' | 'scheduled') => {
    if (mode === 'scheduled') {
      setShowSchedule(true);
      return;
    }
    setDeliveryMode('standard');
    setScheduledDateId(null);
    setScheduledSlotId(null);
    setScheduledLabel(null);
    saveCheckoutPreferences({ deliveryMode: 'standard', scheduledDateId: null, scheduledSlotId: null });
  };

  const handleScheduleConfirm = (dateId: string, slotId: string, slotLabel: string) => {
    setDeliveryMode('scheduled');
    setScheduledDateId(dateId);
    setScheduledSlotId(slotId);
    setScheduledLabel(slotLabel);
    saveCheckoutPreferences({ deliveryMode: 'scheduled', scheduledDateId: dateId, scheduledSlotId: slotId });
    setShowSchedule(false);
  };

  const handleTipSelect = (amount: number | 'custom') => {
    if (amount === 'custom') {
      setShowTipSheet(true);
      return;
    }
    setTip(amount);
    saveCheckoutPreferences({ tip: amount });
  };

  const handlePlaceOrder = async () => {
    if (!session) {
      toast.error('Please sign in to place an order');
      onNavigate('login');
      return;
    }
    if (items.length === 0) {
      toast.error('Your cart is empty');
      onNavigate('cart');
      return;
    }

    setIsPlacingOrder(true);
    const paymentMethod = getApiPaymentMethod(getCheckoutPreferences().paymentMethodId);

    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          merchantId,
          items: items.map(item => ({
            item_id: item.itemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            options: item.options,
          })),
          deliveryAddress,
          deliveryInstructions: handoff === 'door' ? instructions : 'Hand it to me',
          deliveryFee: totals.deliveryFee,
          tip: totals.tip,
          paymentMethod,
          scheduledFor:
            deliveryMode === 'scheduled' && scheduledDateId && scheduledSlotId
              ? { date: scheduledDateId, slot: scheduledSlotId }
              : undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Failed to place order');
      }

      const { order } = await res.json();

      if (paymentMethod === 'wipay' || paymentMethod === 'paypal') {
        const paymentRes = await fetch(`${API_ENDPOINTS.payments}/intents`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId: order.id, provider: paymentMethod }),
        });
        if (!paymentRes.ok) throw new Error('Failed to create payment');
        const { clientSecret } = await paymentRes.json();
        clearCart();
        window.location.href = clientSecret;
        return;
      }

      const orderNumber = order.order_number ?? `RD-${String(order.id).slice(-4).padStart(4, '0')}`;
      clearCart();
      onNavigate('order-confirmation', {
        orderId: order.id,
        orderNumber,
        total: totals.total,
        eta: deliveryMode === 'scheduled' && scheduledLabel ? scheduledLabel : '25-35 minutes',
        items: items.map(i => ({
          name: i.name,
          quantity: i.quantity,
          note: i.options?.find(o => o.name === 'Customizations')?.selections[0]?.name,
        })),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to place order';
      toast.error(message);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-background text-on-background antialiased min-h-screen pb-32">
      <header className="fixed top-0 w-full z-50 flex justify-between items-center px-4 h-16 bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => onNavigate('cart')}
          className="text-primary p-2 rounded-full active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="text-headline-md font-bold text-primary">Checkout</h1>
        <div className="w-10" />
      </header>

      <main className="pt-20 pb-32 px-4 space-y-6 max-w-2xl mx-auto">
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-start">
            <div className="flex gap-4 items-start">
              <MaterialIcon name="location_on" className="text-primary mt-1" filled />
              <div>
                <h2 className="text-headline-sm font-semibold text-on-surface">Delivery Address</h2>
                <p className="text-body-md text-on-surface-variant mt-2">{deliveryAddress}</p>
              </div>
            </div>
            <button type="button" className="text-label-md font-semibold text-primary border border-primary px-3 py-1 rounded-lg">
              Edit
            </button>
          </div>
          <div className="mt-4 h-32 rounded-lg overflow-hidden relative bg-surface-container">
            <img
              src="/images/address-map.png"
              alt="Delivery map"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex gap-4 items-start">
            <MaterialIcon name="schedule" className="text-primary mt-1" filled />
            <div className="w-full">
              <h2 className="text-headline-sm font-semibold text-on-surface">Delivery Time</h2>
              <div className="mt-4 space-y-2">
                <label
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer ${
                    deliveryMode === 'standard'
                      ? 'border-2 border-primary bg-surface-container-low'
                      : 'border border-outline-variant'
                  }`}
                >
                  <span className="text-body-md text-on-surface">Standard: 25-35 min</span>
                  <input
                    type="radio"
                    name="delivery_time"
                    checked={deliveryMode === 'standard'}
                    onChange={() => handleDeliveryModeChange('standard')}
                    className="custom-radio"
                  />
                </label>
                <label
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    deliveryMode === 'scheduled'
                      ? 'border-2 border-primary bg-surface-container-low'
                      : 'border border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <span className="text-body-md text-on-surface">
                    {deliveryMode === 'scheduled' && scheduledLabel
                      ? `Scheduled: ${scheduledLabel}`
                      : 'Schedule for later'}
                  </span>
                  <input
                    type="radio"
                    name="delivery_time"
                    checked={deliveryMode === 'scheduled'}
                    onChange={() => handleDeliveryModeChange('scheduled')}
                    className="custom-radio"
                  />
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex gap-4 items-start">
            <MaterialIcon name="home_work" className="text-primary mt-1" filled />
            <div className="w-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-headline-sm font-semibold text-on-surface">Delivery Instructions</h2>
                <button type="button" className="text-label-md font-semibold text-primary">
                  Add instructions
                </button>
              </div>
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setHandoff('hand');
                    saveCheckoutPreferences({ handoff: 'hand' });
                  }}
                  className={`flex-1 py-2 px-2 rounded-lg border text-body-sm transition-colors ${
                    handoff === 'hand'
                      ? 'border-2 border-primary bg-surface-container-low text-primary font-medium'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  Hand it to me
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHandoff('door');
                    saveCheckoutPreferences({ handoff: 'door' });
                  }}
                  className={`flex-1 py-2 px-2 rounded-lg border text-body-sm transition-colors ${
                    handoff === 'door'
                      ? 'border-2 border-primary bg-surface-container-low text-primary font-medium'
                      : 'border-outline-variant text-on-surface-variant'
                  }`}
                >
                  Leave at door
                </button>
              </div>
              <div className="bg-surface-container p-2 rounded-lg flex items-center gap-2">
                <MaterialIcon name="notes" className="text-on-surface-variant" />
                <p className="text-body-md text-on-surface-variant">{instructions}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-center">
            <div className="flex gap-4 items-center">
              <MaterialIcon name="credit_card" className="text-primary" filled />
              <div>
                <h2 className="text-headline-sm font-semibold text-on-surface">Payment Method</h2>
                <p className="text-body-md text-on-surface-variant mt-1">{paymentLabel}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payment-methods', { returnTo: 'checkout', mode: 'select' })}
              className="text-label-md font-semibold text-primary border border-primary px-3 py-1 rounded-lg"
            >
              Change
            </button>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <h2 className="text-headline-sm font-semibold text-on-surface mb-1">Add a tip for your courier</h2>
          <p className="text-label-sm text-on-surface-variant mb-4">Tip is 100% for the courier</p>
          <div className="flex flex-wrap gap-2">
            {TIP_PRESETS.map(amount => (
              <button
                key={amount}
                type="button"
                onClick={() => handleTipSelect(amount)}
                className={`px-4 py-2 rounded-full border text-body-md transition-colors ${
                  tip === amount
                    ? 'border-2 border-primary bg-surface-container-low text-primary font-medium'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                {formatJmd(amount)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleTipSelect('custom')}
              className={`px-4 py-2 rounded-full border text-body-md transition-colors ${
                !TIP_PRESETS.includes(tip as (typeof TIP_PRESETS)[number])
                  ? 'border-2 border-primary bg-surface-container-low text-primary font-medium'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              Custom
            </button>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <button
            type="button"
            onClick={() => setSummaryOpen(o => !o)}
            className="w-full flex justify-between items-center"
          >
            <h2 className="text-headline-sm font-semibold text-on-surface">Order Summary</h2>
            <MaterialIcon
              name="expand_more"
              className={`text-on-surface-variant transition-transform ${summaryOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {summaryOpen && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="flex justify-between text-body-md text-on-surface">
                    <span>
                      {item.quantity}x {item.name}
                    </span>
                    <span>{formatJmd(item.price * item.quantity)}</span>
                  </div>
                ))}
              </div>
              <hr className="border-outline-variant opacity-30" />
              <div className="space-y-1 text-body-sm text-on-surface-variant">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatJmd(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span>{totals.deliveryFee === 0 ? 'FREE' : formatJmd(totals.deliveryFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Service Fee</span>
                  <span>{formatJmd(totals.serviceFee)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax</span>
                  <span>{formatJmd(totals.tax)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Courier Tip</span>
                  <span>{formatJmd(totals.tip)}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-0 w-full z-50 bg-surface px-4 py-4 pb-safe shadow-[0px_-4px_20px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={isPlacingOrder}
          className="w-full max-w-2xl mx-auto bg-primary text-on-primary text-headline-sm font-semibold py-4 rounded-xl flex justify-between items-center px-6 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          <span>{isPlacingOrder ? 'Processing...' : 'Place Order'}</span>
          <span>{formatJmd(totals.total)}</span>
        </button>
      </div>

      <ScheduleDeliverySheet
        open={showSchedule}
        initialDateId={scheduledDateId}
        initialSlotId={scheduledSlotId}
        onClose={() => setShowSchedule(false)}
        onConfirm={handleScheduleConfirm}
      />

      <AddTipSheet
        open={showTipSheet}
        subtotal={subtotal}
        initialTip={tip}
        onClose={() => setShowTipSheet(false)}
        onConfirm={amount => {
          setTip(amount);
          saveCheckoutPreferences({ tip: amount });
          setShowTipSheet(false);
        }}
      />

      {showPharmacyNotice && (
        <PharmacyNoticeSheet
          itemCount={items.length}
          onContinue={() => setShowPharmacyNotice(false)}
          onDismiss={() => onNavigate('cart')}
        />
      )}
    </div>
  );
}
