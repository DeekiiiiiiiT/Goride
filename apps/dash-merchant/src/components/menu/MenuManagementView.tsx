import { useMemo, useState } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { MenuCategory, MenuItem } from '../../types/menu';
import AvailabilityToggle from './AvailabilityToggle';

interface MenuManagementViewProps {
  categories: MenuCategory[];
  items: MenuItem[];
  onMarkAllAvailable: () => void;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => void;
  onBack: () => void;
  isMarkingAll?: boolean;
}

export default function MenuManagementView({
  categories,
  items,
  onMarkAllAvailable,
  onToggleAvailability,
  onBack,
  isMarkingAll = false,
}: MenuManagementViewProps) {
  const [search, setSearch] = useState('');

  const soldOutCount = items.filter((item) => !item.is_available).length;

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    );
  }, [items, search]);

  const groupedSections = useMemo(() => {
    const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
    const groups = new Map<string, MenuItem[]>();

    filteredItems.forEach((item) => {
      const key = item.category_id && categoryMap.has(item.category_id)
        ? item.category_id
        : 'uncategorized';
      const list = groups.get(key) || [];
      list.push(item);
      groups.set(key, list);
    });

    const sections: { id: string; name: string; items: MenuItem[] }[] = [];
    categories.forEach((category) => {
      const categoryItems = groups.get(category.id);
      if (categoryItems?.length) {
        sections.push({ id: category.id, name: category.name, items: categoryItems });
      }
    });

    const uncategorized = groups.get('uncategorized');
    if (uncategorized?.length) {
      sections.push({ id: 'uncategorized', name: 'Uncategorized', items: uncategorized });
    }

    return sections;
  }, [categories, filteredItems]);

  const getCategoryLabel = (item: MenuItem) => {
    const category = categories.find((entry) => entry.id === item.category_id);
    return category?.name || 'Uncategorized';
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-md px-margin-mobile py-md md:px-margin-tablet">
      <section className="flex flex-col gap-sm">
        <div className="flex items-end justify-between">
          <div>
            <button
              type="button"
              onClick={onBack}
              className="mb-2 flex items-center gap-1 text-body-sm text-on-surface-variant hover:text-primary md:hidden"
            >
              <MaterialIcon name="arrow_back" className="text-base" />
              Back
            </button>
            <h2 className="text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
              Menu Management
            </h2>
            {soldOutCount > 0 && (
              <p className="mt-1 text-body-sm font-medium text-error">
                {soldOutCount} item{soldOutCount === 1 ? '' : 's'} sold out
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onMarkAllAvailable}
            disabled={soldOutCount === 0 || isMarkingAll}
            className="flex h-12 items-center gap-xs rounded-lg border border-outline-variant bg-surface-container px-sm text-label-md text-primary transition-colors hover:bg-surface-container-high active:scale-95 disabled:opacity-50"
          >
            <MaterialIcon name="done_all" className="text-[18px]" />
            Mark All Available
          </button>
        </div>

        <div className="relative mt-xs w-full">
          <MaterialIcon
            name="search"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
          />
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search menu items..."
            className="h-14 w-full rounded-lg border border-outline-variant bg-surface-container-lowest pl-12 pr-4 text-body-lg text-on-background outline-none transition-all placeholder:text-on-surface-variant/50 focus:border-primary-container focus:ring-1 focus:ring-primary-container"
          />
        </div>
      </section>

      {groupedSections.map((section) => (
        <section key={section.id} className="mt-sm flex flex-col gap-base">
          <h3 className="mb-xs pl-xs text-label-md uppercase tracking-wider text-on-surface-variant">
            {section.name}
          </h3>
          {section.items.map((item) => {
            const soldOut = !item.is_available;
            return (
              <div
                key={item.id}
                className={`relative flex items-center justify-between rounded-lg border p-sm transition-shadow hover:shadow-[0px_4px_12px_rgba(0,0,0,0.05)] ${
                  soldOut
                    ? 'border-error/20 bg-surface-container-low'
                    : 'border-outline-variant bg-surface-container-lowest'
                }`}
              >
                {soldOut && <div className="absolute bottom-0 left-0 top-0 w-1 bg-error" />}
                <div className={`flex items-center gap-sm ${soldOut ? 'opacity-60' : ''}`}>
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className={`h-16 w-16 rounded-lg object-cover bg-surface-container ${soldOut ? 'grayscale' : ''}`}
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-surface-container">
                      <MaterialIcon name="restaurant" className="text-on-surface-variant" />
                    </div>
                  )}
                  <div>
                    <h4
                      className={`text-[18px] text-on-background ${soldOut ? 'line-through' : ''}`}
                    >
                      {item.name}
                    </h4>
                    <p
                      className={`mt-1 text-body-sm ${soldOut ? 'font-medium text-error' : 'text-on-surface-variant'}`}
                    >
                      {soldOut
                        ? 'Sold Out'
                        : `$${item.price.toFixed(2)} • ${getCategoryLabel(item)}`}
                    </p>
                  </div>
                </div>
                <AvailabilityToggle
                  checked={item.is_available}
                  onChange={(checked) => onToggleAvailability(item.id, checked)}
                />
              </div>
            );
          })}
        </section>
      ))}

      {filteredItems.length === 0 && (
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center">
          <p className="text-body-sm text-on-surface-variant">No menu items found.</p>
        </div>
      )}
    </div>
  );
}
