import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { isFavorite, toggleFavorite } from '@/lib/favoritesStorage';
import { hapticMedium } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { useLongPress } from '@/hooks/useLongPress';

type Props = {
  merchantId: string;
  merchantName: string;
  className?: string;
};

export function FavoriteButton({ merchantId, merchantName, className = '' }: Props) {
  const [favorited, setFavorited] = useState(() => isFavorite(merchantId));

  const handleToggle = () => {
    const added = toggleFavorite(merchantId);
    setFavorited(added);
    hapticMedium();
    if (added) toast.favoriteAdded(merchantName);
    else toast.favoriteRemoved(merchantName);
  };

  const longPress = useLongPress(handleToggle);

  return (
    <button
      type="button"
      aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      onClick={(e) => {
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
