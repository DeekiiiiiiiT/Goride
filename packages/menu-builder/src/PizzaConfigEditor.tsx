import { useState } from 'react';
import type { MenuProduct, MenuSnapshot, SpecialtyMode } from '@roam/menu-engine';
import { SourceLabelField } from './SourceLabelField.tsx';
import { PizzaTestCalculator } from './PizzaTestCalculator.tsx';
import { ParityCheckPanel } from './ParityCheckPanel.tsx';

const TABS = ['Sizes', 'Crusts', 'Sauces', 'Cheese', 'Toppings', 'Rules', 'Specialty', 'Test', 'Parity'] as const;
type Tab = (typeof TABS)[number];

export function PizzaConfigEditor({
  snapshot,
  productId,
  onChange,
  markupBps,
}: {
  snapshot: MenuSnapshot;
  productId: string;
  onChange: (next: MenuSnapshot) => void;
  markupBps?: number;
}) {
  const [tab, setTab] = useState<Tab>('Sizes');
  const product = snapshot.products.find((p) => p.id === productId);

  function updateProduct(patch: Partial<MenuProduct>) {
    onChange({
      ...snapshot,
      products: snapshot.products.map((p) => (p.id === productId ? { ...p, ...patch } : p)),
    });
  }

  function updateGroup(groupId: string, patch: Partial<MenuSnapshot['groups'][0]>) {
    onChange({
      ...snapshot,
      groups: snapshot.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    });
  }

  if (!product) return null;
  const linked = product.groupLinks
    .map((l) => snapshot.groups.find((g) => g.id === l.groupId))
    .filter(Boolean);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b border-[#d7e0f2] pb-2">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            className={`rounded px-3 py-1.5 text-xs font-medium ${tab === name ? 'bg-[#0f172a] text-white' : 'text-[#5f75a5] hover:bg-[#f1f5f9]'}`}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === 'Rules' && (
        <div className="space-y-3 rounded-lg border border-[#d7e0f2] p-4">
          <label className="block text-xs text-[#5f75a5]">
            Max toppings
            <input
              type="number"
              className="mt-1 w-32 rounded border border-[#d7e0f2] px-2 py-1 text-sm"
              value={product.pizza?.maxToppings ?? ''}
              onChange={(e) =>
                updateProduct({
                  pizza: {
                    halfPriceRule: product.pizza?.halfPriceRule || 'full',
                    specialtyMode: product.pizza?.specialtyMode || 'build',
                    maxToppings: e.target.value === '' ? null : Number(e.target.value),
                    fixedPricesBySize: product.pizza?.fixedPricesBySize,
                  },
                })
              }
            />
          </label>
          <label className="block text-xs text-[#5f75a5]">
            Half topping price
            <select
              className="mt-1 block rounded border border-[#d7e0f2] px-2 py-1 text-sm"
              value={product.pizza?.halfPriceRule || 'full'}
              onChange={(e) =>
                updateProduct({
                  pizza: {
                    ...product.pizza!,
                    halfPriceRule: e.target.value as 'full' | 'half',
                    maxToppings: product.pizza?.maxToppings ?? null,
                    specialtyMode: product.pizza?.specialtyMode || 'build',
                  },
                })
              }
            >
              <option value="full">Full price</option>
              <option value="half">Half price</option>
            </select>
          </label>
        </div>
      )}

      {tab === 'Specialty' && (
        <div className="space-y-3 rounded-lg border border-[#d7e0f2] p-4">
          <label className="block text-xs text-[#5f75a5]">
            Pricing mode
            <select
              className="mt-1 block rounded border border-[#d7e0f2] px-2 py-1 text-sm"
              value={product.pizza?.specialtyMode || 'build'}
              onChange={(e) =>
                updateProduct({
                  pizza: {
                    halfPriceRule: product.pizza?.halfPriceRule || 'full',
                    maxToppings: product.pizza?.maxToppings ?? null,
                    specialtyMode: e.target.value as SpecialtyMode,
                    fixedPricesBySize: product.pizza?.fixedPricesBySize || {},
                  },
                })
              }
            >
              <option value="build">Build price (base + toppings)</option>
              <option value="fixed">Fixed price per size (chain style)</option>
            </select>
          </label>
          {product.pizza?.specialtyMode === 'fixed' ? (
            <div className="space-y-2">
              <p className="text-xs text-[#5f75a5]">Fixed restaurant price per size. Default toppings included; removing them does not refund.</p>
              {(linked.find((g) => g?.pricingMode === 'replace')?.options || []).map((size) => (
                <label key={size.id} className="flex items-center gap-2 text-sm">
                  <span className="w-28">{size.sourceLabel || size.name}</span>
                  <input
                    className="w-32 rounded border border-[#d7e0f2] px-2 py-1"
                    value={product.pizza?.fixedPricesBySize?.[size.id] ?? ''}
                    onChange={(e) =>
                      updateProduct({
                        pizza: {
                          ...product.pizza!,
                          specialtyMode: 'fixed',
                          halfPriceRule: product.pizza?.halfPriceRule || 'full',
                          maxToppings: product.pizza?.maxToppings ?? null,
                          fixedPricesBySize: {
                            ...(product.pizza?.fixedPricesBySize || {}),
                            [size.id]: Number(e.target.value) || 0,
                          },
                        },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {['Sizes', 'Crusts', 'Sauces', 'Cheese', 'Toppings'].includes(tab) && (
        <div className="space-y-4">
          {linked
            .filter((g) => g && (g.name === tab.slice(0, -1) || g.name === tab || (tab === 'Toppings' && g.placementEnabled) || g.name.toLowerCase().startsWith(tab.slice(0, 4).toLowerCase())))
            .map((group) => {
              if (!group) return null;
              return (
                <div key={group.id} className="rounded-lg border border-[#d7e0f2] p-4">
                  <div className="mb-2 text-sm font-semibold">{group.name}</div>
                  <SourceLabelField
                    value={group.sourceLabel}
                    step={group.sourceStep}
                    onChange={(sourceLabel) => updateGroup(group.id, { sourceLabel })}
                    onStepChange={(sourceStep) => updateGroup(group.id, { sourceStep })}
                  />
                  <ul className="mt-3 space-y-2">
                    {group.options.map((opt) => (
                      <li key={opt.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-[8rem] font-medium">{opt.name}</span>
                        <input
                          className="min-w-[10rem] flex-1 rounded border border-[#d7e0f2] px-2 py-1 text-xs"
                          placeholder="Source label"
                          value={opt.sourceLabel || ''}
                          onChange={(e) =>
                            updateGroup(group.id, {
                              options: group.options.map((o) =>
                                o.id === opt.id ? { ...o, sourceLabel: e.target.value } : o,
                              ),
                            })
                          }
                        />
                        <label className="flex items-center gap-1 text-xs text-[#5f75a5]">
                          <input
                            type="checkbox"
                            checked={opt.isDefault}
                            onChange={(e) =>
                              updateGroup(group.id, {
                                options: group.options.map((o) =>
                                  o.id === opt.id ? { ...o, isDefault: e.target.checked } : o,
                                ),
                                defaultRefund: product.pizza?.specialtyMode === 'fixed' ? 'nothing' : group.defaultRefund,
                              })
                            }
                          />
                          default
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
        </div>
      )}

      {tab === 'Test' && (
        <PizzaTestCalculator snapshot={snapshot} productId={productId} markupBps={markupBps} />
      )}
      {tab === 'Parity' && <ParityCheckPanel snapshot={snapshot} />}
    </div>
  );
}
