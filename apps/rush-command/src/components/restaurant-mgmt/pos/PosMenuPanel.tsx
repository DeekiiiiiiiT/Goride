import { MaterialIcon } from '../../../signup/components/MaterialIcon';
import { formatJmd } from '../../../lib/partner-utils';
import type { PosCategory, PosMenuItem } from './pos-types';

interface PosMenuPanelProps {
  categories: PosCategory[];
  activeCategory: string;
  items: PosMenuItem[];
  dimmed?: boolean;
  onCategoryChange: (categoryId: string) => void;
  onAddItem: (item: PosMenuItem) => void;
}

export default function PosMenuPanel({
  categories,
  activeCategory,
  items,
  dimmed = false,
  onCategoryChange,
  onAddItem,
}: PosMenuPanelProps) {
  return (
    <main
      className={`flex h-full w-full min-h-0 flex-1 flex-col bg-surface-container-lowest lg:w-[60%] lg:flex-none ${
        dimmed ? 'hidden opacity-40 lg:flex' : ''
      }`}
    >
      <div className="shrink-0 border-b border-surface-variant bg-surface px-margin-mobile py-4 md:px-margin-tablet">
        <div className="no-scrollbar flex items-center gap-3 overflow-x-auto">
          {categories.map((cat) => {
            const active = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onCategoryChange(cat.id)}
                className={`min-h-[48px] shrink-0 whitespace-nowrap rounded-full px-6 py-3 text-label-lg transition-transform active:scale-95 ${
                  active
                    ? 'bg-primary-container text-on-primary-container'
                    : 'border border-outline-variant text-on-surface hover:bg-surface-container-low'
                }`}
              >
                {cat.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-background p-margin-mobile md:p-margin-tablet">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAddItem(item)}
              className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface text-left shadow-[0_2px_4px_rgba(0,0,0,0.08)] transition-shadow hover:shadow-md active:scale-[0.98]"
            >
              <div className="relative h-32 w-full bg-surface-variant">
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-secondary-container">
                    <MaterialIcon
                      name="restaurant"
                      className="text-4xl text-on-secondary-container opacity-50"
                    />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/10 transition-colors group-active:bg-black/20" />
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="line-clamp-2 text-title-md text-on-surface">{item.name}</h3>
                <p className="mt-auto text-body-md font-medium text-primary">{formatJmd(item.price)}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
