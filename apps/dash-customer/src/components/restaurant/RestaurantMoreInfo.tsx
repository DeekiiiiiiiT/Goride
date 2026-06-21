import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import type { RestaurantProfile } from '@/lib/restaurantContent';

type Props = {
  restaurant: RestaurantProfile;
};

export function RestaurantMoreInfo({ restaurant }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4 border-t border-outline-variant/30 pt-4">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-label-md font-semibold text-primary">More info</span>
        <MaterialIcon
          name={expanded ? 'expand_less' : 'expand_more'}
          className="text-on-surface-variant"
        />
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 text-body-sm text-on-surface-variant">
          <div>
            <h4 className="text-label-sm font-semibold text-on-surface uppercase tracking-wider mb-2">Hours</h4>
            <ul className="space-y-1">
              {restaurant.hours.map((row) => (
                <li key={row.day} className="flex justify-between gap-4">
                  <span>{row.day}</span>
                  <span className="text-on-surface">{row.open} – {row.close}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-start gap-2">
            <MaterialIcon name="location_on" className="text-primary shrink-0 text-[18px]" />
            <span>{restaurant.address}</span>
          </div>
          <a href={`tel:${restaurant.phone.replace(/\s/g, '')}`} className="flex items-center gap-2 text-primary font-semibold">
            <MaterialIcon name="call" className="text-[18px]" />
            {restaurant.phone}
          </a>
        </div>
      )}
    </div>
  );
}
