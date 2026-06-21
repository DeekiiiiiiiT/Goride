import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MenuCategory, MenuItem } from '../../types/menu';
import SortableList from './SortableList';

interface MenuOverviewViewProps {
  categories: MenuCategory[];
  itemsByCategory: Record<string, MenuItem[]>;
  onAddCategory: () => void;
  onOpenCategory: (categoryId: string) => void;
  onToggleManagement: () => void;
  managementMode: boolean;
  dragEnabled?: boolean;
  onReorderCategories?: (categories: MenuCategory[]) => void;
}

function getSoldOutCount(items: MenuItem[]) {
  return items.filter((item) => !item.is_available).length;
}

export default function MenuOverviewView({
  categories,
  itemsByCategory,
  onAddCategory,
  onOpenCategory,
  onToggleManagement,
  managementMode,
  dragEnabled = false,
  onReorderCategories,
}: MenuOverviewViewProps) {
  const canDrag = dragEnabled && managementMode && Boolean(onReorderCategories);

  return (
    <div className="max-w-3xl mx-auto px-margin-mobile md:px-margin-tablet">
      <div className="mb-lg mt-sm flex items-center justify-between md:mt-lg">
        <div>
          <h1 className="mb-base text-headline-lg-mobile text-on-background md:text-headline-lg">
            Menu Overview
          </h1>
          <div className="flex items-center gap-xs">
            <span className="h-2 w-2 rounded-full bg-primary-container" />
            <span className="text-label-md text-on-surface-variant">Live</span>
          </div>
        </div>
        <div className="flex items-center gap-sm">
          <label className="relative flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={managementMode}
              onChange={onToggleManagement}
            />
            <div className="h-6 w-11 rounded-full border border-outline-variant bg-surface-container-high after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-outline-variant after:bg-white after:transition-all peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:after:translate-x-5" />
            <span className="ml-xs hidden text-label-md text-on-surface-variant md:block">
              Edit Menu
            </span>
          </label>
          <button
            type="button"
            onClick={onAddCategory}
            className="hidden h-12 items-center justify-center rounded-lg bg-primary-container px-sm text-label-md text-white shadow-sm transition-colors hover:bg-primary active:scale-95 md:flex"
          >
            <MaterialIcon name="add" className="mr-xs text-[18px]" />
            Add Category
          </button>
        </div>
      </div>

      <SortableList
        items={categories}
        disabled={!canDrag}
        onReorder={(ordered) => onReorderCategories?.(ordered)}
        className="space-y-xs"
        renderItem={(category, dragHandle) => {
          const categoryItems = itemsByCategory[category.id] || [];
          const soldOutCount = getSoldOutCount(categoryItems);

          return (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest transition-shadow hover:shadow-sm">
              <div className="flex min-h-[64px] items-center p-sm">
                <div className="mr-xs flex items-center">
                  {dragHandle || (
                    <span className="p-xs text-on-surface-variant">
                      <MaterialIcon name="drag_indicator" />
                    </span>
                  )}
                </div>
                <div className="flex flex-1 items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onOpenCategory(category.id)}
                    className="text-left"
                  >
                    <h3 className="text-headline-md text-on-background">{category.name}</h3>
                  </button>
                  <div className="flex items-center gap-sm">
                    <span className="rounded bg-surface-container px-2 py-1 text-label-md text-on-surface-variant">
                      {categoryItems.length} Items
                    </span>
                    {soldOutCount > 0 && (
                      <span className="rounded bg-error-container px-2 py-1 text-label-md text-error">
                        {soldOutCount} Sold Out
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenCategory(category.id)}
                      className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                    >
                      <MaterialIcon name="expand_more" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        }}
      />

      <button
        type="button"
        onClick={onAddCategory}
        className="mb-lg mt-sm flex h-12 w-full items-center justify-center rounded-lg bg-primary-container text-label-md text-white shadow-sm transition-colors hover:bg-primary active:scale-95 md:hidden"
      >
        <MaterialIcon name="add" className="mr-xs text-[18px]" />
        Add Category
      </button>
    </div>
  );
}
