import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { Merchant } from '../../hooks/useMerchant';
import { usePosCart } from '../../hooks/usePosCart';
import { useMerchantMenu } from '../../hooks/useMerchantMenu';
import { formatJmd } from '../../lib/partner-utils';
import {
  FIXTURE_POS_CATEGORIES,
  FIXTURE_POS_MENU,
  FIXTURE_SETUP_DRAFT,
} from '../../lib/restaurant-mgmt-fixtures';
import { createPosOrder, createPosPaymentIntent, payPosOrder } from '../../lib/restaurant-mgmt-api';
import type { InStoreFulfillmentType, PosPaymentMethod } from '../../types/restaurant-mgmt';

type PosSheet = 'none' | 'checkout' | 'payment' | 'success';

interface PosRegisterPageProps {
  merchant: Merchant;
  useApi: boolean;
  taxRatePercent?: number;
  onBack?: () => void;
}

export default function PosRegisterPage({
  merchant,
  useApi,
  taxRatePercent: taxRateProp,
  onBack,
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
  const menuItems = useApi
    ? (menuQuery.data?.items ?? [])
        .filter((i) => i.is_available)
        .map((i) => ({ id: i.id, categoryId: i.category_id, name: i.name, price: i.price }))
    : FIXTURE_POS_MENU;

  const [activeCategory, setActiveCategory] = useState(categories[0]?.id ?? '');
  const [sheet, setSheet] = useState<PosSheet>('none');
  const [fulfillmentType, setFulfillmentType] = useState<InStoreFulfillmentType>('counter');
  const [guestName, setGuestName] = useState('');
  const [tableLabel, setTableLabel] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>('card');
  const [submitting, setSubmitting] = useState(false);
  const [lastOrderNumber, setLastOrderNumber] = useState('');
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [terminalReady, setTerminalReady] = useState(false);

  const cart = usePosCart(taxRate);

  const filteredItems = useMemo(
    () => menuItems.filter((item) => item.categoryId === activeCategory),
    [menuItems, activeCategory],
  );

  const openCheckout = () => {
    if (cart.isEmpty) {
      toast.error('Add items to the cart first');
      return;
    }
    setSheet('checkout');
  };

  const proceedToPayment = () => setSheet('payment');

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
            await createPosPaymentIntent(orderId);
            setTerminalReady(true);
            setLastOrderNumber(String(order.order_number ?? ''));
            toast.message('Present card on reader, then tap Complete sale again');
            return;
          }
          await payPosOrder(pendingOrderId, 'card');
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
        }
      } else {
        setLastOrderNumber(`${Math.floor(1000 + Math.random() * 9000)}`);
      }
      setSheet('success');
      cart.clear();
      setGuestName('');
      setTableLabel('');
      setPendingOrderId(null);
      setTerminalReady(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closeSheets = () => setSheet('none');

  return (
    <div className="flex h-full min-h-[480px] flex-col bg-background lg:flex-row">
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-inset-sm border-b border-outline-variant bg-surface px-inset-md py-inset-sm">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
              aria-label="Back"
            >
              <MaterialIcon name="arrow_back" />
            </button>
          )}
          <h2 className="text-title-lg font-semibold">POS Register</h2>
        </header>

        <div className="flex gap-1 overflow-x-auto border-b border-outline-variant px-inset-sm py-inset-xs">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-label-md font-semibold ${
                activeCategory === cat.id
                  ? 'bg-primary-container text-on-primary-container'
                  : 'text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 gap-inset-sm overflow-auto p-inset-md md:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => cart.addItem(item)}
              className="flex min-h-[88px] flex-col items-start justify-center rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:border-primary-container active:scale-[0.98]"
            >
              <span className="text-body-md font-semibold text-on-surface">{item.name}</span>
              <span className="mt-1 text-label-md text-primary-container">{formatJmd(item.price)}</span>
            </button>
          ))}
        </div>
      </div>

      <aside className="flex w-full flex-col border-t border-outline-variant bg-surface lg:w-96 lg:border-l lg:border-t-0">
        <div className="border-b border-outline-variant px-inset-md py-inset-sm">
          <h3 className="text-title-md font-semibold">Current order</h3>
        </div>
        <ul className="flex-1 space-y-inset-xs overflow-auto p-inset-md">
          {cart.lines.length === 0 ? (
            <li className="text-center text-body-sm text-on-surface-variant">Cart is empty</li>
          ) : (
            cart.lines.map((line) => (
              <li
                key={line.id}
                className="flex items-center justify-between gap-inset-sm rounded-lg bg-surface-container-low p-inset-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold">{line.name}</p>
                  <p className="text-label-sm text-on-surface-variant">{formatJmd(line.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => cart.updateQuantity(line.id, line.quantity - 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-variant"
                  >
                    <MaterialIcon name="remove" size={18} />
                  </button>
                  <span className="w-6 text-center text-label-md font-semibold">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => cart.updateQuantity(line.id, line.quantity + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-variant"
                  >
                    <MaterialIcon name="add" size={18} />
                  </button>
                </div>
              </li>
            ))
          )}
        </ul>
        <div className="space-y-1 border-t border-outline-variant p-inset-md text-body-sm">
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Subtotal</span>
            <span>{formatJmd(cart.pricing.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-on-surface-variant">Tax ({taxRate}%)</span>
            <span>{formatJmd(cart.pricing.tax)}</span>
          </div>
          <div className="flex justify-between text-body-md font-bold">
            <span>Total</span>
            <span>{formatJmd(cart.pricing.total)}</span>
          </div>
          <button
            type="button"
            disabled={cart.isEmpty}
            onClick={openCheckout}
            className="mt-inset-sm flex min-h-[52px] w-full items-center justify-center rounded-xl bg-primary-container text-body-md font-semibold text-on-primary disabled:opacity-50"
          >
            Checkout
          </button>
        </div>
      </aside>

      {sheet !== 'none' && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-scrim/40 lg:items-center">
          <div className="w-full max-w-lg rounded-t-2xl bg-surface p-inset-lg shadow-xl lg:rounded-2xl">
            {sheet === 'checkout' && (
              <>
                <h3 className="text-headline-md font-bold">Order type</h3>
                <div className="mt-inset-md flex flex-wrap gap-inset-sm">
                  {(['counter', 'pickup', 'dine_in'] as InStoreFulfillmentType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setFulfillmentType(type)}
                      className={`rounded-full px-4 py-2 text-label-md font-semibold capitalize ${
                        fulfillmentType === type
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-surface-container-high'
                      }`}
                    >
                      {type.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                {fulfillmentType === 'dine_in' && (
                  <input
                    value={tableLabel}
                    onChange={(e) => setTableLabel(e.target.value)}
                    placeholder="Table number"
                    className="mt-inset-md w-full rounded-lg border border-outline-variant px-3 py-2"
                  />
                )}
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="Guest name (optional)"
                  className="mt-inset-sm w-full rounded-lg border border-outline-variant px-3 py-2"
                />
                <div className="mt-inset-lg flex gap-inset-sm">
                  <button
                    type="button"
                    onClick={closeSheets}
                    className="min-h-[48px] flex-1 rounded-lg border border-outline-variant font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={proceedToPayment}
                    className="min-h-[48px] flex-[2] rounded-lg bg-primary-container font-semibold text-on-primary"
                  >
                    Continue to payment
                  </button>
                </div>
              </>
            )}

            {sheet === 'payment' && (
              <>
                <h3 className="text-headline-md font-bold">Payment</h3>
                <p className="mt-1 text-headline-lg font-bold text-primary-container">
                  {formatJmd(cart.pricing.total)}
                </p>
                <div className="mt-inset-md grid grid-cols-2 gap-inset-sm">
                  {(['card', 'cash'] as PosPaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(method);
                        setTerminalReady(false);
                        setPendingOrderId(null);
                      }}
                      className={`min-h-[64px] rounded-xl border-2 text-title-md font-semibold capitalize ${
                        paymentMethod === method
                          ? 'border-primary-container bg-primary-container/10'
                          : 'border-outline-variant'
                      }`}
                    >
                      {method}
                    </button>
                  ))}
                </div>
                {paymentMethod === 'card' && (
                  <div className="mt-inset-md rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-inset-md text-center">
                    <MaterialIcon name="contactless" className="text-4xl text-primary-container" />
                    <p className="mt-inset-sm text-body-sm font-semibold">Stripe Terminal</p>
                    <p className="text-label-sm text-on-surface-variant">
                      {terminalReady || !useApi
                        ? 'Tap or insert card on the reader'
                        : 'Continue from checkout to connect the reader'}
                    </p>
                  </div>
                )}
                <div className="mt-inset-lg flex gap-inset-sm">
                  <button
                    type="button"
                    onClick={() => setSheet('checkout')}
                    className="min-h-[48px] flex-1 rounded-lg border border-outline-variant font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={completeSale}
                    className="min-h-[48px] flex-[2] rounded-lg bg-primary-container font-semibold text-on-primary disabled:opacity-60"
                  >
                    {submitting
                      ? 'Processing…'
                      : paymentMethod === 'card' && useApi && !terminalReady
                        ? 'Connect reader'
                        : 'Complete sale'}
                  </button>
                </div>
              </>
            )}

            {sheet === 'success' && (
              <div className="text-center">
                <MaterialIcon name="check_circle" className="text-5xl text-primary-container" />
                <h3 className="mt-inset-sm text-headline-md font-bold">Payment successful</h3>
                <p className="text-body-md text-on-surface-variant">Order #{lastOrderNumber}</p>
                <p className="mt-1 text-body-sm text-on-surface-variant">
                  Receipt {useApi ? 'sent to printer' : 'preview mode'}
                </p>
                <button
                  type="button"
                  onClick={closeSheets}
                  className="mt-inset-lg min-h-[48px] w-full rounded-lg bg-primary-container font-semibold text-on-primary"
                >
                  New order
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
