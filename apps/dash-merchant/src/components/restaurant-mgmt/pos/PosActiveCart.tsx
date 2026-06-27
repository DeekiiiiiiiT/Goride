import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { formatJmd } from '../../../lib/partner-utils';
import type { PosCartLine, InStoreFulfillmentType, PosPaymentMethod } from '../../../types/restaurant-mgmt';
import type { PosStep } from './pos-types';

interface PosActiveCartProps {
  step: PosStep;
  lines: PosCartLine[];
  orderNumber: string;
  subtotal: number;
  tax: number;
  total: number;
  taxRate: number;
  submitting: boolean;
  fulfillmentType: InStoreFulfillmentType;
  guestName: string;
  tableLabel: string;
  paymentMethod: PosPaymentMethod;
  terminalReady: boolean;
  useApi: boolean;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onClearCart: () => void;
  onCheckout: () => void;
  onBackToRegister: () => void;
  onProceedToPayment: () => void;
  onFulfillmentChange: (type: InStoreFulfillmentType) => void;
  onGuestNameChange: (value: string) => void;
  onTableLabelChange: (value: string) => void;
  onPaymentMethodChange: (method: PosPaymentMethod) => void;
  onBackToCheckout: () => void;
  onCompleteSale: () => void;
  onNewOrder: () => void;
  lastOrderNumber: string;
}

function fulfillmentLabel(type: InStoreFulfillmentType) {
  if (type === 'dine_in') return 'Dine in';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function lineTotal(line: PosCartLine) {
  const modifierTotal =
    line.modifiers?.reduce((sum, mod) => sum + mod.priceAdjustment, 0) ?? 0;
  return (line.unitPrice + modifierTotal) * line.quantity;
}

function modifierSummary(line: PosCartLine) {
  if (!line.modifiers?.length) return null;
  return line.modifiers.map((mod) => mod.name).join(', ');
}

interface CartLineRowProps {
  line: PosCartLine;
  onUpdateQuantity: (id: string, quantity: number) => void;
}

function CartLineRow({ line, onUpdateQuantity }: CartLineRowProps) {
  const note = modifierSummary(line);

  return (
    <li className="flex min-h-[72px] items-start gap-4 border-b border-surface-variant bg-surface-container-lowest p-4">
      <div className="flex shrink-0 flex-col items-center rounded-lg bg-surface-container">
        <button
          type="button"
          onClick={() => onUpdateQuantity(line.id, line.quantity + 1)}
          className="flex h-8 w-8 items-center justify-center rounded-t-lg text-on-surface-variant transition-colors hover:bg-surface-container-high"
          aria-label={`Add one ${line.name}`}
        >
          <MaterialIcon name="add" size={18} />
        </button>
        <span className="w-8 py-1 text-center text-label-lg">{line.quantity}</span>
        <button
          type="button"
          onClick={() => onUpdateQuantity(line.id, line.quantity - 1)}
          className="flex h-8 w-8 items-center justify-center rounded-b-lg text-on-surface-variant transition-colors hover:bg-surface-container-high"
          aria-label={`Remove one ${line.name}`}
        >
          <MaterialIcon name="remove" size={18} />
        </button>
      </div>
      <div className="min-w-0 flex-1 pt-1">
        <h4 className="text-title-md text-on-surface">{line.name}</h4>
        {note && <p className="mt-1 text-body-md text-on-surface-variant">{note}</p>}
      </div>
      <div className="shrink-0 pt-1 text-right">
        <span className="text-title-md text-on-surface">{formatJmd(lineTotal(line))}</span>
      </div>
    </li>
  );
}

export default function PosActiveCart({
  step,
  lines,
  orderNumber,
  subtotal,
  tax,
  total,
  taxRate,
  submitting,
  fulfillmentType,
  guestName,
  tableLabel,
  paymentMethod,
  terminalReady,
  useApi,
  onUpdateQuantity,
  onClearCart,
  onCheckout,
  onBackToRegister,
  onProceedToPayment,
  onFulfillmentChange,
  onGuestNameChange,
  onTableLabelChange,
  onPaymentMethodChange,
  onBackToCheckout,
  onCompleteSale,
  onNewOrder,
  lastOrderNumber,
}: PosActiveCartProps) {
  const inCheckoutFlow = step === 'checkout' || step === 'payment';

  if (step === 'success') {
    return (
      <aside className="flex h-full w-full min-h-0 flex-1 flex-col border-t border-outline-variant bg-surface-container-low shadow-md lg:w-[40%] lg:flex-none lg:border-l lg:border-t-0">
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
          <MaterialIcon name="check_circle" className="text-5xl text-primary-container" />
          <h3 className="mt-4 text-headline-md font-bold text-on-surface">Payment successful</h3>
          <p className="text-body-md text-on-surface-variant">Order #{lastOrderNumber}</p>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Receipt {useApi ? 'sent to printer' : 'preview mode'}
          </p>
          <button
            type="button"
            onClick={onNewOrder}
            className="mt-8 min-h-[52px] w-full max-w-xs rounded-xl bg-primary text-label-lg font-semibold text-on-primary"
          >
            New order
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full min-h-0 flex-1 flex-col border-t border-outline-variant bg-surface-container-low shadow-md lg:w-[40%] lg:flex-none lg:border-l lg:border-t-0">
      <div className="flex shrink-0 items-start justify-between border-b border-surface-variant bg-surface p-6">
        <div>
          <h2 className="text-headline-md text-on-surface">Active Cart</h2>
          <p className="text-body-md text-on-surface-variant">Order #{orderNumber}</p>
        </div>
        {step === 'register' && (
          <div className="flex gap-2">
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
              title="Add note"
              aria-label="Add note"
            >
              <MaterialIcon name="edit_note" />
            </button>
            <button
              type="button"
              onClick={onClearCart}
              disabled={lines.length === 0}
              className="flex h-10 w-10 items-center justify-center rounded-full text-error transition-colors hover:bg-error-container disabled:opacity-40"
              title="Clear cart"
              aria-label="Clear cart"
            >
              <MaterialIcon name="delete" />
            </button>
          </div>
        )}
      </div>

      {step === 'register' && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto bg-surface-container-low">
            {lines.length === 0 ? (
              <p className="p-6 text-center text-body-md text-on-surface-variant">Cart is empty</p>
            ) : (
              <ul className="flex flex-col">
                {lines.map((line) => (
                  <CartLineRow
                    key={line.id}
                    line={line}
                    onUpdateQuantity={onUpdateQuantity}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="z-20 flex shrink-0 flex-col gap-4 border-t border-surface-variant bg-surface p-6 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-body-lg text-on-surface-variant">
                <span>Subtotal</span>
                <span>{formatJmd(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-body-lg text-on-surface-variant">
                <span>Tax ({taxRate}%)</span>
                <span>{formatJmd(tax)}</span>
              </div>
              <div className="my-2 h-px w-full bg-surface-variant" />
              <div className="flex items-center justify-between text-headline-md text-on-surface">
                <span>Total</span>
                <span className="text-primary">{formatJmd(total)}</span>
              </div>
            </div>
            <button
              type="button"
              disabled={lines.length === 0}
              onClick={onCheckout}
              className="mt-2 flex min-h-[52px] w-full items-center justify-between rounded-xl bg-primary px-6 py-4 text-title-lg text-on-primary shadow-sm transition-all hover:bg-primary-container hover:text-on-primary-container active:scale-[0.98] disabled:opacity-50"
            >
              <span>Checkout</span>
              <span className="flex items-center gap-2">
                {formatJmd(total)}
                <MaterialIcon name="arrow_forward" />
              </span>
            </button>
          </div>
        </>
      )}

      {inCheckoutFlow && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {step === 'checkout' && (
              <div className="flex flex-col px-6 py-6">
                <h3 className="text-headline-md font-bold text-on-surface">How is this order served?</h3>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  Choose order type, then continue to payment.
                </p>

                <div className="mt-6 grid gap-3">
                  {(['counter', 'pickup', 'dine_in'] as InStoreFulfillmentType[]).map((type) => {
                    const selected = fulfillmentType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => onFulfillmentChange(type)}
                        className={`flex min-h-[56px] items-center gap-4 rounded-xl border-2 px-4 text-left transition-colors ${
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
                  <label className="mt-6 block">
                    <span className="text-label-md font-semibold text-on-surface">Table number</span>
                    <input
                      value={tableLabel}
                      onChange={(e) => onTableLabelChange(e.target.value)}
                      placeholder="e.g. 12"
                      className="mt-2 w-full rounded-lg border border-outline-variant px-3 py-3 text-body-md"
                    />
                  </label>
                )}

                <label className="mt-4 block">
                  <span className="text-label-md font-semibold text-on-surface">Guest name</span>
                  <span className="text-label-sm text-on-surface-variant"> (optional)</span>
                  <input
                    value={guestName}
                    onChange={(e) => onGuestNameChange(e.target.value)}
                    placeholder="For pickup or receipt"
                    className="mt-2 w-full rounded-lg border border-outline-variant px-3 py-3 text-body-md"
                  />
                </label>

                {lines.length > 0 && (
                  <div className="mt-6 border-t border-surface-variant pt-4">
                    <p className="mb-3 text-label-md font-semibold text-on-surface-variant">
                      Order summary
                    </p>
                    <ul className="space-y-2">
                      {lines.map((line) => (
                        <li
                          key={line.id}
                          className="flex justify-between text-body-sm text-on-surface-variant"
                        >
                          <span>
                            {line.quantity}× {line.name}
                          </span>
                          <span>{formatJmd(lineTotal(line))}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {step === 'payment' && (
              <div className="flex flex-col px-6 py-6">
                <h3 className="text-headline-md font-bold text-on-surface">Take payment</h3>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  {fulfillmentLabel(fulfillmentType)}
                  {guestName ? ` · ${guestName}` : ''}
                  {tableLabel ? ` · Table ${tableLabel}` : ''}
                </p>
                <p className="mt-4 text-headline-lg font-bold text-primary">{formatJmd(total)}</p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  {(['card', 'cash'] as PosPaymentMethod[]).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => onPaymentMethodChange(method)}
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
                  <div className="mt-6 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-4 text-center">
                    <MaterialIcon name="contactless" className="text-4xl text-primary-container" />
                    <p className="mt-2 text-body-sm font-semibold">Stripe Terminal</p>
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

          <div className="flex shrink-0 gap-3 border-t border-surface-variant bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {step === 'checkout' ? (
              <>
                <button
                  type="button"
                  onClick={onBackToRegister}
                  className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-outline-variant text-label-md font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={onProceedToPayment}
                  className="flex min-h-[52px] flex-[2] items-center justify-center rounded-xl bg-primary text-label-md font-semibold text-on-primary"
                >
                  Continue to payment
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onBackToCheckout}
                  className="flex min-h-[52px] flex-1 items-center justify-center rounded-xl border border-outline-variant text-label-md font-semibold"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onCompleteSale}
                  className="flex min-h-[52px] flex-[2] items-center justify-center rounded-xl bg-primary text-label-md font-semibold text-on-primary disabled:opacity-60"
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
    </aside>
  );
}
