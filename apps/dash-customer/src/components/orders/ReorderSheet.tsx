import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/restaurantContent';
import { REORDER_PREVIEW } from '@/lib/ordersContent';

type Props = {
  open: boolean;
  onClose: () => void;
  onAddToCart: () => void;
  onViewMenu: () => void;
};

export function ReorderSheet({ open, onClose, onAddToCart, onViewMenu }: Props) {
  if (!open) return null;

  const { merchantName, merchantLogo, distance, items, estimatedTotal } = REORDER_PREVIEW;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-inverse-surface/60 backdrop-blur-sm modal-overlay"
        onClick={onClose}
      />
      <div className="relative z-10 w-full sm:max-w-md bg-surface-container-lowest rounded-t-[24px] sm:rounded-[24px] shadow-[0px_10px_30px_rgba(0,0,0,0.08)] modal-content flex flex-col overflow-hidden max-h-[90vh]">
        <div className="w-full flex justify-center pt-4 pb-2 sm:hidden">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>

        <div className="relative px-4 pt-2 pb-4 flex items-center justify-between border-b border-surface-container-highest/50">
          <h2 className="text-headline-sm font-semibold pr-10">Reorder from {merchantName}?</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="absolute right-4 w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="px-4 py-6 overflow-y-auto flex-1">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-12 h-12 rounded-lg bg-surface-container-high overflow-hidden shrink-0 shadow-sm">
              <img src={merchantLogo} alt={merchantName} className="w-full h-full object-cover" />
            </div>
            <div>
              <span className="text-body-md font-medium block">{merchantName}</span>
              <span className="text-body-sm text-on-surface-variant flex items-center gap-1">
                <MaterialIcon name="location_on" className="text-[14px]" />
                {distance}
              </span>
            </div>
          </div>

          <div className="bg-surface-container-low rounded-xl p-4 border border-surface-container">
            <h3 className="text-label-md font-semibold text-on-surface-variant uppercase tracking-wider mb-4">
              Previous Order
            </h3>
            <ul className="space-y-2">
              {items.map((item, index) => (
                <li key={item.name}>
                  {index > 0 && <div className="h-px bg-surface-container-highest w-full ml-10 my-2" />}
                  <div className="flex items-start justify-between gap-4 py-1">
                    <div className="flex items-start gap-4">
                      <div className="w-6 h-6 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 text-label-md font-semibold mt-0.5">
                        {item.quantity}
                      </div>
                      <div>
                        <span className="text-body-md block">{item.name}</span>
                        {item.note && <span className="text-body-sm text-on-surface-variant">{item.note}</span>}
                      </div>
                    </div>
                    <span className="text-body-md font-medium whitespace-nowrap">{formatJmd(item.price * item.quantity)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 bg-error-container/30 border border-error-container/50 rounded-lg p-4 flex items-start gap-2">
            <MaterialIcon name="info" className="text-error text-[20px] shrink-0 mt-0.5" />
            <p className="text-body-sm text-on-surface-variant leading-relaxed">
              Some items may have changed prices or availability since your last order. We&apos;ll update your cart with
              current details.
            </p>
          </div>
        </div>

        <div className="p-4 bg-surface-container-lowest border-t border-surface-container-highest pb-safe pt-4">
          <button
            type="button"
            onClick={onAddToCart}
            className="w-full h-14 bg-primary text-on-primary rounded-lg text-headline-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] shadow-sm"
          >
            <MaterialIcon name="add_shopping_cart" className="text-[20px]" />
            Add to Cart
            <span className="ml-auto mr-2 font-normal text-on-primary/80 text-body-md">
              Est. {formatJmd(estimatedTotal)}
            </span>
          </button>
          <button
            type="button"
            onClick={onViewMenu}
            className="w-full mt-2 py-2 text-label-md font-semibold text-on-surface-variant hover:text-on-surface transition-colors"
          >
            View Menu Instead
          </button>
        </div>
      </div>
    </div>
  );
}
