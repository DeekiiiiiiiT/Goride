import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { TopSellingItem } from '../../types/analytics';
import { formatJmd } from '../../lib/partner-utils';

interface TopSellingItemsCardProps {
  items: TopSellingItem[];
  onViewAll?: () => void;
  compact?: boolean;
}

export default function TopSellingItemsCard({
  items,
  onViewAll,
  compact = false,
}: TopSellingItemsCardProps) {
  return (
    <section className="flex flex-col gap-inset-sm rounded-xl border border-outline-variant bg-surface-container-lowest p-inset-sm shadow-sm">
      <header className="mb-inset-xs flex items-center justify-between">
        <h2 className="text-headline-md text-on-surface">Top Selling Items</h2>
        <button
          type="button"
          className="rounded-full p-1 transition-colors hover:bg-surface-container"
          aria-label="More options"
        >
          <MaterialIcon name="more_vert" className="text-on-surface-variant" />
        </button>
      </header>

      <div className="flex flex-col gap-inset-md">
        {items.length === 0 ? (
          <p className="py-4 text-center text-body-sm text-on-surface-variant">
            No item sales in this period.
          </p>
        ) : (
          items.map((item) => (
          <div key={item.rank} className="flex flex-col gap-inset-base">
            <div className="flex items-baseline justify-between">
              <div className="flex items-center gap-inset-xs">
                <span className="w-4 text-right text-label-md text-on-surface-variant">
                  {item.rank}.
                </span>
                <span className="text-body-sm font-medium text-on-surface">{item.name}</span>
              </div>
              <span className="text-label-md text-primary">{formatJmd(item.revenue)}</span>
            </div>
            <div className="flex w-full items-center gap-inset-xs">
              <div className="h-2 flex-grow overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full rounded-full bg-primary-container"
                  style={{
                    width: `${item.progress}%`,
                    opacity: item.rank === 1 ? 1 : item.rank === 2 ? 0.8 : 0.6,
                  }}
                />
              </div>
              <span className="min-w-[50px] text-right text-label-sm text-on-surface-variant">
                {item.orders} orders
              </span>
            </div>
          </div>
          ))
        )}
      </div>

      {onViewAll && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-inset-sm flex h-12 w-full items-center justify-center rounded-lg text-label-md text-primary transition-colors hover:bg-surface-container"
        >
          View All Items
          <MaterialIcon name="chevron_right" className="ml-inset-base text-[16px]" />
        </button>
      )}

      {!onViewAll && !compact && (
        <button
          type="button"
          className="mt-inset-sm flex h-12 w-full items-center justify-center rounded-lg text-label-md text-primary transition-colors hover:bg-surface-container"
        >
          View All Items
          <MaterialIcon name="chevron_right" className="ml-inset-base text-[16px]" />
        </button>
      )}
    </section>
  );
}
