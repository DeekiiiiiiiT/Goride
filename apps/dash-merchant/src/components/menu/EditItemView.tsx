import { useEffect, useState } from 'react';
import ImageUpload from '../ImageUpload';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  MenuCategory,
  MenuItem,
  ModifierGroup,
  createEmptyMenuItem,
  getModifierGroupLabel,
} from '../../types/menu';
import AddOptionGroupSheet from './AddOptionGroupSheet';

interface EditItemViewProps {
  item: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId?: string;
  onBack: () => void;
  onSave: (item: MenuItem) => void;
  onDelete?: (itemId: string) => void;
  isPending?: boolean;
}

export default function EditItemView({
  item,
  categories,
  defaultCategoryId,
  onBack,
  onSave,
  onDelete,
  isPending = false,
}: EditItemViewProps) {
  const [formData, setFormData] = useState<MenuItem>(
    item || createEmptyMenuItem(defaultCategoryId)
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [optionGroupSheetOpen, setOptionGroupSheetOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ModifierGroup | null>(null);

  useEffect(() => {
    if (item) {
      setFormData(item);
      setExpandedGroups(new Set(item.options.map((group) => group.id)));
    } else {
      setFormData(createEmptyMenuItem(defaultCategoryId));
      setExpandedGroups(new Set());
    }
  }, [item, defaultCategoryId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleSaveGroup = (group: ModifierGroup) => {
    setFormData((prev) => {
      const exists = prev.options.some((entry) => entry.id === group.id);
      return {
        ...prev,
        options: exists
          ? prev.options.map((entry) => (entry.id === group.id ? group : entry))
          : [...prev.options, group],
      };
    });
    setExpandedGroups((prev) => new Set(prev).add(group.id));
  };

  const handleSubmit = () => {
    if (!formData.name.trim() || formData.price <= 0) return;
    onSave(formData);
  };

  const isNew = !item?.id;

  return (
    <div className="app-fullscreen-screen z-[60] bg-[#FAFAFA]">
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile shadow-sm backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:text-primary active:scale-95"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <h1 className="absolute left-1/2 -translate-x-1/2 text-headline-md font-bold text-on-surface">
          {isNew ? 'Add Item' : 'Edit Item'}
        </h1>
        <div className="w-12" />
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto px-margin-mobile pb-32 pt-6 md:px-margin-tablet">
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-sm">
          <div className="[&>div]:m-0 [&>div>div]:aspect-auto [&>div>div]:h-48 [&>div>div]:rounded-none [&>div>div]:border-0">
            <ImageUpload
              value={formData.image_url}
              onChange={(url) => setFormData((prev) => ({ ...prev, image_url: url }))}
              folder="menu-items"
              aspectRatio="cover"
              placeholder="Tap to change"
            />
          </div>
          <div className="border-t border-outline-variant bg-surface-container-low p-4">
            <p className="flex items-center gap-2 text-body-sm text-on-surface-variant">
              <MaterialIcon name="info" className="text-base" />
              Recommended size: 1080×1080px. Max 5MB.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-2 text-headline-md text-on-surface">Basic Details</h2>

          <div className="flex flex-col gap-2">
            <label className="text-label-md text-on-surface-variant" htmlFor="itemName">
              Item Name
            </label>
            <input
              id="itemName"
              type="text"
              value={formData.name}
              onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
              className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-lg text-on-surface outline-none transition-all focus:border-primary-container focus:ring-1 focus:ring-primary-container"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-label-md text-on-surface-variant" htmlFor="itemDesc">
              Description
            </label>
            <textarea
              id="itemDesc"
              rows={3}
              value={formData.description}
              onChange={(event) =>
                setFormData((prev) => ({ ...prev, description: event.target.value }))
              }
              className="w-full resize-none rounded-lg border border-outline-variant bg-surface-container-lowest p-4 text-body-lg text-on-surface outline-none transition-all focus:border-primary-container focus:ring-1 focus:ring-primary-container"
            />
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-label-md text-on-surface-variant" htmlFor="itemCategory">
                Category
              </label>
              <div className="relative">
                <select
                  id="itemCategory"
                  value={formData.category_id}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, category_id: event.target.value }))
                  }
                  className="h-12 w-full appearance-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 pr-10 text-body-lg text-on-surface outline-none transition-all focus:border-primary-container focus:ring-1 focus:ring-primary-container"
                >
                  <option value="">No category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <MaterialIcon
                  name="expand_more"
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-label-md text-on-surface-variant" htmlFor="itemPrice">
                Base Price
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-body-lg text-on-surface-variant">
                  $
                </span>
                <input
                  id="itemPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price || ''}
                  onChange={(event) =>
                    setFormData((prev) => ({
                      ...prev,
                      price: parseFloat(event.target.value) || 0,
                    }))
                  }
                  className="h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-8 pr-4 text-body-lg text-on-surface outline-none transition-all focus:border-primary-container focus:ring-1 focus:ring-primary-container"
                />
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">Modifiers &amp; Options</h2>
            <button
              type="button"
              onClick={() => {
                setEditingGroup(null);
                setOptionGroupSheetOpen(true);
              }}
              className="flex items-center gap-1 text-label-md text-primary hover:underline"
            >
              <MaterialIcon name="add" className="text-sm" />
              Add Group
            </button>
          </div>

          {formData.options.map((group) => {
            const isExpanded = expandedGroups.has(group.id);
            return (
              <div key={group.id} className="overflow-hidden rounded-lg border border-outline-variant">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between border-b border-outline-variant bg-surface-container-low p-4 transition-colors hover:bg-surface-container"
                >
                  <div className="flex flex-col text-left">
                    <span className="text-label-md text-on-surface">{group.name}</span>
                    <span className="text-body-sm text-on-surface-variant">
                      {getModifierGroupLabel(group)}
                    </span>
                  </div>
                  <MaterialIcon
                    name={isExpanded ? 'expand_less' : 'expand_more'}
                    className="text-on-surface-variant"
                  />
                </button>
                {isExpanded && (
                  <div className="flex flex-col gap-3 bg-surface-container-lowest p-4">
                    {group.options.map((option, index) => (
                      <div key={option.id}>
                        <div className="flex items-center justify-between">
                          <span className="text-body-lg text-on-surface">{option.name}</span>
                          <span className="text-body-sm text-on-surface-variant">
                            +${option.priceAdjustment.toFixed(2)}
                          </span>
                        </div>
                        {index < group.options.length - 1 && (
                          <div className="mt-3 h-px bg-outline-variant/30" />
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingGroup(group);
                        setOptionGroupSheetOpen(true);
                      }}
                      className="mt-2 text-left text-body-sm text-primary hover:underline"
                    >
                      Edit group
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {formData.options.length === 0 && (
            <p className="text-body-sm text-on-surface-variant">
              No modifier groups yet. Add one for sizes, extras, or customizations.
            </p>
          )}
        </section>

        <section className="flex flex-col gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <h2 className="mb-2 text-headline-md text-on-surface">Item Settings</h2>

          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col">
              <span className="text-body-lg font-semibold text-on-surface">Availability</span>
              <span className="text-body-sm text-on-surface-variant">
                Mark as sold out to temporarily hide
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={!formData.is_available}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, is_available: !event.target.checked }))
                }
              />
              <div className="peer h-6 w-11 rounded-full bg-surface-container-highest after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-5 peer-focus:outline-none" />
            </label>
          </div>

          <div className="h-px bg-outline-variant/50" />

          <div className="flex items-center justify-between py-2">
            <div className="flex flex-col">
              <span className="text-body-lg font-semibold text-on-surface">Mark as Popular</span>
              <span className="text-body-sm text-on-surface-variant">
                Highlights item with a badge
              </span>
            </div>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={formData.is_featured}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, is_featured: event.target.checked }))
                }
              />
              <div className="peer h-6 w-11 rounded-full bg-surface-container-highest after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-5 peer-focus:outline-none" />
            </label>
          </div>
        </section>

        <section className="flex flex-col items-center gap-4 pb-8">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!formData.name.trim() || formData.price <= 0 || isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary-container text-label-md font-semibold text-white shadow-sm transition-colors hover:bg-primary active:scale-[0.98] disabled:opacity-50"
          >
            <MaterialIcon name="save" className="text-sm" />
            {isPending ? 'Saving...' : 'Save Item'}
          </button>
          {!isNew && onDelete && (
            <button
              type="button"
              onClick={() => {
                if (confirm(`Delete "${formData.name}"?`)) {
                  onDelete(formData.id);
                }
              }}
              className="py-2 text-label-md text-error transition-colors hover:text-error-container"
            >
              Delete Item
            </button>
          )}
        </section>
      </main>

      <AddOptionGroupSheet
        open={optionGroupSheetOpen}
        initialGroup={editingGroup}
        onClose={() => {
          setOptionGroupSheetOpen(false);
          setEditingGroup(null);
        }}
        onSave={handleSaveGroup}
      />
    </div>
  );
}
