import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/restaurantContent';
import { REORDER_PREVIEW, type OrderLineItem } from '@/lib/ordersContent';

type Props = {
  open: boolean;
  onClose: () => void;
  onAddToCart: () => void;
  onViewMenu: () => void;
  merchantName?: string;
  merchantLogo?: string;
  items?: OrderLineItem[];
  estimatedTotal?: number;
  distance?: string;
};

export function ReorderSheet({
  open,
  onClose,
  onAddToCart,
  onViewMenu,
  merchantName,
  merchantLogo,
  items,
  estimatedTotal,
  distance,
}: Props) {
  if (!open) return null;

  const preview = {
    merchantName: merchantName ?? REORDER_PREVIEW.merchantName,
    merchantLogo: merchantLogo ?? REORDER_PREVIEW.merchantLogo,
    distance: distance ?? REORDER_PREVIEW.distance,
    items: items ?? REORDER_PREVIEW.items,
    estimatedTotal: estimatedTotal ?? REORDER_PREVIEW.estimatedTotal,
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="modal-overlay absolute inset-0 bg-inverse-surface/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="modal-content relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-[24px] bg-surface-container-lowest shadow-[0px_10px_30px_rgba(0,0,0,0.08)] sm:max-w-md sm:rounded-[24px]">
        <div className="flex w-full justify-center pt-4 pb-2 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-surface-variant" />
        </div>

        <div className="relative flex items-center justify-between border-b border-surface-container-highest/50 px-4 pt-2 pb-4">
          <h2 className="pr-10 text-headline-sm font-semibold">Reorder from {preview.merchantName}?</h2>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant"
          >
            <MaterialIcon name="close" className="text-[20px]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mb-6 flex items-center gap-2">
            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-container-high shadow-sm">
              {preview.merchantLogo ? (
                <img src={preview.merchantLogo} alt={preview.merchantName} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <MaterialIcon name="storefront" className="text-outline" />
                </div>
              )}
            </div>
            <div>
              <span className="block text-body-md font-medium">{preview.merchantName}</span>
              {preview.distance ? (
                <span className="flex items-center gap-1 text-body-sm text-on-surface-variant">
                  <MaterialIcon name="location_on" className="text-[14px]" />
                  {preview.distance}
                </span>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-surface-container bg-surface-container-low p-4">
            <h3 className="mb-4 text-label-md font-semibold tracking-wider text-on-surface-variant uppercase">
              Previous Order
            </h3>
            <ul className="space-y-2">
              {preview.items.map((item, index) => (
                <li key={`${item.name}-${index}`}>
                  {index > 0 && <div className="my-2 ml-10 h-px w-full bg-surface-container-highest" />}
                  <div className="flex items-start justify-between gap-4 py-1">
                    <div className="flex items-start gap-4">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary/10 text-label-md font-semibold text-primary">
                        {item.quantity}
                      </div>
                      <div>
                        <span className="block text-body-md">{item.name}</span>
                        {item.note && <span className="text-body-sm text-on-surface-variant">{item.note}</span>}
                      </div>
                    </div>
                    <span className="text-body-md font-medium whitespace-nowrap">
                      {formatJmd(item.price * item.quantity)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6 flex items-start gap-2 rounded-lg border border-error-container/50 bg-error-container/30 p-4">
            <MaterialIcon name="info" className="mt-0.5 shrink-0 text-[20px] text-error" />
            <p className="text-body-sm leading-relaxed text-on-surface-variant">
              Some items may have changed prices or availability since your last order. We&apos;ll update your cart with
              current details.
            </p>
          </div>
        </div>

        <div className="border-t border-surface-container-highest bg-surface-container-lowest p-4 pt-4 pb-safe">
          <button
            type="button"
            onClick={onAddToCart}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-primary text-headline-sm font-semibold text-on-primary shadow-sm hover:opacity-90 active:scale-[0.98]"
          >
            <MaterialIcon name="add_shopping_cart" className="text-[20px]" />
            Add to Cart
            <span className="mr-2 ml-auto text-body-md font-normal text-on-primary/80">
              Est. {formatJmd(preview.estimatedTotal)}
            </span>
          </button>
          <button
            type="button"
            onClick={onViewMenu}
            className="mt-2 w-full py-2 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
          >
            View Menu Instead
          </button>
        </div>
      </div>
    </div>
  );
}
