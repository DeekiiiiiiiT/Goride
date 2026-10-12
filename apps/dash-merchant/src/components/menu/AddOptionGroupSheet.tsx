import { useEffect, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { groupFromList, type ChoiceList } from '@roam/merchant-ops';
import { ModifierGroup, ModifierOption, generateMenuId } from '../../types/menu';

interface AddOptionGroupSheetProps {
  open: boolean;
  initialGroup?: ModifierGroup | null;
  kind?: 'included' | 'priced' | 'extra';
  lists?: ChoiceList[];
  onClose: () => void;
  onSave: (group: ModifierGroup) => void;
}

function createEmptyOption(): ModifierOption {
  return { id: generateMenuId(), name: '', priceAdjustment: 0 };
}

function createEmptyGroup(kind: 'included' | 'priced' | 'extra'): ModifierGroup {
  const priced = kind === 'priced';
  const included = kind === 'included';
  return {
    id: generateMenuId(),
    name: included ? 'Choose your side' : priced ? 'Size' : 'Add extras',
    required: included || priced,
    minSelections: included || priced ? 1 : 0,
    maxSelections: included || priced ? 1 : 0,
    kind,
    options: [createEmptyOption(), createEmptyOption()],
  };
}

export default function AddOptionGroupSheet({
  open,
  initialGroup,
  kind = 'extra',
  lists = [],
  onClose,
  onSave,
}: AddOptionGroupSheetProps) {
  const [group, setGroup] = useState<ModifierGroup>(createEmptyGroup(kind));
  const activeKind = group.kind || kind;

  useEffect(() => {
    if (!open) return;
    if (initialGroup) setGroup({ ...initialGroup, kind: initialGroup.kind || kind });
    else setGroup(createEmptyGroup(kind));
  }, [open, initialGroup, kind]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  const updateOption = (optionId: string, field: keyof ModifierOption, value: string | number | boolean) => {
    setGroup((prev) => ({
      ...prev,
      options: prev.options.map((option) =>
        option.id === optionId ? { ...option, [field]: value } : option
      ),
    }));
  };

  const removeOption = (optionId: string) => {
    setGroup((prev) => ({
      ...prev,
      options: prev.options.filter((option) => option.id !== optionId),
    }));
  };

  const handleSave = () => {
    if (!group.name.trim() || group.options.length === 0 || group.options.some((option) => !option.name.trim())) return;
    const validOptions = group.options;
    const included = activeKind === 'included';
    const priced = activeKind === 'priced';
    const required = included || priced;
    onSave({
      ...group,
      name: group.name.trim(),
      kind: activeKind,
      required,
      minSelections: required ? 1 : 0,
      maxSelections: required ? 1 : Math.max(0, Number(group.maxSelections) || 0),
      options: validOptions.map((option) => ({ ...option, priceAdjustment: included ? 0 : option.priceAdjustment })),
    });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[70] flex items-center justify-center bg-inverse-surface/40 p-margin-mobile backdrop-blur-sm md:p-margin-tablet"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="partner-modal-slide flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface-container-lowest shadow-sm"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between border-b border-outline-variant px-inset-md py-inset-sm">
          <h1 className="text-headline-md text-on-surface">
            {activeKind === 'included' ? 'Included choice' : activeKind === 'priced' ? 'Required price' : 'Extras'}
          </h1>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container"
          >
            <MaterialIcon name="close" />
          </button>
        </header>

        <main className="flex-1 space-y-inset-xl overflow-y-auto p-inset-md">
          <section className="space-y-inset-md">
            <div className="space-y-inset-xs">
              <label className="block text-label-md text-on-surface-variant" htmlFor="group-name">
                Group Name
              </label>
              <input
                id="group-name"
                type="text"
                value={group.name}
                onChange={(event) => setGroup((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="e.g. Choose your sides"
                className="w-full rounded border border-outline-variant bg-transparent p-inset-sm text-body-lg text-on-surface outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>

            <label className="block text-label-md text-on-surface-variant">
              Use a saved list
              <select
                className="mt-1 w-full rounded border border-outline-variant bg-transparent p-inset-sm text-body-lg text-on-surface"
                value={group.libraryGroupId || ''}
                onChange={(event) => {
                  const list = lists.find((item) => item.id === event.target.value);
                  if (!list) {
                    setGroup((prev) => ({ ...prev, libraryGroupId: undefined }));
                    return;
                  }
                  const attached = groupFromList(list, group.id);
                  setGroup({
                    ...group,
                    name: attached.name,
                    kind: attached.kind,
                    libraryGroupId: attached.libraryGroupId,
                    required: attached.kind !== 'extra',
                    minSelections: attached.kind !== 'extra' ? 1 : 0,
                    maxSelections: attached.maxSelections,
                    options: attached.options.map((option) => ({
                      id: option.id,
                      name: option.name,
                      priceAdjustment: option.priceModifier,
                      isAvailable: option.isAvailable,
                    })),
                  });
                }}
              >
                <option value="">Type a new list</option>
                {lists.filter((list) => list.kind === activeKind).map((list) => (
                  <option key={list.id} value={list.id}>{list.name}</option>
                ))}
              </select>
            </label>
            {activeKind === 'included' ? (
              <p className="text-body-md text-on-surface-variant">The customer must pick one. Each choice stays free.</p>
            ) : activeKind === 'priced' ? (
              <p className="text-body-md text-on-surface-variant">The customer must pick one. Each option is the restaurant price.</p>
            ) : (
              <label className="block text-label-md text-on-surface-variant">
                Customer can add up to
                <input
                  type="number"
                  min={1}
                  placeholder="Any"
                  value={group.maxSelections > 0 && group.maxSelections < 99 ? group.maxSelections : ''}
                  onChange={(event) => setGroup((prev) => ({ ...prev, maxSelections: Number(event.target.value) || 0 }))}
                  className="mt-1 w-full rounded border border-outline-variant bg-transparent p-inset-sm text-body-lg text-on-surface"
                />
              </label>
            )}
            {!group.libraryGroupId ? (
              <label className="flex items-center gap-2 text-body-md text-on-surface">
                <input type="checkbox" checked={Boolean(group.saveForLibrary)} onChange={(event) => setGroup((prev) => ({ ...prev, saveForLibrary: event.target.checked }))} />
                Save for other dishes
              </label>
            ) : <p className="text-body-sm text-on-surface-variant">Used on other dishes. Saving updates every dish that uses this list.</p>}
          </section>

          <hr className="border-outline-variant" />

          <section className="space-y-inset-sm">
            <h2 className="text-headline-md text-on-surface">Options</h2>
            <div className="space-y-inset-base">
              {group.options.map((option) => (
                <div
                  key={option.id}
                  className="group flex items-center gap-inset-sm rounded border border-outline-variant bg-surface-container-lowest p-inset-sm transition-colors hover:border-primary-container"
                >
                  <div className="cursor-grab text-on-surface-variant opacity-50 transition-opacity group-hover:opacity-100">
                    <MaterialIcon name="drag_indicator" />
                  </div>
                  <div className="grid flex-1 grid-cols-3 gap-inset-sm">
                    <input
                      type="text"
                      value={option.name}
                      onChange={(event) => updateOption(option.id, 'name', event.target.value)}
                      placeholder="Option Name"
                      className="col-span-2 border-b border-outline-variant bg-transparent py-inset-xs text-body-lg text-on-surface outline-none placeholder:text-on-surface-variant focus:border-primary"
                    />
                    {activeKind === 'included' ? <span className="self-center text-body-md text-on-surface-variant">J$0</span> : (
                      <div className="relative flex items-center">
                        <span className="absolute left-0 text-body-lg text-on-surface-variant">+J$</span>
                        <input
                          type="number"
                          value={option.priceAdjustment || ''}
                          onChange={(event) =>
                            updateOption(option.id, 'priceAdjustment', parseFloat(event.target.value) || 0)
                          }
                          placeholder="Price"
                          className="w-full border-b border-outline-variant bg-transparent py-inset-xs pl-8 text-body-lg text-on-surface outline-none focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeOption(option.id)}
                    className="rounded-full p-inset-xs text-on-surface-variant transition-colors hover:bg-error-container hover:text-error"
                  >
                    <MaterialIcon name="delete" className="text-[20px]" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setGroup((prev) => ({ ...prev, options: [...prev.options, createEmptyOption()] }))
              }
              className="flex w-full items-center justify-center gap-inset-xs rounded border-2 border-dashed border-outline-variant py-inset-sm text-label-md text-on-surface-variant transition-colors hover:border-primary hover:bg-surface-container-low hover:text-primary"
            >
              <MaterialIcon name="add" />
              Add Option
            </button>
          </section>
        </main>

        <footer className="flex justify-end gap-inset-sm border-t border-outline-variant bg-surface-container-lowest p-inset-md">
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[48px] items-center justify-center rounded border border-outline px-inset-lg text-label-md text-on-surface hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!group.name.trim()}
            className="flex min-h-[48px] items-center justify-center rounded bg-primary-container px-inset-lg text-label-md text-surface-container-lowest shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            Save Option Group
          </button>
        </footer>
      </div>
    </div>
  );
}
