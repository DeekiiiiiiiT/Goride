import {
  groupFromList,
  type ChoiceGroup,
  type ChoiceKind,
  type ChoiceList,
  type ChoiceOption,
} from '@roam/merchant-ops';
import { useAdminConfirm } from '../../contexts/AdminConfirmContext';

function blankOption(): ChoiceOption {
  return { id: crypto.randomUUID(), name: '', priceModifier: 0, isAvailable: true };
}

export function blankChoice(kind: ChoiceKind): ChoiceGroup {
  return {
    id: crypto.randomUUID(),
    name: kind === 'included' ? 'Choose your side' : kind === 'priced' ? 'Size' : 'Add extras',
    kind,
    maxSelections: kind === 'extra' ? 0 : 1,
    options: [blankOption(), blankOption()],
  };
}

export function DishChoices({
  groups,
  lists,
  hidePriced = false,
  onChange,
}: {
  groups: ChoiceGroup[];
  lists: ChoiceList[];
  hidePriced?: boolean;
  onChange: (groups: ChoiceGroup[]) => void;
}) {
  const { confirm } = useAdminConfirm();
  const input = 'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100';

  function update(index: number, patch: Partial<ChoiceGroup>) {
    onChange(groups.map((group, groupIndex) => (groupIndex === index ? { ...group, ...patch } : group)));
  }

  function updateOption(groupIndex: number, optionIndex: number, patch: Partial<ChoiceOption>) {
    const group = groups[groupIndex];
    const options = group.options.map((option, index) => (index === optionIndex ? { ...option, ...patch } : option));
    update(groupIndex, { options });
  }

  return (
    <div className="space-y-3 md:col-span-2">
      <p className="text-xs text-slate-500">What are choices? Included = free must-pick. Price = sized price. Extras = optional add-ons.</p>
      {(['included', 'priced', 'extra'] as const).filter((kind) => !(hidePriced && kind === 'priced')).map((kind) => (
        <section key={kind} className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-500">{kind === 'included' ? 'Included choice. The customer must pick one, and it stays free.' : kind === 'priced' ? 'Required price. The customer must pick one. Each option is the restaurant price.' : 'Extras. Optional, each with its own price.'}</p>
            <button type="button" className="shrink-0 text-[11px] font-medium text-amber-300" onClick={() => onChange([...groups, blankChoice(kind)])}>
              {kind === 'included' ? 'Add included choice' : kind === 'priced' ? 'Add price choice' : 'Add extras'}
            </button>
          </div>
          {groups.map((group, groupIndex) => group.kind === kind ? (
            <div key={group.id} className="space-y-2 rounded-lg bg-slate-900 p-3">
              <label className="block text-sm text-slate-200">Name
                <input className={input} value={group.name} onChange={(event) => update(groupIndex, { name: event.target.value })} />
              </label>
              <label className="block text-sm text-slate-200">Reuse a saved list
                <select className={input} value={group.libraryGroupId || ''} onChange={(event) => {
                  const list = lists.find((item) => item.id === event.target.value);
                  if (!list) {
                    update(groupIndex, { libraryGroupId: undefined });
                    return;
                  }
                  const attached = groupFromList(list, group.id);
                  update(groupIndex, attached);
                }}>
                  <option value="">Type a new list</option>
                  {lists.filter((list) => list.kind === kind).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              </label>
              {kind === 'extra' ? (
                <label className="block text-sm text-slate-200">Customer can add up to
                  <input className={input} type="number" min={1} value={group.maxSelections > 0 ? group.maxSelections : ''} onChange={(event) => update(groupIndex, { maxSelections: Number(event.target.value) || 0 })} />
                </label>
              ) : null}
              {group.options.map((option, optionIndex) => (
                <div key={option.id} className="flex flex-wrap items-end gap-2">
                  <label className="min-w-0 flex-1 text-sm text-slate-200">Choice
                    <input className={input} value={option.name} onChange={(event) => updateOption(groupIndex, optionIndex, { name: event.target.value })} />
                  </label>
                  {kind === 'included' ? <span className="pb-2 text-sm text-slate-500">Free</span> : (
                    <label className="w-28 text-sm text-slate-200">{kind === 'priced' ? 'Price J$' : 'Extra J$'}
                      <input className={input} inputMode="decimal" value={option.priceModifier || ''} onChange={(event) => updateOption(groupIndex, optionIndex, { priceModifier: Number(event.target.value) || 0 })} />
                    </label>
                  )}
                  <label className="flex min-h-11 items-center gap-1 pb-2 text-sm">
                    <input type="checkbox" checked={option.isAvailable} onChange={(event) => updateOption(groupIndex, optionIndex, { isAvailable: event.target.checked })} />
                    On
                  </label>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 text-sm">
                <button type="button" className="min-h-11 text-slate-200" onClick={() => update(groupIndex, { options: [...group.options, blankOption()] })}>Add choice</button>
                {!group.libraryGroupId ? (
                  <label className="flex min-h-11 items-center gap-1">
                    <input type="checkbox" checked={Boolean(group.saveForLibrary)} onChange={(event) => update(groupIndex, { saveForLibrary: event.target.checked })} />
                    Save for other dishes
                  </label>
                ) : <span className="self-center text-slate-500">Used on other dishes</span>}
                {kind === 'priced' ? (
                  <label className="flex min-h-11 items-center gap-1">
                    <input type="checkbox" checked={Boolean(group.applyToSection)} onChange={(event) => update(groupIndex, { applyToSection: event.target.checked })} />
                    Use on every dish in this section
                  </label>
                ) : null}
                <button type="button" className="min-h-11 text-slate-500" onClick={() => void confirm({
                  title: 'Remove this choice?',
                  description: 'It stays on the dish until you save.',
                  confirmLabel: 'Remove',
                  variant: 'danger',
                }).then((ok) => { if (ok) onChange(groups.filter((_, index) => index !== groupIndex)); })}>Remove</button>
              </div>
            </div>
          ) : null)}
        </section>
      ))}
    </div>
  );
}
