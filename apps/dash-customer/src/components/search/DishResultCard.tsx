import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { formatJmd } from '@/lib/restaurantContent';
import type { DishSearchResult } from '@/lib/searchDishes';

type Props = {
  dish: DishSearchResult;
  onAdd: (dish: DishSearchResult) => void;
  onOpenRestaurant: (merchantId: string) => void;
};

export function DishResultCard({ dish, onAdd, onOpenRestaurant }: Props) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden flex gap-4 p-3">
      <button
        type="button"
        onClick={() => onOpenRestaurant(dish.merchantId)}
        className="shrink-0 w-24 h-24 rounded-lg overflow-hidden"
      >
        <img src={dish.image} alt={dish.name} className="w-full h-full object-cover" />
      </button>
      <div className="flex-1 min-w-0 flex flex-col justify-between py-1">
        <div>
          <h3 className="text-headline-sm font-semibold text-on-surface truncate">{dish.name}</h3>
          <button
            type="button"
            onClick={() => onOpenRestaurant(dish.merchantId)}
            className="text-body-sm text-on-surface-variant hover:text-primary truncate text-left"
          >
            {dish.merchantName}
          </button>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-headline-sm font-semibold">{formatJmd(dish.price)}</span>
          <button
            type="button"
            onClick={() => onAdd(dish)}
            className="bg-primary text-on-primary px-4 py-2 rounded-lg text-label-md font-semibold flex items-center gap-1 active:scale-95 transition-transform"
          >
            <MaterialIcon name="add" className="text-[18px]" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
