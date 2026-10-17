import type { ComboSlot, MenuProduct, MenuSnapshot } from '@roam/menu-engine';

export function ComboSlotsEditor({
  snapshot,
  productId,
  onChange,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  onChange: (next: MenuSnapshot) => void;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  if (!product) return null;
  const slots = product.comboSlots || [];

  function setSlots(next: ComboSlot[]) {
    onChange({
      ...snapshot,
      products: snapshot.products.map((p) =>
        p.id === productId ? { ...p, type: 'combo' as const, comboSlots: next } : p,
      ),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#0f172a]">Combo slots</h3>
        <button
          type="button"
          className="rounded bg-[#0f172a] px-3 py-1 text-xs text-white"
          onClick={() =>
            setSlots([
              ...slots,
              {
                id: crypto.randomUUID(),
                name: `Slot ${slots.length + 1}`,
                allowedProductIds: [],
                upcharges: [],
                sort: slots.length + 1,
              },
            ])
          }
        >
          Add slot
        </button>
      </div>
      {slots.map((slot, index) => (
        <div key={slot.id} className="rounded-lg border border-[#d7e0f2] p-3 space-y-2">
          <input
            className="w-full rounded border border-[#d7e0f2] px-2 py-1 text-sm font-medium"
            value={slot.name}
            onChange={(e) =>
              setSlots(slots.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)))
            }
          />
          <label className="block text-xs text-[#5f75a5]">
            Allowed product IDs (comma-separated)
            <input
              className="mt-1 w-full rounded border border-[#d7e0f2] px-2 py-1 text-sm"
              value={slot.allowedProductIds.join(', ')}
              onChange={(e) =>
                setSlots(
                  slots.map((s, i) =>
                    i === index
                      ? {
                          ...s,
                          allowedProductIds: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                        }
                      : s,
                  ),
                )
              }
            />
          </label>
          <label className="block text-xs text-[#5f75a5]">
            Large upgrade amount (J$)
            <input
              type="number"
              className="mt-1 w-32 rounded border border-[#d7e0f2] px-2 py-1 text-sm"
              value={slot.upcharges[0]?.amount ?? ''}
              onChange={(e) =>
                setSlots(
                  slots.map((s, i) =>
                    i === index
                      ? {
                          ...s,
                          upcharges: [
                            {
                              when: { groupId: 'size', op: 'eq', optionIds: ['large'] },
                              amount: Number(e.target.value) || 0,
                              label: 'Large upgrade',
                            },
                          ],
                        }
                      : s,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="text-xs text-red-600"
            onClick={() => setSlots(slots.filter((_, i) => i !== index))}
          >
            Remove slot
          </button>
        </div>
      ))}
      <label className="block text-xs text-[#5f75a5]">
        Deal base price (J$)
        <input
          type="number"
          className="mt-1 w-40 rounded border border-[#d7e0f2] px-2 py-1 text-sm"
          value={product.basePrice}
          onChange={(e) => {
            const basePrice = Number(e.target.value) || 0;
            onChange({
              ...snapshot,
              products: snapshot.products.map((p): MenuProduct =>
                p.id === productId ? { ...p, basePrice } : p,
              ),
            });
          }}
        />
      </label>
    </div>
  );
}
