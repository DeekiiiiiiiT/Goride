import { useEffect, useMemo, useRef, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { API_ENDPOINTS, supabaseAnonFunctionHeaders } from '@roam/api-client';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AddTipSheet } from '@/components/checkout/AddTipSheet';
import { ScheduleDeliverySheet } from '@/components/checkout/ScheduleDeliverySheet';
import { useCart } from '@/hooks/useCart';
import { DeliveryPinMap } from '@/components/home/DeliveryPinMap';
import { getCheckoutLocation, getSavedAddress } from '@/lib/addressStorage';
import { isValidLatLng, openMapsPin } from '@/lib/deliveryPinMap';
import { buildDeliveryInstructions, resolveCheckoutAddress } from '@/lib/checkoutAddress';
import { DeliveryInstructionsSheet } from '@/components/cart/DeliveryInstructionsSheet';
import {
  getApiPaymentMethod,
  getAppliedPromo,
  getCheckoutPreferences,
  getPaymentLabel,
  saveCheckoutPreferences,
} from '@/lib/checkoutStorage';
import { calculateOrderTotals, fetchMerchantCheckoutPricing, type CheckoutPricing } from '@/lib/orderPricing';
import { formatJmd } from '@/lib/restaurantContent';
import { toast } from 'sonner';
import { fetchCustomerProfile } from '@/lib/customerApi';
import { checkDeliveryZoneAsync } from '@/lib/deliveryZones';
import { isAllowedPaymentRedirectUrl } from '@/lib/resumePayment';
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
  const pin = getCheckoutLocation();
  const pinLat = pin.lat ?? savedAddress?.lat;
  const pinLng = pin.lng ?? savedAddress?.lng;
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
  const submitLockRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const [showPharmacyNotice, setShowPharmacyNotice] = useState(false);
  const [checkoutPricing, setCheckoutPricing] = useState<CheckoutPricing | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  const resolvedAddress = resolveCheckoutAddress(savedAddress);
  const deliveryAddress = resolvedAddress.address;
  const [instructions, setInstructions] = useState(resolvedAddress.instructions);

  useEffect(() => {
    setInstructions(resolvedAddress.instructions);
  }, [resolvedAddress.instructions]);

  const appliedPromo = getAppliedPromo();
  const paymentMethodId = getCheckoutPreferences().paymentMethodId;
  const apiPaymentMethod = getApiPaymentMethod(paymentMethodId);
  const hasLivePricing = checkoutPricing != null && !pricingError;
  const totals = useMemo(
    () =>
      hasLivePricing && checkoutPricing
        ? calculateOrderTotals(subtotal, appliedPromo, tip, 0, undefined, undefined, {
            v2Quote: checkoutPricing,
            tip,
          })
        : {
            discount: 0,
            discountedSubtotal: subtotal,
            deliveryFee: 0,
            serviceFee: 0,
            tax: 0,
            tip,
            orderTotal: subtotal + tip,
            processingFee: 0,
            smallOrderFee: 0,
            total: subtotal + tip,
          },
    [subtotal, appliedPromo, tip, checkoutPricing, hasLivePricing],
  );
  const taxRateLabel = checkoutPricing?.taxRatePercent;
  const paymentLabel = getPaymentLabel(paymentMethodId);
  const minOrder = Number(checkoutPricing?.minOrderSubtotalJmd ?? 0);
  const belowMinOrder = minOrder > 0 && subtotal < minOrder;

  useEffect(() => {
    if (items.length === 0) {
      onNavigate('cart');
    }
  }, [items.length, onNavigate]);

  useEffect(() => {
    if (!merchantId) {
      setCheckoutPricing(null);
      setPricingError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const pricing = await fetchMerchantCheckoutPricing({
          merchantId,
          accessToken: session?.access_token,
          subtotal,
          dropoffLat: pinLat,
          dropoffLng: pinLng,
          paymentMethod: apiPaymentMethod,
          tip,
        });
        if (cancelled) return;
        setCheckoutPricing(pricing);
        setPricingError(null);
      } catch (err) {
        if (cancelled) return;
        setCheckoutPricing(null);
        setPricingError(err instanceof Error ? err.message : 'Could not load pricing');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [merchantId, session?.access_token, subtotal, pinLat, pinLng, apiPaymentMethod, tip]);

  useEffect(() => {
    const vertical = sessionStorage.getItem('roam_cart_vertical');
    // Alcohol vertical deferred for soft launch — no client-side age theater
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

  useEffect(() => {
    if (!session) {
      setAccountSuspended(false);
      return;
    }
    let cancelled = false;
    void fetchCustomerProfile()
      .then((profile) => {
        if (!cancelled) setAccountSuspended(profile?.accountStatus === 'suspended');
      })
      .catch(() => {
        if (!cancelled) setAccountSuspended(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const handlePlaceOrder = async () => {
    if (!session) {
      toast.error('Please sign in to place an order');
      onNavigate('login');
      return;
    }
    if (accountSuspended) {
      toast.error('Your account is suspended. Contact support for help.');
      return;
    }
    if (items.length === 0) {
      toast.error('Your cart is empty');
      onNavigate('cart');
      return;
    }
    if (!deliveryAddress) {
      toast.error('Add a delivery address before placing your order');
      onNavigate('address');
      return;
    }
    if (pricingError || !hasLivePricing) {
      toast.error(pricingError || 'Wait for pricing to load before placing your order');
      return;
    }
    if (belowMinOrder) {
      toast.error(`Minimum food order is ${formatJmd(minOrder)}`);
      return;
    }

    // Re-validate coverage at checkout (address may have gone stale after zone publish)
    const checkoutLocation = getCheckoutLocation();
    const zoneLat = checkoutLocation.lat ?? savedAddress?.lat;
    const zoneLng = checkoutLocation.lng ?? savedAddress?.lng;
    if (zoneLat == null || zoneLng == null || !Number.isFinite(zoneLat) || !Number.isFinite(zoneLng)) {
      toast.error('Add a map pin to your delivery address before placing your order');
      onNavigate('address');
      return;
    }
    try {
      const zone = await checkDeliveryZoneAsync({
        line1: deliveryAddress,
        lat: zoneLat,
        lng: zoneLng,
      });
      if (!zone.inZone) {
        toast.error(zone.reason ?? "We don't deliver to this address yet");
        onNavigate('out-of-delivery', {
          returnTo: 'checkout',
          attemptedAddress: deliveryAddress,
        });
        return;
      }
    } catch {
      /* server still enforces on POST /orders */
    }

    // Synchronous lock so double-taps can't trigger another request before React re-renders.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID();

    setIsPlacingOrder(true);
    const paymentMethod = getApiPaymentMethod(getCheckoutPreferences().paymentMethodId);

    try {
      const res = await fetch(`${API_ENDPOINTS.delivery}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'Idempotency-Key': idempotencyKeyRef.current ?? undefined,
        },
        body: JSON.stringify({
          merchantId: checkoutPricing?.merchantId || merchantId,
          items: items.map(item => ({
            id: item.itemId,
            menuItemId: item.itemId,
            item_id: item.itemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            options: item.options,
          })),
          deliveryAddress,
          deliveryAddressLine2: savedAddress?.line2?.trim() || undefined,
          deliveryLat: checkoutLocation.lat,
          deliveryLng: checkoutLocation.lng,
          deliveryInstructions: buildDeliveryInstructions(handoff, instructions),
          deliveryFee: totals.deliveryFee,
          tip: totals.tip,
          paymentMethod,
          promoCode: getAppliedPromo()?.code ?? getCheckoutPreferences().appliedPromoCode ?? undefined,
          scheduledFor:
            deliveryMode === 'scheduled' && scheduledDateId && scheduledSlotId
              ? { date: scheduledDateId, slot: scheduledSlotId }
              : undefined,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        if (error.code === 'min_order_not_met') {
          throw new Error(error.error || 'Order does not meet the minimum amount');
        }
        if (error.code === 'out_of_coverage') {
          throw new Error(error.error || "You're outside our delivery zone.");
        }
        if (error.code === 'excluded_zone') {
          throw new Error(error.error || "We're not currently serving your address.");
        }
        if (error.code === 'too_far_from_store') {
          throw new Error(error.error || "This store doesn't deliver that far.");
        }
        if (error.code === 'market_inactive') {
          throw new Error(error.error || 'Roam Rush is not available in this area yet.');
        }
        if (error.code === 'merchant_out_of_market') {
          throw new Error(error.error || "This store doesn't deliver to your area");
        }
        if (error.code === 'outside_parish') {
          throw new Error(error.error || "You're outside our delivery zone.");
        }
        if (error.code === 'merchant_out_of_parish') {
          throw new Error(error.error || "This store doesn’t deliver to your parish");
        }
        if (error.code === 'dropoff_required') {
          throw new Error(error.error || 'Add a delivery pin before placing your order');
        }
        throw new Error(error.error || 'Failed to place order');
      }

      const { order } = await res.json();
      // Prefer server totals — client fees are display-only
      const serverTotal = Number(order.total ?? totals.total);

      if (paymentMethod === 'wipay') {
        const paymentRes = await fetch(`${API_ENDPOINTS.payments}/intents`, {
          method: 'POST',
          headers: supabaseAnonFunctionHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          }),
          body: JSON.stringify({
            orderId: order.id,
            provider: paymentMethod,
            returnOrigin: window.location.origin,
          }),
        });
        if (!paymentRes.ok) {
          const paymentError = await paymentRes.json().catch(() => ({}));
          throw new Error(
            (paymentError as { error?: string }).error || 'Failed to create payment',
          );
        }
        const payData = (await paymentRes.json()) as {
          paymentRedirectUrl?: string;
          clientSecret?: string;
        };
        const redirectUrl = payData.paymentRedirectUrl ?? payData.clientSecret;
        if (!isAllowedPaymentRedirectUrl(redirectUrl)) {
          throw new Error('Invalid payment redirect URL');
        }
        idempotencyKeyRef.current = null;
        clearCart();
        window.location.href = redirectUrl;
        return;
      }

      const orderNumber = order.order_number ?? `RD-${String(order.id).slice(-4).padStart(4, '0')}`;
      idempotencyKeyRef.current = null;
      clearCart();
      onNavigate('order-confirmation', {
        orderId: order.id,
        orderNumber,
        total: serverTotal,
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
      submitLockRef.current = false;
      setIsPlacingOrder(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="bg-background text-on-background antialiased min-h-dvh pb-32">
      <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 flex justify-between items-center px-4 min-h-16 pt-safe bg-surface shadow-sm safe-x">
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

      <main className="pb-32 px-4 space-y-6 max-w-2xl mx-auto pt-[calc(4rem+env(safe-area-inset-top,0px)+1rem)]">
        <section className="bg-surface-container-lowest rounded-xl p-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)]">
          <div className="flex justify-between items-start">
            <div className="flex gap-4 items-start">
              <MaterialIcon name="location_on" className="text-primary mt-1" filled />
              <div>
                <h2 className="text-headline-sm font-semibold text-on-surface">Delivery Address</h2>
                <p className="text-body-md text-on-surface-variant mt-2">
                  {deliveryAddress ?? 'Add a delivery address to continue'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('address')}
              className="text-label-md font-semibold text-primary border border-primary px-3 py-1 rounded-lg"
            >
              {deliveryAddress ? 'Edit' : 'Add'}
            </button>
          </div>
          <div className="mt-4 h-32 rounded-lg overflow-hidden relative bg-surface-container">
            <DeliveryPinMap
              lat={pinLat}
              lng={pinLng}
              className="absolute inset-0"
              emptyLabel="Add a delivery pin so the courier can find you"
            />
            <button
              type="button"
              aria-label={isValidLatLng(pinLat, pinLng) ? 'Open delivery pin in maps' : 'Add delivery pin'}
              onClick={() => {
                if (isValidLatLng(pinLat, pinLng)) openMapsPin(pinLat!, pinLng!);
                else onNavigate('address');
              }}
              className="absolute inset-0 z-10"
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
                <button type="button" onClick={() => setInstructionsOpen(true)} className="text-label-md font-semibold text-primary">
                  {instructions.trim() ? 'Edit instructions' : 'Add instructions'}
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
                <p className="text-body-md text-on-surface-variant">{instructions.trim() || 'No extra notes yet'}</p>
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
              {(checkoutPricing?.menuInflationPercent ?? 0) > 0 && (
                <p className="text-body-sm text-on-surface-variant">
                  Menu prices may include up to{' '}
                  {Math.round((checkoutPricing!.menuInflationPercent ?? 0) * 1000) / 10}% above
                  in-store.
                </p>
              )}
              {checkoutPricing?.rushPassApplied && (
                <p className="text-body-sm text-primary font-medium">
                  Rush Pass applied — free delivery &amp; lower service fee
                </p>
              )}
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
                  <span>
                    {formatJmd(
                      Math.max(
                        0,
                        totals.serviceFee - Math.max(0, checkoutPricing?.serviceFeeDistanceJmd ?? 0),
                      ),
                    )}
                  </span>
                </div>
                {(checkoutPricing?.serviceFeeDistanceJmd ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Distance service</span>
                    <span>{formatJmd(checkoutPricing!.serviceFeeDistanceJmd ?? 0)}</span>
                  </div>
                )}
                {totals.smallOrderFee > 0 && (
                  <div className="flex justify-between">
                    <span>Small order fee</span>
                    <span>{formatJmd(totals.smallOrderFee)}</span>
                  </div>
                )}
                {(totals.taxFoodJmd ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Tax (GCT on food)</span>
                    <span>{formatJmd(totals.taxFoodJmd ?? 0)}</span>
                  </div>
                )}
                {(totals.taxPlatformJmd ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span>Tax (GCT on platform fees)</span>
                    <span>{formatJmd(totals.taxPlatformJmd ?? 0)}</span>
                  </div>
                )}
                {(totals.taxFoodJmd ?? 0) === 0 && (totals.taxPlatformJmd ?? 0) === 0 &&
                ((taxRateLabel != null && taxRateLabel > 0) || totals.tax > 0) ? (
                  <div className="flex justify-between">
                    <span>Tax (GCT {taxRateLabel ?? 0}%)</span>
                    <span>{formatJmd(totals.tax)}</span>
                  </div>
                ) : null}
                {totals.processingFee > 0 && (
                  <div className="flex justify-between">
                    <span>Card processing</span>
                    <span>{formatJmd(totals.processingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>Courier Tip</span>
                  <span>{formatJmd(totals.tip)}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50 bg-surface px-4 py-4 pb-safe shadow-[0px_-4px_20px_rgba(0,0,0,0.04)]">
        {accountSuspended && (
          <p className="text-sm text-error text-center mb-2 max-w-2xl mx-auto">
            Your account is suspended. Contact support — you cannot place orders.
          </p>
        )}
        {pricingError && (
          <p className="text-sm text-error text-center mb-2 max-w-2xl mx-auto">{pricingError}</p>
        )}
        {belowMinOrder && (
          <p className="text-sm text-amber-700 text-center mb-2 max-w-2xl mx-auto">
            Minimum order {formatJmd(minOrder)} — add {formatJmd(minOrder - subtotal)} more.
          </p>
        )}
        {!deliveryAddress && (
          <p className="text-sm text-error text-center mb-2 max-w-2xl mx-auto">
            Add a delivery address before placing your order.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handlePlaceOrder()}
          disabled={isPlacingOrder || accountSuspended || !deliveryAddress || !hasLivePricing || belowMinOrder}
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
        maxTip={Math.max(10000, Math.round(totals.total * 2))}
        highTipThreshold={Math.max(3000, Math.round(totals.total * 0.5))}
        onClose={() => setShowTipSheet(false)}
        onConfirm={amount => {
          setTip(amount);
          saveCheckoutPreferences({ tip: amount });
          setShowTipSheet(false);
        }}
      />

      <DeliveryInstructionsSheet
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        value={instructions}
        onSave={setInstructions}
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
