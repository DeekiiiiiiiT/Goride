import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Ingredient, RecipeLine } from '../../types/restaurant-mgmt';

interface MenuItemOption {
  id: string;
  name: string;
}

interface RecipeEditorProps {
  menuItems: MenuItemOption[];
  ingredients: Ingredient[];
  recipes: RecipeLine[];
  useApi: boolean;
  onSave: (menuItemId: string, lines: Array<{ ingredientId: string; quantityPerServing: number }>) => Promise<void>;
}

export default function RecipeEditor({
  menuItems,
  ingredients,
  recipes,
  useApi,
  onSave,
}: RecipeEditorProps) {
  const [menuItemId, setMenuItemId] = useState(menuItems[0]?.id ?? '');
  const [draftLines, setDraftLines] = useState<
    Array<{ ingredientId: string; quantityPerServing: number }>
  >([]);
  const [saving, setSaving] = useState(false);

  const existingLines = useMemo(
    () => recipes.filter((r) => r.menuItemId === menuItemId),
    [recipes, menuItemId],
  );

  const loadExisting = () => {
    setDraftLines(
      existingLines.map((line) => ({
        ingredientId: line.ingredientId,
        quantityPerServing: line.quantityPerServing,
      })),
    );
  };

  const addLine = () => {
    const first = ingredients[0];
    if (!first) return;
    setDraftLines((lines) => [...lines, { ingredientId: first.id, quantityPerServing: 1 }]);
  };

  const handleSave = async () => {
    if (!menuItemId) return;
    setSaving(true);
    try {
      await onSave(menuItemId, draftLines);
      toast.success('Recipe saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save recipe');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-inset-md p-margin-mobile md:p-margin-tablet">
      <h2 className="text-title-lg font-semibold">Recipe editor</h2>
      <label className="block">
        <span className="text-label-md text-on-surface-variant">Menu item</span>
        <select
          value={menuItemId}
          onChange={(e) => {
            setMenuItemId(e.target.value);
            setDraftLines([]);
          }}
          className="mt-1 w-full rounded-lg border border-outline-variant px-3 py-2"
        >
          {menuItems.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-inset-sm">
        <button
          type="button"
          onClick={loadExisting}
          className="rounded-lg border border-outline-variant px-3 py-2 text-label-md"
        >
          Load current
        </button>
        <button
          type="button"
          onClick={addLine}
          className="rounded-lg bg-surface-container-high px-3 py-2 text-label-md"
        >
          Add ingredient
        </button>
      </div>

      <ul className="space-y-inset-sm">
        {draftLines.map((line, index) => (
          <li
            key={`${line.ingredientId}-${index}`}
            className="flex flex-wrap items-center gap-inset-sm rounded-lg border border-outline-variant p-inset-sm"
          >
            <select
              value={line.ingredientId}
              onChange={(e) =>
                setDraftLines((rows) =>
                  rows.map((row, i) =>
                    i === index ? { ...row, ingredientId: e.target.value } : row,
                  ),
                )
              }
              className="min-w-[140px] flex-1 rounded-lg border border-outline-variant px-2 py-1"
            >
              {ingredients.map((ing) => (
                <option key={ing.id} value={ing.id}>
                  {ing.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step={0.25}
              value={line.quantityPerServing}
              onChange={(e) =>
                setDraftLines((rows) =>
                  rows.map((row, i) =>
                    i === index
                      ? { ...row, quantityPerServing: Number(e.target.value) || 0 }
                      : row,
                  ),
                )
              }
              className="w-24 rounded-lg border border-outline-variant px-2 py-1"
            />
            <button
              type="button"
              onClick={() => setDraftLines((rows) => rows.filter((_, i) => i !== index))}
              className="text-label-sm text-error"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={saving || !useApi || !menuItemId}
        onClick={handleSave}
        className="rounded-lg bg-primary-container px-4 py-2 text-label-md font-semibold text-on-primary disabled:opacity-50"
      >
        Save recipe
      </button>
    </div>
  );
}
