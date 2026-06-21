import { useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { AccountSubHeader } from '@/components/account/AccountSubHeader';
import { FAVORITE_ITEMS, FAVORITE_RESTAURANTS } from '@/lib/accountSubContent';
import { formatJmd } from '@/lib/restaurantContent';
import { useCart } from '@/hooks/useCart';

type Props = {
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type Tab = 'restaurants' | 'items';

export default function FavoritesPage({ onNavigate }: Props) {
  const [tab, setTab] = useState<Tab>('restaurants');
  const { addItem } = useCart();

  const handleAddItem = (item: (typeof FAVORITE_ITEMS)[number]) => {
    addItem(
      {
        itemId: item.itemId,
        merchantId: item.merchantId,
        name: item.name,
        price: item.price,
        quantity: 1,
        imageUrl: item.image,
      },
      item.merchantName,
    );
    onNavigate('cart');
  };

  return (
    <div className="bg-background text-on-background min-h-screen pb-24">
      <AccountSubHeader />

      <main className="flex-grow px-4 pt-6 max-w-[1200px] mx-auto w-full">
        <h2 className="text-headline-md font-semibold mb-6">Your Favorites</h2>

        <div className="flex p-1 bg-surface-container rounded-xl mb-6 w-full max-w-md">
          <button
            type="button"
            onClick={() => setTab('restaurants')}
            className={`flex-1 py-2 text-center rounded-lg font-semibold text-label-md transition-all ${
              tab === 'restaurants'
                ? 'bg-surface-container-lowest text-primary shadow-sm'
                : 'text-on-surface-variant'
            }`}
          >
            Restaurants
          </button>
          <button
            type="button"
            onClick={() => setTab('items')}
            className={`flex-1 py-2 text-center rounded-lg font-semibold text-label-md transition-all ${
              tab === 'items' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant'
            }`}
          >
            Items
          </button>
        </div>

        {tab === 'restaurants' ? (
          <div className="space-y-4">
            {FAVORITE_RESTAURANTS.map(restaurant => (
              <div
                key={restaurant.id}
                className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)]"
              >
                <div className="h-48 w-full relative">
                  <img src={restaurant.image} alt={restaurant.name} className="w-full h-full object-cover" />
                  <button type="button" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm flex items-center justify-center text-tertiary shadow-sm">
                    <MaterialIcon name="favorite" filled />
                  </button>
                  <div className="absolute bottom-4 left-4 bg-surface-container-lowest/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center gap-1">
                    <MaterialIcon name="star" className="text-[16px] text-primary" filled />
                    <span className="text-label-sm">{restaurant.rating}</span>
                  </div>
                </div>
                <div className="p-4 flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-headline-sm font-semibold mb-1">{restaurant.name}</h3>
                    <p className="text-body-sm text-on-surface-variant">{restaurant.cuisines}</p>
                    <div className="flex items-center gap-2 mt-2 text-on-surface-variant">
                      <MaterialIcon name="schedule" className="text-[16px]" />
                      <span className="text-label-sm">{restaurant.eta}</span>
                      <span className="text-outline-variant">•</span>
                      <span className="text-label-sm">{restaurant.deliveryFee}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate('restaurant', { merchantId: restaurant.merchantId })}
                    className="bg-primary text-on-primary px-4 py-2 rounded-lg font-semibold text-label-md shadow-sm shrink-0"
                  >
                    Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {FAVORITE_ITEMS.map(item => (
              <div
                key={item.id}
                className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col"
              >
                <div className="h-32 w-full relative">
                  <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                  <button type="button" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-surface-container-lowest/90 backdrop-blur-sm flex items-center justify-center text-tertiary shadow-sm">
                    <MaterialIcon name="favorite" className="text-[18px]" filled />
                  </button>
                </div>
                <div className="p-2 flex flex-col flex-grow">
                  <h3 className="text-label-md font-semibold truncate">{item.name}</h3>
                  <p className="text-label-sm text-on-surface-variant truncate mb-2">{item.merchantName}</p>
                  <div className="mt-auto flex items-center justify-between">
                    <span className="text-headline-sm font-semibold">{formatJmd(item.price)}</span>
                    <button
                      type="button"
                      onClick={() => handleAddItem(item)}
                      className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-sm"
                    >
                      <MaterialIcon name="add" className="text-[18px]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
