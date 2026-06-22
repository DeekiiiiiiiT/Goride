import type { VerticalType } from '@roam/types';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import type { DiscoverMerchant } from '@/lib/merchantDiscovery';
import { verticalLabel } from '@/lib/merchantDiscovery';

type Props = {
  merchant: DiscoverMerchant;
  onClick: () => void;
  variant?: 'featured' | 'list';
};

function verticalBadgeClass(vertical: VerticalType): string {
  if (vertical === 'grocery' || vertical === 'convenience' || vertical === 'retail') {
    return 'bg-secondary text-on-secondary';
  }
  return 'bg-primary text-on-primary';
}

export function DiscoverStoreCard({ merchant, onClick, variant = 'list' }: Props) {
  const isList = variant === 'list';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group w-full cursor-pointer overflow-hidden rounded-xl border border-outline-variant bg-white text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98] ${
        isList ? '' : 'min-w-[280px] shrink-0 snap-center'
      }`}
    >
      <div className={`relative w-full ${isList ? 'h-48' : 'h-32'}`}>
        {merchant.image ? (
          <img
            alt={merchant.name}
            src={merchant.image}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-surface-container text-4xl">
            {merchant.emoji ?? '🍽️'}
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          <span
            className={`rounded-full px-3 py-1 text-label-md font-semibold shadow-lg ${verticalBadgeClass(merchant.vertical_type)}`}
          >
            {verticalLabel(merchant.vertical_type)}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-label-md font-semibold text-on-surface shadow-sm backdrop-blur-sm">
            <MaterialIcon name="star" className="text-sm text-amber-500" filled />
            {merchant.rating}
          </span>
        </div>
        <div className="absolute bottom-3 right-3 rounded-full bg-white/95 px-3 py-1 text-label-md font-semibold text-on-surface shadow-sm backdrop-blur-sm">
          {merchant.eta}
        </div>
      </div>
      <div className="flex items-start justify-between p-4">
        <div className="min-w-0 pr-2">
          <h3 className="text-headline-md font-bold text-on-surface">{merchant.name}</h3>
          <p className="mt-0.5 text-body-md italic text-on-surface-variant line-clamp-2">
            {merchant.cuisines}
          </p>
        </div>
        <FavoriteButton
          merchantId={merchant.id}
          merchantName={merchant.name}
          className="!h-10 !w-10 shrink-0 rounded-full border border-outline-variant"
        />
      </div>
    </div>
  );
}
