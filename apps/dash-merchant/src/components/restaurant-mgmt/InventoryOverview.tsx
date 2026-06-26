import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import type { Ingredient } from '../../types/restaurant-mgmt';

interface InventoryOverviewProps {
  ingredients: Ingredient[];
  onOpenIngredients: () => void;
  onOpenRecipes: () => void;
}

export default function InventoryOverview({
  ingredients,
  onOpenIngredients,
  onOpenRecipes,
}: InventoryOverviewProps) {
  const lowStock = ingredients.filter((i) => i.quantityOnHand <= i.reorderLevel);
  const totalValue = ingredients.reduce(
    (sum, i) => sum + i.quantityOnHand * i.costPerUnit,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-inset-lg p-margin-mobile md:p-margin-tablet">
      <div className="grid gap-inset-md sm:grid-cols-3">
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Ingredients</p>
          <p className="text-headline-lg font-bold">{ingredients.length}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Low stock</p>
          <p className="text-headline-lg font-bold text-error">{lowStock.length}</p>
        </div>
        <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
          <p className="text-label-sm text-on-surface-variant">Stock value</p>
          <p className="text-headline-lg font-bold">{formatJmd(totalValue)}</p>
        </div>
      </div>

      {lowStock.length > 0 && (
        <section className="rounded-xl border border-error-container bg-error-container/10 p-inset-md">
          <p className="text-title-md font-semibold text-error">Reorder soon</p>
          <ul className="mt-inset-sm space-y-1 text-body-sm text-on-surface">
            {lowStock.map((item) => (
              <li key={item.id}>
                {item.name} — {item.quantityOnHand} {item.unit} left
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-inset-md sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenIngredients}
          className="flex items-center gap-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:bg-surface-container-low"
        >
          <MaterialIcon name="grocery" className="text-3xl text-primary-container" />
          <div>
            <p className="text-title-md font-semibold">Ingredients</p>
            <p className="text-body-sm text-on-surface-variant">Track stock levels</p>
          </div>
        </button>
        <button
          type="button"
          onClick={onOpenRecipes}
          className="flex items-center gap-inset-md rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md text-left transition-colors hover:bg-surface-container-low"
        >
          <MaterialIcon name="menu_book" className="text-3xl text-primary-container" />
          <div>
            <p className="text-title-md font-semibold">Recipes</p>
            <p className="text-body-sm text-on-surface-variant">Bill of materials per menu item</p>
          </div>
        </button>
      </div>
    </div>
  );
}
