import { useMemo, useState } from 'react';
import { priceLine, type MenuSnapshot, type OrderSelection } from '@roam/menu-engine';

/** Live restaurant + customer price for a pizza product under construction. */
export function PizzaTestCalculator({
  snapshot,
  productId,
  markupBps = 1500,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  markupBps?: number;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  const [selections, setSelections] = useState<OrderSelection[]>([]);

  const groups = useMemo(() => {
    if (!product) return [];
    return [...product.groupLinks]
      .sort((a, b) => a.sort - b.sort)
      .map((link) => snapshot.groups.find((g) => g.id === link.groupId))
      .filter(Boolean);
  }, [product, snapshot.groups]);

  const result = useMemo(() => {
    if (!product) return null;
    const markup = (r: number) => Math.ceil((r * (1 + markupBps / 10000)) / 10) * 10;
    return priceLine(snapshot, {
      productId,
      quantity: 1,
      menuVersion: snapshot.version,
      selections,
    }, markup);
  }, [snapshot, productId, selections, markupBps, product]);

  if (!product) return <p className="text-sm text-[#5f75a5]">Select a specialty pizza to test.</p>;

  return (
    <div className="space-y-4 rounded-lg border border-[#d7e0f2] bg-[#f8fafc] p-4">
      <h3 className="text-sm font-semibold text-[#0f172a]">Test calculator — {product.name}</h3>
      {groups.map((group) => {
        if (!group) return null;
        const multi = group.max !== 1;
        return (
          <div key={group.id}>
            <div className="mb-1 text-xs font-medium text-[#5f75a5]">{group.sourceLabel || group.name}</div>
            <div className="flex flex-wrap gap-2">
              {group.options.map((opt) => {
                const selected = selections.some((s) => s.groupId === group.id && s.optionId === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-full border px-3 py-1 text-xs ${selected ? 'border-[#0f172a] bg-[#0f172a] text-white' : 'border-[#d7e0f2] bg-white text-[#0f172a]'}`}
                    onClick={() => {
                      setSelections((prev) => {
                        const without = prev.filter((s) => !(s.groupId === group.id && (!multi || s.optionId === opt.id)));
                        if (selected && multi) return without.filter((s) => !(s.groupId === group.id && s.optionId === opt.id));
                        if (!multi) return [...prev.filter((s) => s.groupId !== group.id), { groupId: group.id, optionId: opt.id }];
                        if (selected) return without;
                        return [...without, { groupId: group.id, optionId: opt.id, portion: 'normal', placement: 'whole' }];
                      });
                    }}
                  >
                    {opt.sourceLabel || opt.name}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="border-t border-[#d7e0f2] pt-3 text-sm">
        {!result?.ok ? (
          <span className="text-red-600">{result && !result.ok ? result.error : 'Build a pizza'}</span>
        ) : (
          <div className="flex flex-wrap gap-4">
            <span>Restaurant <strong>J${result.restaurant.toLocaleString()}</strong></span>
            <span>Customer <strong>J${result.customer.toLocaleString()}</strong></span>
          </div>
        )}
      </div>
    </div>
  );
}
