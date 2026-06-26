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
import type { InStoreFulfillmentType, PosCartLine, PosPaymentMethod } from '../../types/restaurant-mgmt';

type PosStep = 'register' | 'checkout' | 'payment' | 'success';

interface PosRegisterPageProps {
  merchant: Merchant;
  useApi: boolean;
  taxRatePercent?: number;
  onBack?: () => void;
}

function fulfillmentLabel(type: InStoreFulfillmentType) {
  if (type === 'dine_in') return 'Dine in';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function itemCount(lines: PosCartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

interface CartLinesProps {
  lines: PosCartLine[];
  onUpdateQuantity: (id: string, quantity: number) => void;
}

function CartLines({ lines, onUpdateQuantity }: CartLinesProps) {
  if (lines.length === 0) {
    return <p className="text-center text-body-sm text-on-surface-variant">Cart is empty</p>;
  }

  return (
    <ul className="space-y-inset-xs">
      {lines.map((line) => (
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
              onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-variant"
              aria-label={`Remove one ${line.name}`}
            >
              <MaterialIcon name="remove" size={18} />
            </button>
            <span className="w-6 text-center text-label-md font-semibold">{line.quantity}</span>
            <button
              type="button"
              onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-variant"
              aria-label={`Add one ${line.name}`}
            >
              <MaterialIcon name="add" size={18} />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

interface OrderSummaryBarProps {
  lines: PosCartLine[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
}

function OrderSummaryBar({ lines, total, expanded, onToggle }: OrderSummaryBarProps) {
  const count = itemCount(lines);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full shrink-0 items-center gap-inset-sm border-b border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm text-left"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container/15">
        <MaterialIcon name="shopping_bag" className="text-primary-container" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-label-sm text-on-surface-variant">Current order</p>
        <p className="text-body-md font-semibold text-on-surface">
          {count} {count === 1 ? 'item' : 'items'} · {formatJmd(total)}
        </p>
      </div>
      <span className="text-label-sm font-semibold text-primary">
        {expanded ? 'Hide' : 'View'}
      </span>
      <MaterialIcon
        name={expanded ? 'expand_less' : 'expand_more'}
        className="shrink-0 text-on-surface-variant"
      />
    </button>
  );
}

interface StepProgressProps {
  step: PosStep;
}

function StepProgress({ step }: StepProgressProps) {
  const steps = [
    { key: 'register', label: 'Items' },
    { key: 'checkout', label: 'Order type' },
    { key: 'payment', label: 'Payment' },
  ] as const;

  const activeIndex = step === 'payment' ? 2 : step === 'checkout' ? 1 : 0;

  return (
    <div className="flex items-center gap-2 px-inset-md py-inset-sm">
      {steps.map((entry, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div key={entry.key} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-label-sm font-bold ${
                active
                  ? 'bg-primary-container text-on-primary-container'
                  : done
                    ? 'bg-primary-container/20 text-primary-container'
                    : 'bg-surface-variant text-on-surface-variant'
              }`}
            >
              {done ? <MaterialIcon name="check" size={16} /> : index + 1}
            </div>
            <span
              className={`hidden text-label-sm font-semibold sm:inline ${
                active ? 'text-on-surface' : 'text-on-surface-variant'
              }`}
            >
              {entry.label}
            </span>
            {index < steps.length - 1 && (
              <div
                className={`mx-1 h-0.5 flex-1 rounded ${
                  index < activeIndex ? 'bg-primary-container' : 'bg-outline-variant'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
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
  const [step, setStep] = useState<PosStep>('register');
  const [cartExpanded, setCartExpanded] = useState(false);
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

  const inCheckoutFlow = step === 'checkout' || step === 'payment';

  const openCheckout = () => {
    if (cart.isEmpty) {
      toast.error('Add items to the cart first');
      return;
    }
    setCartExpanded(false);
    setStep('checkout');
  };

  const backToRegister = () => {
    setCartExpanded(false);
    setStep('register');
  };

  const proceedToPayment = () => setStep('payment');

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
      setStep('success');
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

  const startNewOrder = () => setStep('register');

  return (
    <div className="flex h-full min-h-0 flex-col bg-background lg:flex-row">
      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
          inCheckoutFlow ? 'hidden lg:flex lg:opacity-40' : ''
        }`}
      >
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

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-outline-variant px-inset-sm py-inset-xs">
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

        <div className="grid min-h-0 flex-1 grid-cols-2 gap-inset-sm overflow-auto p-inset-md md:grid-cols-3 lg:grid-cols-4">
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

      <aside
        className={`flex min-h-0 w-full flex-col bg-surface lg:w-96 ${
          inCheckoutFlow
            ? 'flex-1 border-t-0 lg:max-w-md lg:flex-none lg:border-l lg:border-outline-variant'
            : 'border-t border-outline-variant lg:border-l lg:border-t-0'
        }`}
      >
        {step === 'register' && (
          <>
            <div className="shrink-0 border-b border-outline-variant px-inset-md py-inset-sm">
              <h3 className="text-title-md font-semibold">Current order</h3>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-inset-md">
              <CartLines lines={cart.lines} onUpdateQuantity={cart.updateQuantity} />
            </div>
            <div className="shrink-0 space-y-1 border-t border-outline-variant p-inset-md pb-[max(1rem,env(safe-area-inset-bottom))] text-body-sm">
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
          </>
        )}

        {inCheckoutFlow && (
          <>
            <StepProgress step={step} />
            <OrderSummaryBar
              lines={cart.lines}
              total={cart.pricing.total}
              expanded={cartExpanded}
              onToggle={() => setCartExpanded((open) => !open)}
            />

            {cartExpanded && (
              <div className="max-h-52 shrink-0 space-y-inset-sm overflow-auto border-b border-outline-variant px-inset-md pb-inset-md pt-inset-sm">
                <CartLines lines={cart.lines} onUpdateQuantity={cart.updateQuantity} />
                <button
                  type="button"
                  onClick={backToRegister}
                  className="flex min-h-[44px] w-full items-center justify-center gap-1 rounded-lg border border-outline-variant text-label-md font-semibold text-primary"
                >
                  <MaterialIcon name="edit" size={18} />
                  Back to menu &amp; edit order
                </button>
              </div>
            )}

            <div className="flex min-h-0 flex-1 flex-col overflow-auto">
              {step === 'checkout' && (
                <div className="flex flex-1 flex-col px-inset-md py-inset-lg">
                  <h3 className="text-headline-md font-bold text-on-surface">How is this order served?</h3>
                  <p className="mt-inset-xs text-body-sm text-on-surface-variant">
                    Choose order type, then continue to payment.
                  </p>

                  <div className="mt-inset-lg grid gap-inset-sm">
                    {(['counter', 'pickup', 'dine_in'] as InStoreFulfillmentType[]).map((type) => {
                      const selected = fulfillmentType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFulfillmentType(type)}
                          className={`flex min-h-[56px] items-center gap-inset-md rounded-xl border-2 px-inset-md text-left transition-colors ${
                            selected
                              ? 'border-primary-container bg-primary-container/10'
                              : 'border-outline-variant bg-surface-container-lowest hover:border-outline'
                          }`}
                        >
                          <MaterialIcon
                            name={
                              type === 'counter'
                                ? 'storefront'
                                : type === 'pickup'
                                  ? 'shopping_bag'
                                  : 'restaurant'
                            }
                            className={selected ? 'text-primary-container' : 'text-on-surface-variant'}
                          />
                          <span className="text-body-md font-semibold">{fulfillmentLabel(type)}</span>
                          {selected && (
                            <MaterialIcon name="check_circle" className="ml-auto text-primary-container" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {fulfillmentType === 'dine_in' && (
                    <label className="mt-inset-lg block">
                      <span className="text-label-md font-semibold text-on-surface">Table number</span>
                      <input
                        value={tableLabel}
                        onChange={(e) => setTableLabel(e.target.value)}
                        placeholder="e.g. 12"
                        className="mt-inset-xs w-full rounded-lg border border-outline-variant px-3 py-3 text-body-md"
                      />
                    </label>
                  )}

                  <label className="mt-inset-md block">
                    <span className="text-label-md font-semibold text-on-surface">Guest name</span>
                    <span className="text-label-sm text-on-surface-variant"> (optional)</span>
                    <input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="For pickup or receipt"
                      className="mt-inset-xs w-full rounded-lg border border-outline-variant px-3 py-3 text-body-md"
                    />
                  </label>
                </div>
              )}

              {step === 'payment' && (
                <div className="flex flex-1 flex-col px-inset-md py-inset-lg">
                  <h3 className="text-headline-md font-bold text-on-surface">Take payment</h3>
                  <p className="mt-inset-xs text-body-sm text-on-surface-variant">
                    {fulfillmentLabel(fulfillmentType)}
                    {guestName ? ` · ${guestName}` : ''}
                    {tableLabel ? ` · Table ${tableLabel}` : ''}
                  </p>
                  <p className="mt-inset-md text-headline-lg font-bold text-primary-container">
                    {formatJmd(cart.pricing.total)}
                  </p>

                  <div className="mt-inset-lg grid grid-cols-2 gap-inset-sm">
                    {(['card', 'cash'] as PosPaymentMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(method);
                          setTerminalReady(false);
                          setPendingOrderId(null);
                        }}
                        className={`flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-xl border-2 text-title-md font-semibold capitalize ${
                          paymentMethod === method
                            ? 'border-primary-container bg-primary-container/10'
                            : 'border-outline-variant'
                        }`}
                      >
                        <MaterialIcon
                          name={method === 'card' ? 'credit_card' : 'payments'}
                          className="text-2xl"
                        />
                        {method}
                      </button>
                    ))}
                  </div>

                  {paymentMethod === 'card' && (
                    <div className="mt-inset-lg rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-inset-md text-center">
                      <MaterialIcon name="contactless" className="text-4xl text-primary-container" />
                      <p className="mt-inset-sm text-body-sm font-semibold">Stripe Terminal</p>
                      <p className="text-label-sm text-on-surface-variant">
                        {terminalReady || !useApi
                          ? 'Tap or insert card on the reader'
                          : 'Tap Complete sale to connect the reader'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="shrink-0 flex gap-inset-sm border-t border-outline-variant p-inset-md pb-[max(1rem,env(safe-area-inset-bottom))]">
              {step === 'checkout' ? (
                <>
                  <button
                    type="button"
                    onClick={backToRegister}
                    className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-outline-variant text-label-md font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={proceedToPayment}
                    className="flex min-h-[52px] flex-[2] items-center justify-center rounded-xl bg-primary-container text-label-md font-semibold text-on-primary"
                  >
                    Continue to payment
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setStep('checkout')}
                    className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-outline-variant text-label-md font-semibold"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={completeSale}
                    className="flex min-h-[52px] flex-[2] items-center justify-center rounded-xl bg-primary-container text-label-md font-semibold text-on-primary disabled:opacity-60"
                  >
                    {submitting
                      ? 'Processing…'
                      : paymentMethod === 'card' && useApi && !terminalReady
                        ? 'Connect reader'
                        : 'Complete sale'}
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {step === 'success' && (
          <div className="flex flex-1 flex-col items-center justify-center px-inset-lg py-inset-xl text-center">
            <MaterialIcon name="check_circle" className="text-5xl text-primary-container" />
            <h3 className="mt-inset-sm text-headline-md font-bold">Payment successful</h3>
            <p className="text-body-md text-on-surface-variant">Order #{lastOrderNumber}</p>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Receipt {useApi ? 'sent to printer' : 'preview mode'}
            </p>
            <button
              type="button"
              onClick={startNewOrder}
              className="mt-inset-xl min-h-[52px] w-full max-w-xs rounded-xl bg-primary-container text-label-md font-semibold text-on-primary"
            >
              New order
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
