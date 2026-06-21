import { formatJmd } from '../../lib/restaurantContent';

type Props = {
  itemCount: number;
  total: number;
  onClick: () => void;
};

export function ViewCartBar({ itemCount, total, onClick }: Props) {
  if (itemCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 w-full z-50 px-margin-mobile py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-surface via-surface to-transparent pointer-events-none flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="w-full max-w-sm bg-primary-container text-on-primary rounded-xl py-3 px-4 shadow-[0px_10px_30px_rgba(0,0,0,0.08)] pointer-events-auto active:scale-[0.98] transition-transform duration-150 flex items-center justify-between font-label-md text-label-md"
      >
        <div className="flex items-center gap-2">
          <span className="bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-xs">{itemCount}</span>
          <span>View Cart</span>
        </div>
        <span>{formatJmd(total)}</span>
      </button>
    </div>
  );
}
