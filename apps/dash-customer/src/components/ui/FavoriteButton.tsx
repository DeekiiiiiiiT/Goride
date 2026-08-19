import { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  isFavorite,
  isFavoriteItem,
  subscribeFavorites,
  toggleFavoriteAsync,
  toggleFavoriteItemAsync,
} from '@/lib/favoritesStorage';
import { hapticMedium } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useLongPress } from '@/hooks/useLongPress';

type Props = {
  merchantId: string;
  merchantName: string;
  itemId?: string;
  itemName?: string;
  className?: string;
};

export function FavoriteButton({
  merchantId,
  merchantName,
  itemId,
  itemName,
  className = '',
}: Props) {
  const label = itemName || merchantName;
  const [favorited, setFavorited] = useState(() =>
    itemId ? isFavoriteItem(merchantId, itemId) : isFavorite(merchantId),
  );

  useEffect(() => {
    const read = () =>
      setFavorited(itemId ? isFavoriteItem(merchantId, itemId) : isFavorite(merchantId));
    read();
    return subscribeFavorites(read);
  }, [merchantId, itemId]);

  const handleToggle = () => {
    void (async () => {
      try {
        const added = itemId
          ? await toggleFavoriteItemAsync(merchantId, itemId)
          : await toggleFavoriteAsync(merchantId);
        setFavorited(added);
        hapticMedium();
        if (added) toast.favoriteAdded(label);
        else toast.favoriteRemoved(label);
      } catch {
        toast.error('Could not update favorites');
      }
    })();
  };

  const longPress = useLongPress(handleToggle);

  return (
    <button
      type="button"
      aria-label={favorited ? `Remove ${label} from favorites` : `Save ${label} to favorites`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!longPress.wasLongPress()) handleToggle();
      }}
      {...longPress}
      className={`w-8 h-8 bg-surface-container-lowest/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm border border-surface-container-high active:scale-95 transition-transform ${className}`}
    >
      <MaterialIcon
        name={favorited ? 'favorite' : 'favorite_border'}
        className={`text-lg ${favorited ? 'text-tertiary' : 'text-on-surface'}`}
        filled={favorited}
      />
    </button>
  );
}
