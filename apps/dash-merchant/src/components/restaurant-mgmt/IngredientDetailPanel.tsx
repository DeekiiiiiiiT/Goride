import { useState } from 'react';
import { toast } from 'sonner';
import type { Ingredient } from '../../types/restaurant-mgmt';

interface IngredientDetailPanelProps {
  ingredient: Ingredient | null;
  useApi: boolean;
  onAdjustStock: (delta: number, reason: string) => Promise<void>;
}

export default function IngredientDetailPanel({
  ingredient,
  useApi,
  onAdjustStock,
}: IngredientDetailPanelProps) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('manual_adjustment');
  const [saving, setSaving] = useState(false);

  if (!ingredient) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-outline-variant p-inset-md text-center text-body-sm text-on-surface-variant">
        Select an ingredient
      </div>
    );
  }

  const handleAdjust = async () => {
    const value = Number(delta);
    if (!value || Number.isNaN(value)) {
      toast.error('Enter a valid adjustment amount');
      return;
    }
    setSaving(true);
    try {
      await onAdjustStock(value, reason);
      setDelta('');
      toast.success('Stock updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Stock update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md">
      <h3 className="text-title-md font-semibold">{ingredient.name}</h3>
      <dl className="mt-inset-sm space-y-2 text-body-sm">
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">On hand</dt>
          <dd className="font-semibold">
            {ingredient.quantityOnHand} {ingredient.unit}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Reorder at</dt>
          <dd>{ingredient.reorderLevel} {ingredient.unit}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-on-surface-variant">Cost / unit</dt>
          <dd>J${ingredient.costPerUnit}</dd>
        </div>
      </dl>

      <div className="mt-inset-md space-y-inset-sm border-t border-outline-variant pt-inset-md">
        <p className="text-label-md font-semibold">Adjust stock</p>
        <input
          type="number"
          value={delta}
          onChange={(e) => setDelta(e.target.value)}
          placeholder="+10 or -5"
          className="w-full rounded-lg border border-outline-variant px-3 py-2"
        />
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-outline-variant px-3 py-2"
        >
          <option value="manual_adjustment">Manual adjustment</option>
          <option value="delivery_received">Delivery received</option>
          <option value="waste">Waste / spoilage</option>
        </select>
        <button
          type="button"
          disabled={saving || !useApi}
          onClick={handleAdjust}
          className="w-full rounded-lg bg-primary-container py-2 text-label-md font-semibold text-on-primary disabled:opacity-50"
        >
          Apply adjustment
        </button>
      </div>
    </div>
  );
}
