import { useMemo } from 'react';
import { priceLine, selectionMatches, type MenuSnapshot, type OrderSelection, type Placement, type PortionLevel } from '@roam/menu-engine';

/** Customer-facing chain-style pizza builder driven by a published snapshot. */
export function EnginePizzaBuilder({
  snapshot,
  productId,
  selections,
  onChange,
  money,
  markupBps = 0,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  selections: OrderSelection[];
  onChange: (next: OrderSelection[]) => void;
  money: (amount: number) => string;
  markupBps?: number;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  const groups = useMemo(() => {
    if (!product) return [];
    return [...product.groupLinks]
      .sort((a, b) => a.sort - b.sort)
      .map((l) => snapshot.groups.find((g) => g.id === l.groupId))
      .filter(Boolean);
  }, [product, snapshot.groups]);

  const priced = useMemo(() => {
    if (!product) return null;
    const markup = (r: number) =>
      markupBps ? Math.ceil((r * (1 + markupBps / 10000)) / 10) * 10 : r;
    return priceLine(snapshot, {
      productId,
      quantity: 1,
      menuVersion: snapshot.version,
      selections,
    }, markup);
  }, [snapshot, productId, selections, markupBps, product]);

  if (!product) return null;

  function setSingle(groupId: string, optionId: string, extra?: Partial<OrderSelection>) {
    onChange([...selections.filter((s) => s.groupId !== groupId), { groupId, optionId, ...extra }]);
  }

  function toggleTopping(groupId: string, optionId: string) {
    const existing = selections.find((s) => s.groupId === groupId && s.optionId === optionId);
    if (existing) {
      onChange(selections.filter((s) => !(s.groupId === groupId && s.optionId === optionId)));
      return;
    }
    onChange([...selections, { groupId, optionId, portion: 'normal', placement: 'whole' }]);
  }

  function patchTopping(groupId: string, optionId: string, patch: Partial<OrderSelection>) {
    onChange(
      selections.map((s) =>
        s.groupId === groupId && s.optionId === optionId ? { ...s, ...patch } : s,
      ),
    );
  }

  const halfPreview = selections.filter((s) => {
    const g = snapshot.groups.find((x) => x.id === s.groupId);
    return g?.placementEnabled;
  });

  return (
    <div className="space-y-6 px-4 py-3">
      {/* Visual half pizza cue */}
      <div className="mx-auto flex h-28 w-28 overflow-hidden rounded-full border-2 border-outline-variant">
        <div className="flex w-1/2 flex-col items-center justify-center bg-orange-50 text-[10px] text-on-surface-variant">
          Left
          <span className="px-1 text-center">
            {halfPreview.filter((s) => s.placement === 'left' || s.placement === 'whole').map((s) => s.optionId.slice(0, 3)).join(' ') || '—'}
          </span>
        </div>
        <div className="flex w-1/2 flex-col items-center justify-center bg-amber-50 text-[10px] text-on-surface-variant">
          Right
          <span className="px-1 text-center">
            {halfPreview.filter((s) => s.placement === 'right' || s.placement === 'whole').map((s) => s.optionId.slice(0, 3)).join(' ') || '—'}
          </span>
        </div>
      </div>

      {groups.map((group) => {
        if (!group || !selectionMatches(group.condition, selections)) return null;
        const options = group.options.filter(
          (o) => o.isAvailable && selectionMatches(o.condition, selections),
        );

        if (group.placementEnabled) {
          const max = product.pizza?.maxToppings;
          const count = selections.filter((s) => s.groupId === group.id).length;
          return (
            <section key={group.id}>
              <h2 className="mb-2 font-headline-sm text-headline-sm text-on-surface">
                {group.sourceLabel || group.name}
                {max != null ? <span className="ml-2 text-body-sm text-on-surface-variant">{count} of {max}</span> : null}
              </h2>
              <div className="space-y-3">
                {options.map((opt) => {
                  const pick = selections.find((s) => s.groupId === group.id && s.optionId === opt.id);
                  const included = opt.isDefault && product.pizza?.specialtyMode === 'fixed';
                  return (
                    <div key={opt.id} className="rounded-lg border border-outline-variant p-3">
                      <div className="flex items-center justify-between gap-2">
                        <button type="button" className="text-left font-body-md text-on-surface" onClick={() => toggleTopping(group.id, opt.id)}>
                          {opt.sourceLabel || opt.name}
                          {included ? <span className="ml-2 text-body-sm text-on-surface-variant">Included</span> : null}
                        </button>
                        {!pick ? (
                          <button type="button" className="text-label-md text-primary" onClick={() => toggleTopping(group.id, opt.id)}>add</button>
                        ) : (
                          <button type="button" className="text-label-md text-on-surface-variant" onClick={() => toggleTopping(group.id, opt.id)}>remove</button>
                        )}
                      </div>
                      {pick ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(['left', 'whole', 'right'] as Placement[]).map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`rounded-full border px-2 py-0.5 text-xs ${pick.placement === p ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
                              onClick={() => patchTopping(group.id, opt.id, { placement: p })}
                            >
                              {p}
                            </button>
                          ))}
                          {(group.portionLevels || [{ id: 'normal' as PortionLevel }, { id: 'extra' as PortionLevel }]).map((level) => (
                            <button
                              key={level.id}
                              type="button"
                              className={`rounded-full border px-2 py-0.5 text-xs ${pick.portion === level.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
                              onClick={() => patchTopping(group.id, opt.id, { portion: level.id })}
                            >
                              {level.id}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        }

        if (group.portionLevels?.length && group.max === 1) {
          const pick = selections.find((s) => s.groupId === group.id);
          return (
            <section key={group.id}>
              <h2 className="mb-2 font-headline-sm text-headline-sm text-on-surface">{group.sourceLabel || group.name}</h2>
              <div className="space-y-2">
                {options.map((opt) => (
                  <label key={opt.id} className="flex items-center justify-between gap-2">
                    <span className="font-body-md text-on-surface">{opt.sourceLabel || opt.name}</span>
                    <input
                      type="radio"
                      className="custom-radio"
                      checked={pick?.optionId === opt.id}
                      onChange={() => setSingle(group.id, opt.id, { portion: pick?.portion || 'normal' })}
                    />
                  </label>
                ))}
              </div>
              {pick ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-body-sm text-on-surface-variant">Amount:</span>
                  {group.portionLevels.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      className={`rounded-full border px-3 py-1 text-xs ${pick.portion === level.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
                      onClick={() => setSingle(group.id, pick.optionId, { portion: level.id })}
                    >
                      {level.label || level.id}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          );
        }

        return (
          <section key={group.id}>
            <h2 className="mb-2 font-headline-sm text-headline-sm text-on-surface">{group.sourceLabel || group.name}</h2>
            <div className="flex flex-wrap gap-2">
              {options.map((opt) => {
                const selected = selections.some((s) => s.groupId === group.id && s.optionId === opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    className={`rounded-full border px-4 py-2 font-label-md ${selected ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant text-on-surface'}`}
                    onClick={() => {
                      if (group.max === 1) setSingle(group.id, opt.id);
                      else toggleTopping(group.id, opt.id);
                    }}
                  >
                    {opt.sourceLabel || opt.name}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-0 border-t border-outline-variant bg-surface py-3">
        {priced && !priced.ok ? (
          <p className="text-body-sm text-error">{priced.error}</p>
        ) : (
          <p className="font-label-md text-on-surface">
            {priced?.ok ? money(priced.customer) : money(0)}
          </p>
        )}
      </div>
    </div>
  );
}
