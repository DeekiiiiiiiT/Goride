import { MaterialIcon } from '../icons/MaterialIcon';

type Props = {
  open: boolean;
  currentRestaurant: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export function NewCartModal({ open, currentRestaurant, onConfirm, onCancel }: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-on-surface/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md bg-surface-container-lowest sm:rounded-2xl rounded-t-3xl shadow-[0px_10px_30px_rgba(0,0,0,0.08)] overflow-hidden animate-slide-up">
        <div className="w-full flex justify-center pt-4 pb-2 sm:hidden">
          <div className="w-12 h-1.5 bg-surface-variant rounded-full" />
        </div>

        <div className="px-margin-mobile pt-4 sm:pt-inset-lg pb-2 text-center flex flex-col items-center">
          <div className="w-12 h-12 rounded-full bg-error-container/30 flex items-center justify-center mb-4 text-error">
            <MaterialIcon name="shopping_cart_off" filled className="text-[28px]" />
          </div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Start a new cart?</h2>
        </div>

        <div className="px-margin-mobile py-4 text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            You have items from <span className="font-bold text-on-surface">{currentRestaurant}</span>. Adding this item
            will clear your current cart.
          </p>
        </div>

        <div className="px-margin-mobile pb-inset-lg pt-4 flex flex-col gap-3">
          <button
            type="button"
            onClick={onConfirm}
            className="w-full py-3.5 px-4 bg-primary-container text-on-primary-container font-label-md text-label-md rounded-lg active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
          >
            <MaterialIcon name="delete_sweep" className="text-[18px]" />
            Clear Cart &amp; Add
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-full py-3.5 px-4 bg-transparent border border-outline text-primary font-label-md text-label-md rounded-lg active:bg-surface-variant/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
