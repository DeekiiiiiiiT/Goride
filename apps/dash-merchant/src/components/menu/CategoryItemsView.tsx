import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { formatJmd } from '../../lib/partner-utils';
import { useLongPress } from '../../hooks/useLongPress';
import { MenuItem } from '../../types/menu';
import AvailabilityToggle from './AvailabilityToggle';
import SortableList from './SortableList';

function CategoryMenuItemRow({
  item,
  onEditItem,
  onToggleAvailability,
  dragHandle,
}: {
  item: MenuItem;
  onEditItem: (item: MenuItem) => void;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => void;
  dragHandle: ReactNode;
}) {
  const soldOut = !item.is_available;
  const longPress = useLongPress({
    disabled: soldOut,
    onLongPress: () => onToggleAvailability(item.id, false),
  });

  return (
    <div
      className={`flex min-h-[64px] items-center gap-sm rounded-lg border border-outline-variant p-sm transition-shadow ${
        soldOut ? 'opacity-75 grayscale-[20%]' : ''
      } bg-surface-container-lowest`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-sm" {...longPress}>
        <div className="flex items-center">
          {dragHandle || (
            <span className="p-1 text-on-surface-variant">
              <MaterialIcon name="drag_indicator" />
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => onEditItem(item)}
          className="flex min-w-0 flex-1 items-center gap-sm text-left"
        >
          <div className="relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md bg-surface-container">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt=""
                className={`h-full w-full object-cover ${soldOut ? 'opacity-60' : ''}`}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <MaterialIcon name="restaurant" className="text-on-surface-variant" />
              </div>
            )}
            {soldOut && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface/40 backdrop-blur-[2px]">
                <span className="rounded bg-error px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-on-error">
                  Sold Out
                </span>
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className={`truncate text-body-lg font-medium ${soldOut ? 'text-outline' : 'text-on-surface'}`}>
              {item.name}
            </h3>
            <p className="truncate text-body-sm text-on-surface-variant">{formatJmd(item.price)}</p>
            {!soldOut && (
              <p className="mt-0.5 text-label-sm text-on-surface-variant">Hold to mark sold out</p>
            )}
          </div>
        </button>
      </div>

      <div className="flex items-center gap-md">
        <AvailabilityToggle
          checked={item.is_available}
          onChange={(isAvailable) => onToggleAvailability(item.id, isAvailable)}
        />
        <button
          type="button"
          onClick={() => onEditItem(item)}
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container active:scale-95"
        >
          <MaterialIcon name="edit" />
        </button>
      </div>
    </div>
  );
}

interface CategoryItemsViewProps {
  categoryName: string;
  items: MenuItem[];
  onBack: () => void;
  onAddItem: () => void;
  onEditItem: (item: MenuItem) => void;
  onToggleAvailability: (itemId: string, isAvailable: boolean) => void;
  dragEnabled?: boolean;
  onReorderItems?: (items: MenuItem[]) => void;
}

export default function CategoryItemsView({
  categoryName,
  items,
  onBack,
  onAddItem,
  onEditItem,
  onToggleAvailability,
  dragEnabled = false,
  onReorderItems,
}: CategoryItemsViewProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-margin-mobile backdrop-blur-md">
        <div className="flex items-center gap-xs">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 rounded-full p-2 text-on-surface transition-colors hover:bg-surface-container-high active:scale-95"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-md font-bold text-primary">{categoryName}</h1>
        </div>
        <div />
      </header>

      <main className="flex-1 overflow-y-auto p-margin-mobile pb-32">
        <div className="mx-auto max-w-3xl">
          <SortableList
            items={items}
            disabled={!dragEnabled || !onReorderItems}
            onReorder={(ordered) => onReorderItems?.(ordered)}
            className="space-y-sm"
            renderItem={(item, dragHandle) => (
              <CategoryMenuItemRow
                item={item}
                onEditItem={onEditItem}
                onToggleAvailability={onToggleAvailability}
                dragHandle={dragHandle}
              />
            )}
          />

          {items.length === 0 && (
            <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-8 text-center">
              <p className="mb-4 text-body-sm text-on-surface-variant">No items in this category yet.</p>
              <button
                type="button"
                onClick={onAddItem}
                className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
              >
                <MaterialIcon name="add" className="text-sm" />
                Add first item
              </button>
            </div>
          )}
        </div>
      </main>

      <button
        type="button"
        onClick={onAddItem}
        className="fixed bottom-24 right-margin-mobile z-40 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-container text-white shadow-lg transition-all hover:bg-primary active:scale-95 md:hidden"
        aria-label="Add item"
      >
        <MaterialIcon name="add" className="text-[28px]" />
      </button>

      <div className="fixed bottom-24 right-margin-tablet z-40 hidden md:flex">
        <button
          type="button"
          onClick={onAddItem}
          className="flex h-12 items-center justify-center gap-2 rounded-lg bg-primary-container px-6 text-label-md text-white shadow-sm transition-all hover:opacity-90 active:scale-95"
        >
          <MaterialIcon name="add" className="text-[20px]" />
          Add Item
        </button>
      </div>
    </div>
  );
}
