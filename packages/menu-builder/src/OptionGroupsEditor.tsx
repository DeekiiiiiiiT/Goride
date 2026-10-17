import type { MenuSnapshot, OptionGroup, PricingMode } from '@roam/menu-engine';
import { SourceLabelField } from './SourceLabelField.tsx';

const PRICING_MODES: PricingMode[] = ['add', 'replace', 'included'];

function blankGroup(name: string, pricingMode: PricingMode): OptionGroup {
  return {
    id: crypto.randomUUID(),
    name,
    min: pricingMode === 'replace' ? 1 : 0,
    max: pricingMode === 'replace' ? 1 : 99,
    freeCount: 0,
    pricingMode,
    portionLevels: null,
    placementEnabled: false,
    defaultRefund: 'price',
    options: [],
  };
}

function blankOption(sort: number) {
  return {
    id: crypto.randomUUID(),
    name: 'New option',
    price: 0,
    maxQty: 1,
    isDefault: false,
    sort,
    isAvailable: true,
  };
}

/** CRUD for linked option groups on standard / sized / build_your_own products. */
export function OptionGroupsEditor({
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

  const linked = [...product.groupLinks]
    .sort((a, b) => a.sort - b.sort)
    .map((l) => snapshot.groups.find((g) => g.id === l.groupId))
    .filter(Boolean) as OptionGroup[];

  function setSnapshot(next: MenuSnapshot) {
    onChange(next);
  }

  function updateGroup(groupId: string, patch: Partial<OptionGroup>) {
    setSnapshot({
      ...snapshot,
      groups: snapshot.groups.map((g) => (g.id === groupId ? { ...g, ...patch } : g)),
    });
  }

  function addGroup() {
    const group = blankGroup('Choices', product.type === 'sized' ? 'replace' : 'add');
    setSnapshot({
      ...snapshot,
      groups: [...snapshot.groups, group],
      products: snapshot.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              groupLinks: [...p.groupLinks, { groupId: group.id, sort: p.groupLinks.length + 1 }],
            }
          : p,
      ),
    });
  }

  function removeGroup(groupId: string) {
    setSnapshot({
      ...snapshot,
      groups: snapshot.groups.filter((g) => g.id !== groupId),
      products: snapshot.products.map((p) =>
        p.id === productId
          ? {
              ...p,
              groupLinks: p.groupLinks
                .filter((l) => l.groupId !== groupId)
                .map((l, i) => ({ ...l, sort: i + 1 })),
            }
          : {
              ...p,
              groupLinks: p.groupLinks.filter((l) => l.groupId !== groupId),
            },
      ),
    });
  }

  function addOption(groupId: string) {
    const group = snapshot.groups.find((g) => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, {
      options: [...group.options, blankOption(group.options.length + 1)],
    });
  }

  function removeOption(groupId: string, optionId: string) {
    const group = snapshot.groups.find((g) => g.id === groupId);
    if (!group) return;
    updateGroup(groupId, {
      options: group.options
        .filter((o) => o.id !== optionId)
        .map((o, i) => ({ ...o, sort: i + 1 })),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-[#0f172a]">Option groups</h4>
        <button
          type="button"
          className="rounded border border-[#d7e0f2] px-2 py-1 text-[10px] font-medium text-[#0f172a]"
          onClick={addGroup}
        >
          + Add group
        </button>
      </div>
      <p className="text-[10px] text-[#5f75a5]">
        Sizes, extras, and choices customers pick. Set the restaurant site wording for the buyer checklist.
      </p>
      {linked.length === 0 ? (
        <p className="rounded border border-dashed border-[#d7e0f2] px-3 py-4 text-center text-xs text-[#5f75a5]">
          No option groups yet. Add a group for sizes, sides, or extras.
        </p>
      ) : null}
      {linked.map((group) => (
        <div key={group.id} className="space-y-2 rounded-lg border border-[#d7e0f2] p-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block min-w-[8rem] flex-1 text-xs text-[#5f75a5]">
              Group name
              <input
                className="mt-1 w-full rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a]"
                value={group.name}
                onChange={(e) => updateGroup(group.id, { name: e.target.value })}
              />
            </label>
            <label className="block text-xs text-[#5f75a5]">
              Pricing
              <select
                className="mt-1 block rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a]"
                value={group.pricingMode}
                onChange={(e) =>
                  updateGroup(group.id, {
                    pricingMode: e.target.value as PricingMode,
                    min: e.target.value === 'replace' ? 1 : group.min,
                    max: e.target.value === 'replace' ? 1 : group.max,
                  })
                }
              >
                {PRICING_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <label className="block w-16 text-xs text-[#5f75a5]">
              Min
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a]"
                value={group.min}
                onChange={(e) => updateGroup(group.id, { min: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="block w-16 text-xs text-[#5f75a5]">
              Max
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded border border-[#d7e0f2] bg-white px-2 py-1.5 text-sm text-[#0f172a]"
                value={group.max}
                onChange={(e) => updateGroup(group.id, { max: Number(e.target.value) || 0 })}
              />
            </label>
            <button
              type="button"
              className="rounded px-2 py-1.5 text-[10px] text-red-600 hover:bg-red-50"
              onClick={() => removeGroup(group.id)}
            >
              Remove
            </button>
          </div>
          <SourceLabelField
            value={group.sourceLabel}
            step={group.sourceStep}
            onChange={(sourceLabel) => updateGroup(group.id, { sourceLabel })}
            onStepChange={(sourceStep) => updateGroup(group.id, { sourceStep })}
          />
          <ul className="space-y-2">
            {group.options.map((opt) => (
              <li key={opt.id} className="flex flex-wrap items-center gap-2 rounded border border-[#e8eef8] bg-[#f8fafc] p-2 text-sm">
                <input
                  className="min-w-[7rem] flex-1 rounded border border-[#d7e0f2] bg-white px-2 py-1 text-xs"
                  value={opt.name}
                  onChange={(e) =>
                    updateGroup(group.id, {
                      options: group.options.map((o) =>
                        o.id === opt.id ? { ...o, name: e.target.value } : o,
                      ),
                    })
                  }
                  placeholder="Option name"
                />
                <label className="flex items-center gap-1 text-[10px] text-[#5f75a5]">
                  J$
                  <input
                    type="number"
                    step="0.01"
                    className="w-20 rounded border border-[#d7e0f2] bg-white px-1.5 py-1 text-xs"
                    value={opt.price}
                    onChange={(e) =>
                      updateGroup(group.id, {
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, price: Number(e.target.value) || 0 } : o,
                        ),
                      })
                    }
                  />
                </label>
                <input
                  className="min-w-[8rem] flex-1 rounded border border-[#d7e0f2] bg-white px-2 py-1 text-xs"
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
                <label className="flex items-center gap-1 text-[10px] text-[#5f75a5]">
                  <input
                    type="checkbox"
                    checked={opt.isDefault}
                    onChange={(e) =>
                      updateGroup(group.id, {
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, isDefault: e.target.checked } : o,
                        ),
                      })
                    }
                  />
                  default
                </label>
                <label className="flex items-center gap-1 text-[10px] text-[#5f75a5]">
                  <input
                    type="checkbox"
                    checked={opt.isAvailable !== false}
                    onChange={(e) =>
                      updateGroup(group.id, {
                        options: group.options.map((o) =>
                          o.id === opt.id ? { ...o, isAvailable: e.target.checked } : o,
                        ),
                      })
                    }
                  />
                  available
                </label>
                <button
                  type="button"
                  className="text-[10px] text-red-600 hover:underline"
                  onClick={() => removeOption(group.id, opt.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="text-[10px] font-medium text-[#3b82f6] hover:underline"
            onClick={() => addOption(group.id)}
          >
            + Add option
          </button>
        </div>
      ))}
    </div>
  );
}
