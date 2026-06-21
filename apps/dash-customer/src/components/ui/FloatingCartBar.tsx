import { formatJmd } from '@/lib/restaurantContent';

type Props = {
  itemCount: number;
  total: number;
  onClick: () => void;
  hasBottomNav?: boolean;
};

export function FloatingCartBar({ itemCount, total, onClick, hasBottomNav = true }: Props) {
  if (itemCount === 0) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-40 safe-x pointer-events-none flex justify-center ${
        hasBottomNav ? 'bottom-[var(--app-bottom-nav-total)]' : 'safe-b'
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        className="w-full max-w-sm btn-touch bg-primary-container text-on-primary rounded-xl py-3 px-4 shadow-[0px_10px_30px_rgba(0,0,0,0.12)] pointer-events-auto active:scale-[0.98] transition-transform duration-150 flex items-center justify-between font-label-md text-label-md"
      >
        <div className="flex items-center gap-2">
          <span className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
            {itemCount}
          </span>
          <span>View Cart</span>
        </div>
        <span>{formatJmd(total)}</span>
      </button>
    </div>
  );
}
