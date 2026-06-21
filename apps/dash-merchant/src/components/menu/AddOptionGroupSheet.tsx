import { useEffect, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { ModifierGroup, ModifierOption, generateMenuId } from '../../types/menu';

interface AddOptionGroupSheetProps {
  open: boolean;
  initialGroup?: ModifierGroup | null;
  onClose: () => void;
  onSave: (group: ModifierGroup) => void;
}

function createEmptyOption(): ModifierOption {
  return { id: generateMenuId(), name: '', priceAdjustment: 0 };
}

function createEmptyGroup(): ModifierGroup {
  return {
    id: generateMenuId(),
    name: '',
    required: true,
    minSelections: 1,
    maxSelections: 1,
    options: [createEmptyOption(), createEmptyOption(), createEmptyOption()],
  };
}

export default function AddOptionGroupSheet({
  open,
  initialGroup,
  onClose,
  onSave,
}: AddOptionGroupSheetProps) {
  const [group, setGroup] = useState<ModifierGroup>(createEmptyGroup());
  const [selectionType, setSelectionType] = useState<'single' | 'multi'>('single');

  useEffect(() => {
    if (!open) return;
    if (initialGroup) {
      setGroup(initialGroup);
      setSelectionType(initialGroup.maxSelections === 1 ? 'single' : 'multi');
    } else {
      setGroup(createEmptyGroup());
      setSelectionType('single');
    }
  }, [open, initialGroup]);

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

  const updateSelectionType = (type: 'single' | 'multi') => {
    setSelectionType(type);
    setGroup((prev) => ({
      ...prev,
      minSelections: type === 'single' ? 1 : 0,
      maxSelections: type === 'single' ? 1 : 99,
    }));
  };

  const updateOption = (optionId: string, field: keyof ModifierOption, value: string | number) => {
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
    if (!group.name.trim()) return;
    const validOptions = group.options.filter((option) => option.name.trim());
    if (validOptions.length === 0) return;
    onSave({ ...group, name: group.name.trim(), options: validOptions });
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
            {initialGroup ? 'Edit Option Group' : 'Add Option Group'}
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

            <div className="grid grid-cols-1 gap-inset-md md:grid-cols-2">
              <div className="space-y-inset-xs">
                <span className="block text-label-md text-on-surface-variant">Selection Type</span>
                <div className="flex rounded bg-surface-container p-inset-base">
                  <button
                    type="button"
                    onClick={() => updateSelectionType('single')}
                    className={`flex flex-1 items-center justify-center gap-inset-xs rounded px-inset-sm py-inset-xs text-label-md ${
                      selectionType === 'single'
                        ? 'border border-outline-variant bg-surface-container-lowest text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container-highest'
                    }`}
                  >
                    <MaterialIcon name="radio_button_checked" className="text-[18px]" />
                    Single (Radio)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSelectionType('multi')}
                    className={`flex flex-1 items-center justify-center gap-inset-xs rounded px-inset-sm py-inset-xs text-label-md ${
                      selectionType === 'multi'
                        ? 'border border-outline-variant bg-surface-container-lowest text-on-surface shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container-highest'
                    }`}
                  >
                    <MaterialIcon name="check_box_outline_blank" className="text-[18px]" />
                    Multi (Checkbox)
                  </button>
                </div>
              </div>

              <div className="flex h-full items-center justify-between pt-6">
                <label className="flex cursor-pointer items-center gap-inset-xs text-body-lg text-on-surface">
                  Required Field
                  <MaterialIcon
                    name="info"
                    className="text-[18px] text-on-surface-variant"
                  />
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-checked={group.required}
                  onClick={() => setGroup((prev) => ({ ...prev, required: !prev.required }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    group.required ? 'bg-primary-container' : 'bg-surface-container-high'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-surface-container-lowest transition-transform ${
                      group.required ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
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
