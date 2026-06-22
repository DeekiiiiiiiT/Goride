import { formatJmd } from '@/lib/restaurantContent';
import { MaterialIcon } from '@/components/icons/MaterialIcon';

type Props = {
  itemCount: number;
  total: number;
  onClick: () => void;
  hasBottomNav?: boolean;
  variant?: 'default' | 'store';
};

export function FloatingCartBar({
  itemCount,
  total,
  onClick,
  hasBottomNav = true,
  variant = 'default',
}: Props) {
  if (itemCount === 0) return null;

  const isStore = variant === 'store';

  return (
    <div
      className={`fixed left-0 right-0 z-40 safe-x pointer-events-none flex justify-center ${
        hasBottomNav ? 'bottom-[var(--app-bottom-nav-total)]' : 'safe-b'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className={`pointer-events-auto flex w-full max-w-md items-center justify-between shadow-xl transition-all duration-150 active:scale-[0.98] ${
          isStore
            ? 'mx-4 h-14 rounded-xl bg-primary-container px-6 text-on-primary-container'
            : 'max-w-sm rounded-xl bg-primary-container px-4 py-3 text-on-primary'
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex items-center justify-center font-bold ${
              isStore
                ? 'h-8 w-8 rounded-lg bg-on-primary-container/20 text-label-lg'
                : 'h-7 w-7 rounded-full bg-white/20 text-sm'
            }`}
          >
            {itemCount}
          </span>
          {isStore ? (
            <span className="text-label-lg font-semibold">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {formatJmd(total)}
            </span>
          ) : (
            <span className="font-label-md text-label-md">View Cart</span>
          )}
        </div>
        {isStore ? (
          <div className="flex items-center gap-2">
            <span className="text-headline-md font-bold">View cart</span>
            <MaterialIcon name="shopping_cart_checkout" />
          </div>
        ) : (
          <span>{formatJmd(total)}</span>
        )}
      </button>
    </div>
  );
}
