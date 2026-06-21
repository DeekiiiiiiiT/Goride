import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { TrackingOrder } from '@/lib/trackingContent';
import { formatJmd, TRACKING_MAP_IMAGES } from '@/lib/trackingContent';

type Props = {
  order: TrackingOrder;
  onClose: () => void;
};

export function PreparingTrackingView({ order, onClose }: Props) {
  return (
    <div className="app-fullscreen-screen safe-x safe-t bg-background flex flex-col">
      <header className="bg-surface shadow-sm flex justify-between items-center safe-x h-16 shrink-0 z-40">
        <button type="button" onClick={onClose} className="text-primary active:scale-95 transition-transform">
          <MaterialIcon name="close" />
        </button>
        <h1 className="text-headline-md font-bold text-primary text-center flex-1">Order #{order.orderNumber}</h1>
        <div className="w-6" />
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain flex flex-col gap-6 px-4 pt-6 pb-safe">
        <section className="w-full">
          <div className="flex items-center justify-between relative mb-2">
            <div className="absolute top-1/2 left-0 w-full h-1 bg-surface-variant -translate-y-1/2 rounded-full" />
            <div className="absolute top-1/2 left-0 w-[50%] h-1 tracking-progress-bar -translate-y-1/2 rounded-full" />
            <StepDot filled icon="check" />
            <StepDot active pulse />
            <StepDot />
            <StepDot />
          </div>
          <div className="flex justify-between text-label-sm text-on-surface-variant mt-2 px-1">
            <span className="text-primary font-semibold">Confirmed</span>
            <span className="text-primary-container font-bold">Preparing</span>
            <span className="translate-x-3">Driving</span>
            <span>Arrived</span>
          </div>
        </section>

        <section className="bg-surface-container-lowest rounded-[24px] shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4 flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-secondary-fixed flex items-center justify-center">
            <MaterialIcon name="skillet" className="text-secondary text-[32px]" filled />
          </div>
          <div>
            <h2 className="text-headline-lg-mobile font-bold text-on-surface">Preparing your food</h2>
            <p className="text-body-lg text-on-surface-variant mt-1">
              {order.merchantName} is getting your order ready.
            </p>
          </div>
          <div className="bg-surface-container px-4 py-2 rounded-xl w-full">
            <span className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
              Estimated Ready
            </span>
            <p className="text-headline-md font-bold text-primary">15 min</p>
          </div>
        </section>

        <section className="rounded-xl overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)] bg-surface-container-lowest h-48 relative">
          <img src={TRACKING_MAP_IMAGES.preparing} alt="Map" className="w-full h-full object-cover" />
          <div className="absolute bottom-4 left-4 right-4 bg-surface-container-lowest/90 backdrop-blur-md rounded-lg p-2 shadow-sm flex items-center gap-2">
            <img src={order.merchantImage} alt={order.merchantName} className="w-10 h-10 rounded-full object-cover" />
            <div className="flex-1 min-w-0">
              <p className="text-label-md font-semibold text-on-surface truncate">{order.merchantName}</p>
              <p className="text-body-sm text-on-surface-variant truncate">{order.merchantAddress}</p>
            </div>
            <button type="button" className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-primary shadow-sm">
              <MaterialIcon name="near_me" className="text-[20px]" />
            </button>
          </div>
        </section>

        <OrderSummaryAccordion order={order} />

        <section className="flex flex-col gap-2 mb-8">
          <button type="button" className="w-full py-3 rounded-lg border border-primary text-primary font-semibold text-label-md">
            Cancel Order
          </button>
          <button type="button" className="w-full py-3 text-on-surface-variant text-body-md">
            Need Help?
          </button>
        </section>
      </main>
    </div>
  );
}

function StepDot({ filled, active, pulse, icon }: { filled?: boolean; active?: boolean; pulse?: boolean; icon?: string }) {
  if (filled) {
    return (
      <div className="z-10 w-6 h-6 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-sm">
        <MaterialIcon name={icon ?? 'check'} className="text-[16px]" filled />
      </div>
    );
  }
  if (active) {
    return (
      <div className={`z-10 w-6 h-6 rounded-full bg-primary-container flex items-center justify-center border-2 border-surface shadow-sm ${pulse ? 'tracking-pulse-ring' : ''}`}>
        <div className="w-2 h-2 rounded-full bg-on-primary-container" />
      </div>
    );
  }
  return <div className="z-10 w-6 h-6 rounded-full bg-surface-container-highest border border-outline-variant" />;
}

function OrderSummaryAccordion({ order }: { order: TrackingOrder }) {
  return (
    <section className="bg-surface-container-lowest rounded-[24px] shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
      <details className="group">
        <summary className="flex justify-between items-center p-4 cursor-pointer list-none">
          <div className="flex items-center gap-2 text-on-surface">
            <MaterialIcon name="receipt_long" className="text-outline" />
            <span className="text-headline-sm font-semibold">Order Summary</span>
          </div>
          <MaterialIcon name="expand_more" className="text-outline transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-4 pb-4 flex flex-col gap-4 border-t border-surface-variant mx-4">
          <div className="pt-4 flex flex-col">
            {order.items.map((item, idx) => (
              <div
                key={idx}
                className={`flex justify-between items-start py-2 ${idx > 0 ? 'border-t border-surface-variant/50' : ''}`}
              >
                <div className="flex gap-2">
                  <span className="text-label-md font-semibold bg-surface-container text-on-surface-variant px-2 py-1 rounded">
                    {item.quantity}x
                  </span>
                  <div>
                    <p className="text-body-md font-medium text-on-surface">{item.name}</p>
                    {item.note && <p className="text-body-sm text-outline">{item.note}</p>}
                  </div>
                </div>
                <span className="text-body-md text-on-surface">{formatJmd(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 pt-4 border-t border-surface-variant text-body-sm text-on-surface-variant">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatJmd(order.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>Taxes &amp; Fees</span>
              <span>{formatJmd(order.fees)}</span>
            </div>
            <div className="flex justify-between text-headline-sm font-semibold text-on-surface mt-1">
              <span>Total Paid</span>
              <span>{formatJmd(order.total)}</span>
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}

export { OrderSummaryAccordion };
