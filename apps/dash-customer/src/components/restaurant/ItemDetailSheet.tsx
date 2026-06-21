import { useEffect, useMemo, useState } from 'react';
import { MaterialIcon } from '../icons/MaterialIcon';
import { BottomSheet } from '../ui/BottomSheet';
import { QuantityStepper } from '../ui/QuantityStepper';
import type { MenuItem, MenuModifierGroup } from '../../lib/restaurantContent';
import { formatJmd } from '../../lib/restaurantContent';

type Selections = Record<string, string | string[]>;

type Props = {
  item: MenuItem | null;
  open: boolean;
  onClose: () => void;
  mode?: 'add' | 'edit';
  initialQuantity?: number;
  initialInstructions?: string;
  submitLabel?: string;
  onAdd: (payload: {
    quantity: number;
    selections: Selections;
    instructions: string;
    unitPrice: number;
    optionsLabel: string;
  }) => void;
};

function getDefaultSelections(item: MenuItem): Selections {
  const selections: Selections = {};
  for (const group of item.modifiers) {
    if (group.type === 'checkbox') {
      selections[group.id] = [];
    } else if (group.options.length > 0) {
      const defaultIdx = group.id === 'size' ? 1 : 0;
      selections[group.id] = group.options[defaultIdx]?.id ?? group.options[0].id;
    }
  }
  return selections;
}

function buildOptionsLabel(item: MenuItem, selections: Selections): string {
  const parts: string[] = [];
  for (const group of item.modifiers) {
    const value = selections[group.id];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const id of value) {
        const opt = group.options.find(o => o.id === id);
        if (opt) parts.push(opt.label);
      }
    } else {
      const opt = group.options.find(o => o.id === value);
      if (opt) parts.push(opt.label);
    }
  }
  return parts.join(', ');
}

function calcUnitPrice(item: MenuItem, selections: Selections): number {
  let total = item.price;
  for (const group of item.modifiers) {
    const value = selections[group.id];
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const id of value) {
        const opt = group.options.find(o => o.id === id);
        if (opt) total += opt.price;
      }
    } else {
      const opt = group.options.find(o => o.id === value);
      if (opt) total += opt.price;
    }
  }
  return total;
}

function validateRequired(item: MenuItem, selections: Selections): string | null {
  for (const group of item.modifiers) {
    if (!group.required) continue;
    const value = selections[group.id];
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return group.id;
    }
  }
  return null;
}

export function ItemDetailSheet({
  item,
  open,
  onClose,
  mode = 'add',
  initialQuantity = 1,
  initialInstructions = '',
  submitLabel,
  onAdd,
}: Props) {
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<Selections>({});
  const [instructions, setInstructions] = useState('');
  const [errorGroupId, setErrorGroupId] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    if (item && open) {
      setQuantity(initialQuantity);
      setSelections(getDefaultSelections(item));
      setInstructions(initialInstructions);
      setErrorGroupId(null);
    }
  }, [item, open, initialQuantity, initialInstructions]);

  const actionLabel = submitLabel ?? (mode === 'edit' ? 'Update Item' : 'Add to Cart');

  const unitPrice = useMemo(
    () => (item ? calcUnitPrice(item, selections) : 0),
    [item, selections]
  );

  if (!open || !item) return null;

  const handleRadio = (groupId: string, optionId: string) => {
    setSelections(prev => ({ ...prev, [groupId]: optionId }));
    if (errorGroupId === groupId) setErrorGroupId(null);
  };

  const handleCheckbox = (groupId: string, optionId: string, checked: boolean) => {
    setSelections(prev => {
      const current = (prev[groupId] as string[]) ?? [];
      const next = checked ? [...current, optionId] : current.filter(id => id !== optionId);
      return { ...prev, [groupId]: next };
    });
  };

  const handleAdd = () => {
    const missing = validateRequired(item, selections);
    if (missing) {
      setErrorGroupId(missing);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    onAdd({
      quantity,
      selections,
      instructions,
      unitPrice,
      optionsLabel: buildOptionsLabel(item, selections),
    });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="relative flex flex-col max-h-[85dvh]">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 bg-surface/80 backdrop-blur-sm p-2 rounded-full text-on-surface-variant"
        >
          <MaterialIcon name="close" className="text-[20px]" />
        </button>

        <div className="overflow-y-auto flex-1 pb-28 no-scrollbar">
          <div className="relative w-full h-64 sm:h-72">
            <img src={item.image} alt={item.name} className="w-full h-full object-cover rounded-t-3xl" />
          </div>

          <div className="px-margin-mobile pt-inset-lg pb-inset-md">
            <div className="flex justify-between items-start mb-2">
              <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface pr-8">{item.name}</h1>
              <span className="font-headline-md text-headline-md text-primary shrink-0">{formatJmd(item.price)}</span>
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">{item.description}</p>
          </div>

          {item.modifiers.map((group, idx) => (
            <ModifierSection
              key={group.id}
              group={group}
              selections={selections}
              hasError={errorGroupId === group.id}
              shake={shake && errorGroupId === group.id}
              onRadio={handleRadio}
              onCheckbox={handleCheckbox}
              showDivider={idx < item.modifiers.length - 1}
            />
          ))}

          <div className="px-margin-mobile py-inset-md mb-8">
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">Special Instructions</h2>
            <textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full bg-[#F3F4F6] border-none rounded-lg p-4 font-body-md text-body-md text-on-surface placeholder:text-outline focus:ring-2 focus:ring-primary focus:bg-surface transition-all resize-none h-24"
              placeholder="Any allergies or requests?"
            />
          </div>
        </div>

        <div className="border-t border-surface-variant px-margin-mobile py-inset-md bg-surface pb-safe shrink-0">
          <div className="flex items-center gap-4">
            <QuantityStepper value={quantity} onChange={setQuantity} />
            <button
              type="button"
              onClick={handleAdd}
              className={`flex-1 rounded-lg py-4 px-6 flex justify-between items-center font-label-md text-label-md transition-transform duration-150 active:scale-95 shadow-sm ${
                errorGroupId
                  ? 'bg-error text-on-error'
                  : 'bg-primary text-on-primary hover:shadow-md'
              }`}
            >
              <span>{errorGroupId ? actionLabel : actionLabel}</span>
              <span>{formatJmd(unitPrice * quantity)}</span>
            </button>
          </div>
        </div>
      </div>
    </BottomSheet>
  );
}

function ModifierSection({
  group,
  selections,
  hasError,
  shake,
  onRadio,
  onCheckbox,
  showDivider,
}: {
  group: MenuModifierGroup;
  selections: Selections;
  hasError: boolean;
  shake: boolean;
  onRadio: (groupId: string, optionId: string) => void;
  onCheckbox: (groupId: string, optionId: string, checked: boolean) => void;
  showDivider: boolean;
}) {
  const value = selections[group.id];

  const content = (
    <div className="px-margin-mobile py-inset-md">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-headline-sm text-headline-sm text-on-surface">{group.title}</h2>
        <span
          className={`px-2 py-1 rounded font-label-sm text-label-sm uppercase tracking-wider ${
            group.required
              ? 'bg-surface-container-high text-on-surface-variant'
              : 'text-on-surface-variant'
          }`}
        >
          {group.required ? 'Required' : 'Optional'}
        </span>
      </div>

      {hasError && (
        <div className="flex items-center gap-inset-xs text-error mb-inset-md">
          <MaterialIcon name="error" className="text-[18px]" />
          <span className="font-body-sm text-body-sm font-medium">Please select your {group.title.toLowerCase()}</span>
        </div>
      )}

      {group.type === 'chips' ? (
        <div className="flex flex-wrap gap-2">
          {group.options.map(opt => {
            const selected = value === opt.id;
            const isExtraHot = opt.id === 'extra_hot';
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onRadio(group.id, opt.id)}
                className={`px-4 py-2 rounded-full border font-label-md text-label-md transition-all ${
                  selected
                    ? isExtraHot
                      ? 'bg-tertiary text-on-tertiary border-tertiary'
                      : 'bg-tertiary-container text-on-tertiary-container border-tertiary-container'
                    : 'border-outline-variant text-on-surface-variant hover:bg-surface-variant'
                }`}
              >
                {opt.label}
                {isExtraHot && (
                  <MaterialIcon name="local_fire_department" className="text-[14px] align-middle ml-1 inline" />
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {group.options.map(opt => {
            const isRadio = group.type === 'radio';
            const checked = isRadio
              ? value === opt.id
              : ((value as string[]) ?? []).includes(opt.id);

            return (
              <label
                key={opt.id}
                className={`flex items-center justify-between cursor-pointer group ${
                  hasError && isRadio ? 'p-inset-md rounded-lg bg-surface border border-outline-variant' : ''
                }`}
              >
                <div className="flex flex-col">
                  <span className="font-body-md text-body-md text-on-surface group-hover:text-primary transition-colors">
                    {opt.label}
                  </span>
                  {opt.price > 0 && (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">+{formatJmd(opt.price)}</span>
                  )}
                </div>
                {isRadio ? (
                  <input
                    type="radio"
                    name={group.id}
                    checked={checked}
                    onChange={() => onRadio(group.id, opt.id)}
                    className="custom-radio"
                  />
                ) : (
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => onCheckbox(group.id, opt.id, e.target.checked)}
                    className="custom-checkbox"
                  />
                )}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );

  if (hasError && group.required) {
    return (
      <>
        <div className={`mx-margin-mobile rounded-xl border-2 border-error bg-error-container/20 relative overflow-hidden ${shake ? 'animate-shake' : ''}`}>
          <div className="absolute inset-0 bg-gradient-to-r from-error/5 to-transparent pointer-events-none" />
          <div className="relative z-10">{content}</div>
        </div>
        {showDivider && <div className="w-full h-px bg-surface-variant my-2" />}
      </>
    );
  }

  return (
    <>
      {content}
      {showDivider && <div className="w-full h-px bg-surface-variant my-2" />}
    </>
  );
}
