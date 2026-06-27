import { useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import type { Ingredient } from '../../types/restaurant-mgmt';
import IngredientDetailPanel from './IngredientDetailPanel';

interface IngredientsListProps {
  ingredients: Ingredient[];
  useApi: boolean;
  onRefresh: () => void;
  onCreateIngredient: (input: {
    name: string;
    unit: string;
    quantityOnHand: number;
    reorderLevel: number;
    costPerUnit: number;
  }) => Promise<void>;
  onAdjustStock: (ingredientId: string, delta: number, reason: string) => Promise<void>;
  onDeleteIngredient: (ingredientId: string) => Promise<void>;
}

export default function IngredientsList({
  ingredients,
  useApi,
  onRefresh,
  onCreateIngredient,
  onAdjustStock,
  onDeleteIngredient,
}: IngredientsListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('each');
  const [saving, setSaving] = useState(false);

  const selected = ingredients.find((i) => i.id === selectedId) ?? null;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await onCreateIngredient({
        name: newName.trim(),
        unit: newUnit,
        quantityOnHand: 0,
        reorderLevel: 10,
        costPerUnit: 0,
      });
      setNewName('');
      setShowAdd(false);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-inset-md p-margin-mobile md:flex-row md:p-margin-tablet">
      <div className="min-w-0 flex-1 space-y-inset-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-title-lg font-semibold">Ingredients</h2>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="flex items-center gap-1 rounded-lg bg-primary-container px-3 py-2 text-label-md font-semibold text-on-primary"
          >
            <MaterialIcon name="add" className="text-[18px]" />
            Add
          </button>
        </div>

        {showAdd && (
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-md space-y-inset-sm">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ingredient name"
              className="w-full rounded-lg border border-outline-variant px-3 py-2"
            />
            <input
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value)}
              placeholder="Unit (each, oz, lb)"
              className="w-full rounded-lg border border-outline-variant px-3 py-2"
            />
            <button
              type="button"
              disabled={saving || !useApi}
              onClick={handleCreate}
              className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary disabled:opacity-50"
            >
              Save ingredient
            </button>
          </div>
        )}

        <ul className="divide-y divide-outline-variant overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {ingredients.map((item) => {
            const low = item.quantityOnHand <= item.reorderLevel;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-center justify-between px-inset-md py-3 text-left hover:bg-surface-container-low ${
                    selectedId === item.id ? 'bg-primary-container/10' : ''
                  }`}
                >
                  <div>
                    <p className="text-body-md font-semibold">{item.name}</p>
                    <p className="text-label-sm text-on-surface-variant">
                      {item.quantityOnHand} {item.unit}
                    </p>
                  </div>
                  {low && (
                    <span className="rounded-full bg-error-container px-2 py-0.5 text-label-sm text-error">
                      Low
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="w-full md:w-80">
        <IngredientDetailPanel
          ingredient={selected}
          useApi={useApi}
          onAdjustStock={async (delta, reason) => {
            if (!selected) return;
            await onAdjustStock(selected.id, delta, reason);
            onRefresh();
          }}
          onDelete={async () => {
            if (!selected) return;
            await onDeleteIngredient(selected.id);
            setSelectedId(null);
            onRefresh();
          }}
        />
      </div>
    </div>
  );
}
