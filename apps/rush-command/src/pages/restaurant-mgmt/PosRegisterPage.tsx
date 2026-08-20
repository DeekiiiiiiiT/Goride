import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Merchant } from '../../hooks/useMerchant';
import { usePosCart } from '../../hooks/usePosCart';
import { useMerchantMenu } from '../../hooks/useMerchantMenu';
import {
  FIXTURE_POS_CATEGORIES,
  FIXTURE_POS_MENU,
  FIXTURE_SETUP_DRAFT,
} from '../../lib/restaurant-mgmt-fixtures';
import { createPosOrder, createPosPaymentIntent, payPosOrder } from '../../lib/restaurant-mgmt-api';
import type { InStoreFulfillmentType, PosPaymentMethod } from '../../types/restaurant-mgmt';
import PosRegisterHeader from '../../components/restaurant-mgmt/pos/PosRegisterHeader';
import PosStepNav from '../../components/restaurant-mgmt/pos/PosStepNav';
import PosMenuPanel from '../../components/restaurant-mgmt/pos/PosMenuPanel';
import PosActiveCart from '../../components/restaurant-mgmt/pos/PosActiveCart';
import type { PosMenuItem, PosStep } from '../../components/restaurant-mgmt/pos/pos-types';

interface PosRegisterPageProps {
  merchant: Merchant;
  useApi: boolean;
  taxRatePercent?: number;
  onBack?: () => void;
  storeName?: string;
  staffName?: string;
  onUnpair?: () => void;
  onEndShift?: () => void;
}

function draftOrderNumber() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function PosRegisterPage({
  merchant,
  useApi,
  taxRatePercent: taxRateProp,
  storeName,
  staffName,
  onUnpair,
  onEndShift,
}: PosRegisterPageProps) {
  const taxRate =
    taxRateProp ??
    Number(
      JSON.parse(localStorage.getItem(`roam_restaurant_mgmt_setup_${merchant.id}`) || 'null')
        ?.taxRatePercent ?? FIXTURE_SETUP_DRAFT.taxRatePercent,
    );

  const menuQuery = useMerchantMenu(useApi ? merchant.id : '');
  const categories = useApi
    ? (menuQuery.data?.categories ?? []).map((c) => ({ id: c.id, name: c.name }))
    : FIXTURE_POS_CATEGORIES;
  const menuItems: PosMenuItem[] = useApi
    ? (menuQuery.data?.items ?? [])
        .filter((i) => i.is_available)
        .map((i) => ({
          id: i.id,
          categoryId: i.category_id,
          name: i.name,
          price: i.price,
          imageUrl: i.image_url || undefined,
        }))
    : FIXTURE_POS_MENU.map((i) => ({ ...i, imageUrl: undefined }));

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [step, setStep] = useState<PosStep>('register');
  const [orderNumber, setOrderNumber] = useState(() => draftOrderNumber());
  const [fulfillmentType, setFulfillmentType] = useState<InStoreFulfillmentType>('counter');
  const [guestName, setGuestName] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState('');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);
  const [paymentMockMode, setPaymentMockMode] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [printJobCreated, setPrintJobCreated] = useState<boolean | null>(null);

  const cart = usePosCart(taxRate);
  const displayStoreName = storeName ?? merchant.name;
  const showHeader = Boolean(staffName || storeName);

  useEffect(() => {
    if (categories.length > 0 && !categories.some((c) => c.id === activeCategory)) {
      setActiveCategory(categories[0].id);
    }
  }, [categories, activeCategory]);

  const filteredItems = useMemo(
    () => menuItems.filter((item) => item.categoryId === activeCategory),
    [menuItems, activeCategory],
  );

  const inCheckoutFlow = step === 'checkout' || step === 'payment';

  const openCheckout = () => {
    if (cart.isEmpty) {
      toast.error('Add items to the cart first');
      return;
    }
    setStep('checkout');
  };

  const backToRegister = () => setStep('register');

  const proceedToPayment = () => setStep('payment');

  const handleClearCart = () => {
    cart.clear();
    setOrderNumber(draftOrderNumber());
  };

  const handlePaymentMethodChange = (method: PosPaymentMethod) => {
    setPaymentMethod(method);
    setTerminalReady(false);
    setPendingOrderId(null);
    setClientSecret(null);
    setPaymentMockMode(false);
    setPrintJobCreated(null);
  };

  const completeSale = async () => {
    setSubmitting(true);
    try {
      if (useApi) {
        if (paymentMethod === 'card') {
          if (!pendingOrderId) {
            const result = await createPosOrder({
              lines: cart.lines,
              fulfillmentType,
              paymentMethod: 'card',
              markPaid: false,
              guestName: guestName || null,
              tableLabel: tableLabel || null,
            });
            const order = result.order as { id?: string; order_number?: string };
            const orderId = String(order?.id ?? '');
            setPendingOrderId(orderId);
            const intent = await createPosPaymentIntent(orderId);
            setPaymentMockMode(Boolean(intent.mockMode));
            setClientSecret(intent.clientSecret);
            setTerminalReady(true);
            setLastOrderNumber(String(order.order_number ?? ''));
            if (intent.mockMode) {
              toast.message('Stripe not configured — confirm to mark paid locally (mock)');
            } else {
              toast.message('Present card on reader, then tap Complete sale again');
            }
            return;
          }
          if (!paymentMockMode) {
            if (!clientSecret) {
              throw new Error('Missing payment client secret');
            }
            const { collectAndConfirmCardPresentPayment } = await import('../../lib/stripe-terminal');
            await collectAndConfirmCardPresentPayment(clientSecret);
          }
          const payResult = await payPosOrder(pendingOrderId, 'card');
          setPrintJobCreated(Boolean(payResult.printJobCreated));
        } else {
          const result = await createPosOrder({
            lines: cart.lines,
            fulfillmentType,
            paymentMethod,
            markPaid: true,
            guestName: guestName || null,
            tableLabel: tableLabel || null,
          });
          setLastOrderNumber(String(result.order?.order_number ?? ''));
          setPrintJobCreated(Boolean((result as { printJobCreated?: boolean }).printJobCreated));
        }
      } else {
        setLastOrderNumber(orderNumber);
        setPrintJobCreated(null);
      }
      setStep('success');
      cart.clear();
      setGuestName('');
      setTableLabel('');
      setPendingOrderId(null);
      setClientSecret(null);
      setTerminalReady(false);
      setPaymentMockMode(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const startNewOrder = () => {
    setStep('register');
    setOrderNumber(draftOrderNumber());
    setPrintJobCreated(null);
    setPaymentMockMode(false);
    setClientSecret(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {showHeader && (
        <PosRegisterHeader
          storeName={displayStoreName ?? 'Store'}
          staffName={staffName || undefined}
          onUnpair={onUnpair}
          onEndShift={onEndShift}
        />
      )}

      <PosStepNav step={step} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <PosMenuPanel
          categories={categories}
          activeCategory={activeCategory}
          items={filteredItems}
          dimmed={inCheckoutFlow}
          onCategoryChange={setActiveCategory}
          onAddItem={cart.addItem}
        />

        <PosActiveCart
          step={step}
          lines={cart.lines}
          orderNumber={orderNumber}
          subtotal={cart.pricing.subtotal}
          tax={cart.pricing.tax}
          total={cart.pricing.total}
          taxRate={taxRate}
          submitting={submitting}
          fulfillmentType={fulfillmentType}
          guestName={guestName}
          tableLabel={tableLabel}
          paymentMethod={paymentMethod}
          terminalReady={terminalReady}
          paymentMockMode={paymentMockMode}
          printJobCreated={printJobCreated}
          useApi={useApi}
          onUpdateQuantity={cart.updateQuantity}
          onClearCart={handleClearCart}
          onCheckout={openCheckout}
          onBackToRegister={backToRegister}
          onProceedToPayment={proceedToPayment}
          onFulfillmentChange={setFulfillmentType}
          onGuestNameChange={setGuestName}
          onTableLabelChange={setTableLabel}
          onPaymentMethodChange={handlePaymentMethodChange}
          onBackToCheckout={() => setStep('checkout')}
          onCompleteSale={completeSale}
          onNewOrder={startNewOrder}
          lastOrderNumber={lastOrderNumber}
        />
      </div>
    </div>
  );
}
