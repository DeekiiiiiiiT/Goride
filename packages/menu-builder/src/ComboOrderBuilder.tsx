import { useState } from 'react';
import { priceLine, type MenuSnapshot, type OrderLine, type OrderSelection } from '@roam/menu-engine';
import { EnginePizzaBuilder } from './EnginePizzaBuilder.tsx';
import { WingsOrderBuilder } from './WingsOrderBuilder.tsx';

export function ComboOrderBuilder({
  snapshot,
  productId,
  money,
  onReady,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  money: (amount: number) => string;
  onReady: (line: OrderLine) => void;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  const [slotIndex, setSlotIndex] = useState(0);
  const [slots, setSlots] = useState<Array<{ slotId: string; line: OrderLine }>>([]);

  if (!product?.comboSlots?.length) return null;
  const slot = product.comboSlots[slotIndex];
  const allowed = snapshot.products.filter((p) => slot.allowedProductIds.includes(p.id));
  const [activeProductId, setActiveProductId] = useState(allowed[0]?.id || '');
  const [selections, setSelections] = useState<OrderSelection[]>([]);

  const active = snapshot.products.find((p) => p.id === activeProductId);

  function commitSlot() {
    const line: OrderLine = {
      productId: activeProductId,
      quantity: 1,
      menuVersion: snapshot.version,
      selections,
    };
    const next = [
      ...slots.filter((s) => s.slotId !== slot.id),
      { slotId: slot.id, line },
    ];
    setSlots(next);
    if (slotIndex + 1 < product.comboSlots!.length) {
      setSlotIndex(slotIndex + 1);
      setSelections([]);
      const nextSlot = product.comboSlots![slotIndex + 1];
      setActiveProductId(nextSlot.allowedProductIds[0] || '');
      return;
    }
    const deal: OrderLine = {
      productId,
      quantity: 1,
      menuVersion: snapshot.version,
      selections: [],
      slots: next,
    };
    onReady(deal);
  }

  const preview = priceLine(snapshot, {
    productId,
    quantity: 1,
    menuVersion: snapshot.version,
    selections: [],
    slots: [
      ...slots.filter((s) => s.slotId !== slot.id),
      { slotId: slot.id, line: { productId: activeProductId, quantity: 1, menuVersion: snapshot.version, selections } },
    ],
  });

  return (
    <div className="space-y-4 px-4 py-3">
      <div className="text-sm text-on-surface-variant">
        Slot {slotIndex + 1} of {product.comboSlots.length}: {slot.sourceLabel || slot.name}
      </div>
      <div className="flex flex-wrap gap-2">
        {allowed.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${activeProductId === p.id ? 'border-primary bg-primary text-on-primary' : 'border-outline-variant'}`}
            onClick={() => { setActiveProductId(p.id); setSelections([]); }}
          >
            {p.sourceLabel || p.name}
          </button>
        ))}
      </div>
      {active?.type === 'pizza' ? (
        <EnginePizzaBuilder
          snapshot={snapshot}
          productId={active.id}
          selections={selections}
          onChange={setSelections}
          money={money}
        />
      ) : active?.type === 'wings' ? (
        <WingsOrderBuilder
          snapshot={snapshot}
          productId={active.id}
          selections={selections}
          onChange={setSelections}
          money={money}
        />
      ) : null}
      <button
        type="button"
        className="w-full rounded-full bg-primary py-3 font-label-md text-on-primary"
        onClick={commitSlot}
      >
        {slotIndex + 1 < product.comboSlots.length ? 'Next slot' : `Add deal · ${preview.ok ? money(preview.customer) : '…'}`}
      </button>
    </div>
  );
}
