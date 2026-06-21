import { useMemo, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import { MenuCategory, MenuItem } from '../../types/menu';
import SortableList from './SortableList';

interface MenuDesktopDashboardProps {
  categories: MenuCategory[];
  items: MenuItem[];
  selectedCategoryId: string | null;
  onSelectCategory: (categoryId: string) => void;
  onAddCategory: () => void;
  onAddItem: () => void;
  onEditItem: (item: MenuItem) => void;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => void;
  dragEnabled?: boolean;
  onReorderCategories?: (categories: MenuCategory[]) => void;
  onReorderItems?: (categoryId: string, items: MenuItem[]) => void;
}

export default function MenuDesktopDashboard({
  categories,
  items,
  selectedCategoryId,
  onSelectCategory,
  onAddCategory,
  onAddItem,
  onEditItem,
  onToggleAvailability,
  dragEnabled = false,
  onReorderCategories,
  onReorderItems,
}: MenuDesktopDashboardProps) {
  const [search, setSearch] = useState('');

  const activeCategoryId = selectedCategoryId ?? categories[0]?.id ?? null;
  const activeCategory = categories.find((category) => category.id === activeCategoryId);

  const itemsByCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    items.forEach((item) => {
      const key = item.category_id || 'uncategorized';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [items]);

  const categoryItems = useMemo(() => {
    const list = activeCategoryId ? itemsByCategory.get(activeCategoryId) || [] : [];
    const query = search.trim().toLowerCase();
    if (!query) return list;
    return list.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query),
    );
  }, [activeCategoryId, itemsByCategory, search]);

  return (
    <main className="flex flex-1 overflow-hidden bg-background">
      <aside className="flex h-full w-80 shrink-0 flex-col border-r border-outline-variant bg-surface-container-lowest">
        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface p-inset-md">
          <h2 className="text-headline-md font-bold text-on-surface">Categories</h2>
          <button
            type="button"
            onClick={onAddCategory}
            className="rounded-full p-1 text-primary-container transition-colors hover:bg-surface-variant"
            aria-label="Add category"
          >
            <MaterialIcon name="add" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-inset-base overflow-y-auto p-inset-sm">
          <SortableList
            items={categories}
            disabled={!dragEnabled || !onReorderCategories}
            onReorder={(ordered) => onReorderCategories?.(ordered)}
            className="flex flex-col gap-inset-base"
            renderItem={(category, dragHandle) => {
              const count = itemsByCategory.get(category.id)?.length ?? 0;
              const isActive = category.id === activeCategoryId;

              return (
                <button
                  type="button"
                  onClick={() => onSelectCategory(category.id)}
                  className={`group flex w-full cursor-pointer items-center justify-between rounded-lg border p-inset-sm transition-colors ${
                    isActive
                      ? 'border-outline-variant bg-surface-variant'
                      : 'border-transparent bg-surface-container-lowest hover:border-outline-variant hover:bg-surface-container-low'
                  }`}
                >
                  <div className="flex items-center gap-inset-sm">
                    {dragHandle || (
                      <MaterialIcon
                        name="drag_indicator"
                        className="text-outline opacity-0 transition-opacity group-hover:opacity-100"
                      />
                    )}
                    <div className="text-left">
                      <span
                        className={`block text-label-md font-semibold ${
                          isActive ? 'text-on-surface' : 'text-on-surface-variant'
                        }`}
                      >
                        {category.name}
                      </span>
                      <span
                        className={`text-label-sm ${
                          isActive ? 'text-on-surface-variant' : 'text-outline'
                        }`}
                      >
                        {count} Item{count === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>
                </button>
              );
            }}
          />
        </div>

        <div className="shrink-0 border-t border-outline-variant bg-surface p-inset-md">
          <button
            type="button"
            onClick={onAddCategory}
            className="flex w-full items-center justify-center gap-inset-sm rounded-lg border-2 border-dashed border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm text-label-md font-semibold text-primary transition-all hover:border-primary hover:bg-surface-variant"
          >
            <MaterialIcon name="add_circle" />
            Add Category
          </button>
        </div>
      </aside>

      <section className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
        <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface/90 p-inset-md backdrop-blur-md">
          <div>
            <h2 className="text-headline-lg font-bold text-on-surface">
              {activeCategory?.name || 'Menu'}
            </h2>
            <p className="mt-1 text-body-sm text-on-surface-variant">
              Manage items, pricing, and availability.
            </p>
          </div>
          <button
            type="button"
            onClick={onAddItem}
            className="flex h-12 items-center gap-inset-sm rounded-lg bg-primary-container px-inset-md py-inset-sm text-label-md font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary"
          >
            <MaterialIcon name="add" />
            Add Item
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-inset-md py-inset-sm">
          <div className="relative w-64">
            <MaterialIcon
              name="search"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-outline"
              size={20}
            />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search items..."
              className="w-full rounded-lg border border-outline-variant bg-surface py-2 pl-10 pr-4 text-body-sm transition-all focus:border-primary-container focus:outline-none focus:ring-1 focus:ring-primary-container"
            />
          </div>
          <div className="flex items-center gap-inset-sm">
            <button
              type="button"
              className="flex items-center gap-inset-xs rounded-lg border border-outline-variant px-3 py-1.5 text-label-md font-semibold text-on-surface-variant transition-colors hover:bg-surface-variant"
            >
              <MaterialIcon name="filter_list" size={18} />
              Filter
            </button>
            <div className="flex overflow-hidden rounded-lg border border-outline-variant">
              <button
                type="button"
                className="bg-surface-variant p-1.5 text-on-surface transition-colors hover:bg-surface-container-high"
                aria-label="Grid view"
              >
                <MaterialIcon name="grid_view" size={20} />
              </button>
              <button
                type="button"
                className="border-l border-outline-variant bg-surface p-1.5 text-on-surface-variant transition-colors hover:bg-surface-variant"
                aria-label="List view"
              >
                <MaterialIcon name="view_list" size={20} />
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-inset-md">
          {categoryItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center py-16 text-center">
              <MaterialIcon name="restaurant_menu" className="mb-4 text-outline" size={48} />
              <p className="text-body-sm text-on-surface-variant">
                {search ? 'No items match your search' : 'No items in this category yet'}
              </p>
              {!search && (
                <button
                  type="button"
                  onClick={onAddItem}
                  className="mt-4 rounded-lg bg-primary-container px-inset-md py-inset-sm text-label-md font-semibold text-on-primary-container"
                >
                  Add Item
                </button>
              )}
            </div>
          ) : (
            <SortableList
              items={categoryItems}
              disabled={!dragEnabled || !onReorderItems || !activeCategoryId}
              onReorder={(ordered) => {
                if (activeCategoryId) onReorderItems?.(activeCategoryId, ordered);
              }}
              className="grid grid-cols-1 gap-inset-md pb-inset-xl md:grid-cols-2 xl:grid-cols-3"
              renderItem={(item, dragHandle) => (
                <div className="relative">
                  {dragHandle && (
                    <div className="absolute left-2 top-2 z-10 rounded-full bg-surface/90 shadow-sm">
                      {dragHandle}
                    </div>
                  )}
                  <MenuItemCard
                    item={item}
                    onEdit={() => onEditItem(item)}
                    onToggleAvailability={(isAvailable) =>
                      onToggleAvailability(item.id, isAvailable)
                    }
                  />
                </div>
              )}
            />
          )}
        </div>
      </section>
    </main>
  );
}

function MenuItemCard({
  item,
  onEdit,
  onToggleAvailability,
}: {
  item: MenuItem;
  onEdit: () => void;
  onToggleAvailability: (isAvailable: boolean) => void;
}) {
  const isLive = item.is_available;

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-lg border border-outline-variant bg-surface transition-shadow duration-200 hover:shadow-md ${
        !isLive ? 'opacity-75' : ''
      }`}
    >
      <div className="relative h-40 bg-surface-container-low">
        {item.image_url ? (
          <img src={item.image_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center bg-surface-container-high">
            <MaterialIcon name="set_meal" className="text-outline-variant" size={48} />
          </div>
        )}
        <div className="absolute right-2 top-2 flex cursor-pointer items-center gap-inset-xs rounded border border-outline-variant/50 bg-surface/90 px-2 py-1 backdrop-blur-sm">
          <span
            className={`h-2 w-2 rounded-full ${isLive ? 'bg-primary-container' : 'bg-error'}`}
          />
          <span className="text-label-sm text-on-surface">{isLive ? 'Live' : 'Hidden'}</span>
        </div>
        <div className="absolute inset-0 flex items-center justify-center gap-inset-sm bg-black/40 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-inset-xs rounded-lg bg-surface px-4 py-2 text-label-md font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-variant"
          >
            <MaterialIcon name="edit" size={18} />
            Edit
          </button>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-inset-sm">
        <div className="mb-inset-xs flex items-start justify-between">
          <h3
            className={`text-headline-md font-semibold leading-tight ${
              isLive ? 'text-on-surface' : 'text-outline'
            }`}
          >
            {item.name}
          </h3>
          <MaterialIcon
            name="drag_indicator"
            className="cursor-grab text-outline hover:text-on-surface-variant active:cursor-grabbing"
          />
        </div>
        <p className="mb-inset-sm line-clamp-2 flex-1 text-body-sm text-on-surface-variant">
          {item.description || 'No description'}
        </p>
        <div className="flex items-center justify-between border-t border-outline-variant/50 pt-inset-sm">
          <span
            className={`text-headline-md font-bold ${isLive ? 'text-on-surface' : 'text-outline'}`}
          >
            {formatJmd(item.price)}
          </span>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={isLive}
              onChange={(event) => onToggleAvailability(event.target.checked)}
            />
            <div className="peer h-5 w-9 rounded-full bg-surface-variant after:absolute after:start-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all peer-checked:bg-primary-container peer-checked:after:translate-x-full" />
          </label>
        </div>
      </div>
    </div>
  );
}
