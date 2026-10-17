import type { MenuSnapshot, ProductType } from '@roam/menu-engine';
import { PizzaConfigEditor } from './PizzaConfigEditor.tsx';
import { WingsEditor } from './WingsEditor.tsx';
import { ComboSlotsEditor } from './ComboSlotsEditor.tsx';
import { OptionGroupsEditor } from './OptionGroupsEditor.tsx';

const TYPE_HELP: Record<ProductType, string> = {
  standard: 'Name, price, photo, and option groups.',
  sized: 'Size table with replace pricing, then the usual groups.',
  pizza: 'Chain-style builder: sizes, crusts, sauces, cheese, toppings, halves, specialty.',
  wings: 'Piece counts, style, flavours per N pieces, dips.',
  combo: 'Deal slots with allowed products and upcharges.',
  build_your_own: 'Ordered steps (base → protein → sides → extras).',
};

export function ProductTypeEditor({
  snapshot,
  productId,
  onChange,
  markupBps,
  optionAvailability,
  onOptionAvailability,
  onConfirmPrices,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  onChange: (next: MenuSnapshot) => void;
  markupBps?: number;
  /** Live option sold-out from location_overrides (option id → false when sold out). */
  optionAvailability?: Map<string, boolean | null>;
  onOptionAvailability?: (optionId: string, isAvailable: boolean | null) => void;
  /** Stamp priceCheckedAt on all products (or call with current product only via parent). */
  onConfirmPrices?: () => void;
}) {
  const product = snapshot.products.find((p) => p.id === productId);
  if (!product) return null;

  const linkedGroups = product.groupLinks
    .map((l) => snapshot.groups.find((g) => g.id === l.groupId))
    .filter(Boolean);

  const checkedLabel = product.priceCheckedAt
    ? `Prices checked ${new Date(product.priceCheckedAt).toLocaleString()}`
    : 'Prices not confirmed yet';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-[#5f75a5]">
          Product type
          <select
            className="mt-1 block rounded border border-[#d7e0f2] px-2 py-1.5 text-sm"
            value={product.type}
            onChange={(e) =>
              onChange({
                ...snapshot,
                products: snapshot.products.map((p) =>
                  p.id === productId ? { ...p, type: e.target.value as ProductType } : p,
                ),
              })
            }
          >
            {(Object.keys(TYPE_HELP) as ProductType[]).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <p className="flex-1 text-xs text-[#5f75a5]">{TYPE_HELP[product.type]}</p>
        {onConfirmPrices ? (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              className="rounded border border-[#d7e0f2] px-3 py-1.5 text-xs font-medium text-[#0f172a]"
              onClick={onConfirmPrices}
            >
              Confirm prices
            </button>
            <span className="text-[10px] text-[#5f75a5]">{checkedLabel}</span>
          </div>
        ) : null}
      </div>

      {onOptionAvailability && linkedGroups.length > 0 ? (
        <div className="space-y-2 rounded-lg border border-[#d7e0f2] p-3">
          <h4 className="text-xs font-semibold text-[#0f172a]">Live option sold-out</h4>
          <p className="text-[10px] text-[#5f75a5]">
            Marks this topping/crust sold out at this location without republishing.
          </p>
          <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {linkedGroups.flatMap((group) =>
              (group?.options || []).map((opt) => {
                const live = optionAvailability?.get(opt.id);
                const soldOut = live === false || (live == null && opt.isAvailable === false);
                return (
                  <li key={opt.id} className="flex items-center gap-2">
                    <span className="flex-1 truncate text-xs">
                      {group?.sourceLabel || group?.name}: {opt.sourceLabel || opt.name}
                    </span>
                    <label className="flex items-center gap-1 text-[10px] text-[#5f75a5]">
                      <input
                        type="checkbox"
                        checked={soldOut}
                        onChange={(e) =>
                          onOptionAvailability(opt.id, e.target.checked ? false : null)
                        }
                      />
                      Sold out
                    </label>
                  </li>
                );
              }),
            )}
          </ul>
        </div>
      ) : null}

      {product.type === 'standard' || product.type === 'sized' || product.type === 'build_your_own' ? (
        <OptionGroupsEditor snapshot={snapshot} productId={productId} onChange={onChange} />
      ) : null}
      {product.type === 'pizza' ? (
        <PizzaConfigEditor snapshot={snapshot} productId={productId} onChange={onChange} markupBps={markupBps} />
      ) : null}
      {product.type === 'wings' ? (
        <WingsEditor snapshot={snapshot} productId={productId} onChange={onChange} />
      ) : null}
      {product.type === 'combo' ? (
        <ComboSlotsEditor snapshot={snapshot} productId={productId} onChange={onChange} />
      ) : null}
    </div>
  );
}
