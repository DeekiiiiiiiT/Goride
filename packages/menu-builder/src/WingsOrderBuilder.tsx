import { useMemo } from 'react';
import { priceLine, type MenuSnapshot, type OrderSelection } from '@roam/menu-engine';

export function WingsOrderBuilder({
  snapshot,
  productId,
  selections,
  onChange,
  money,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  selections: OrderSelection[];
  onChange: (next: OrderSelection[]) => void;
  money: (amount: number) => string;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  const piecesGroup = snapshot.groups.find((g) => g.id === product?.wings?.piecesGroupId);
  const flavourGroup = snapshot.groups.find((g) => g.id === product?.wings?.flavourGroupId);

  const priced = useMemo(() => {
    if (!product) return null;
    return priceLine(snapshot, { productId, quantity: 1, menuVersion: snapshot.version, selections });
  }, [snapshot, productId, selections, product]);

  if (!product || !piecesGroup || !flavourGroup) return null;

  const piecePick = selections.find((s) => s.groupId === piecesGroup.id);
  const pieces = Number(String(piecesGroup.options.find((o) => o.id === piecePick?.optionId)?.name || '').match(/\d+/)?.[0] || 0);
  const required = product.wings && product.wings.flavourPerPieces > 0
    ? Math.max(1, Math.ceil(pieces / product.wings.flavourPerPieces))
    : 1;
  const flavourPicks = selections.filter((s) => s.groupId === flavourGroup.id);

  return (
    <div className="space-y-6 px-4 py-3">
      <section>
        <h2 className="mb-2 font-headline-sm text-on-surface">{piecesGroup.sourceLabel || piecesGroup.name}</h2>
        <div className="flex flex-wrap gap-2">
          {piecesGroup.options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`rounded-full border px-4 py-2 ${piecePick?.optionId === opt.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
              onClick={() =>
                onChange([
                  ...selections.filter((s) => s.groupId !== piecesGroup.id && s.groupId !== flavourGroup.id),
                  { groupId: piecesGroup.id, optionId: opt.id },
                ])
              }
            >
              {opt.sourceLabel || opt.name}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2 className="mb-2 font-headline-sm text-on-surface">
          {flavourGroup.sourceLabel || flavourGroup.name}
          <span className="ml-2 text-body-sm text-on-surface-variant">
            {flavourPicks.length} of {required}
          </span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {flavourGroup.options.map((opt) => {
            const on = flavourPicks.some((s) => s.optionId === opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                className={`rounded-full border px-4 py-2 ${on ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
                onClick={() => {
                  if (on) {
                    onChange(selections.filter((s) => !(s.groupId === flavourGroup.id && s.optionId === opt.id)));
                    return;
                  }
                  if (flavourPicks.length >= required) return;
                  onChange([...selections, { groupId: flavourGroup.id, optionId: opt.id }]);
                }}
              >
                {opt.sourceLabel || opt.name}
              </button>
            );
          })}
        </div>
      </section>
      <p className="font-label-md text-on-surface">
        {priced?.ok ? money(priced.customer) : priced && !priced.ok ? priced.error : money(0)}
      </p>
    </div>
  );
}
