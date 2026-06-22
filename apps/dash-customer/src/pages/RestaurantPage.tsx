/** @deprecated Prefer StorePage for vertical-aware routing; RestaurantPage remains the restaurant menu implementation. */
import { useMemo, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { RestaurantMoreInfo } from '@/components/restaurant/RestaurantMoreInfo';
import { NewCartModal } from '@/components/restaurant/NewCartModal';
import { useCart, type CartItem } from '@/hooks/useCart';
import { useParallaxHero } from '@/hooks/useParallaxHero';
import { hapticLight, hapticSuccess } from '@/lib/haptics';
import { toast } from '@/lib/toast';
import { formatJmd, getRestaurantProfile, type MenuItem } from '@/lib/restaurantContent';

type Props = {
  merchantId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type PendingAdd = Omit<CartItem, 'id'>;

export default function RestaurantPage({ merchantId, onNavigate }: Props) {
  const restaurant = useMemo(() => getRestaurantProfile(merchantId), [merchantId]);
  const { addItem, merchantName } = useCart();
  const parallaxOffset = useParallaxHero();

  const [activeCategory, setActiveCategory] = useState(restaurant.categories[0]?.id ?? 'popular');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showNewCartModal, setShowNewCartModal] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);

  const categoryRefs = useRef<Record<string, HTMLElement | null>>({});

  const itemsByCategory = useMemo(() => {
    const map: Record<string, typeof restaurant.items> = {};
    for (const cat of restaurant.categories) {
      map[cat.id] = restaurant.items.filter((item) => item.categoryId === cat.id);
    }
    return map;
  }, [restaurant.categories, restaurant.items]);

  const openItem = (item: MenuItem) => {
    setSelectedItem(item);
    setSheetOpen(true);
  };

  const scrollToCategory = (catId: string) => {
    setActiveCategory(catId);
    categoryRefs.current[catId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tryAddToCart = (payload: PendingAdd, itemName: string) => {
    const result = addItem(payload, restaurant.name);
    if (result === 'conflict') {
      setPendingAdd(payload);
      setShowNewCartModal(true);
      return;
    }
    hapticSuccess();
    toast.itemAdded(itemName);
  };

  const handleQuickAdd = (item: MenuItem) => {
    if (item.modifiers.length > 0) {
      openItem(item);
      return;
    }
    hapticLight();
    tryAddToCart(
      {
        itemId: item.id,
        merchantId: restaurant.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        imageUrl: item.image,
      },
      item.name
    );
  };

  const handleSheetAdd = (data: {
    quantity: number;
    selections: Record<string, string | string[]>;
    instructions: string;
    unitPrice: number;
    optionsLabel: string;
  }) => {
    if (!selectedItem) return;

    const options =
      data.optionsLabel || data.instructions
        ? [
            ...(data.optionsLabel
              ? [{ name: 'Customizations', selections: [{ name: data.optionsLabel, priceAdjustment: 0 }] }]
              : []),
            ...(data.instructions
              ? [{ name: 'Instructions', selections: [{ name: data.instructions, priceAdjustment: 0 }] }]
              : []),
          ]
        : undefined;

    tryAddToCart(
      {
        itemId: selectedItem.id,
        merchantId: restaurant.id,
        name: selectedItem.name,
        price: data.unitPrice,
        quantity: data.quantity,
        imageUrl: selectedItem.image,
        options,
      },
      selectedItem.name
    );
  };

  const handleConfirmNewCart = () => {
    if (pendingAdd) {
      addItem(pendingAdd, restaurant.name, { replace: true });
      hapticSuccess();
      toast.itemAdded(pendingAdd.name);
      setPendingAdd(null);
      setShowNewCartModal(false);
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto bg-surface min-h-screen relative shadow-lg overflow-x-hidden pb-32">
      <header className="absolute top-0 left-0 w-full z-20 pt-safe px-4 pt-4 flex justify-between items-start pointer-events-none">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="glass-button w-10 h-10 rounded-full flex items-center justify-center text-on-error pointer-events-auto active:scale-95 transition-transform"
        >
          <MaterialIcon name="arrow_back" />
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button type="button" className="glass-button w-10 h-10 rounded-full flex items-center justify-center text-on-error active:scale-95 transition-transform">
            <MaterialIcon name="share" />
          </button>
          <FavoriteButton
            merchantId={restaurant.id}
            merchantName={restaurant.name}
            className="glass-button border-0 bg-surface-container-lowest/90"
          />
        </div>
      </header>

      <section className="relative w-full h-[320px] overflow-hidden">
        <img
          src={restaurant.heroImage}
          alt={restaurant.name}
          className="w-full h-[120%] object-cover will-change-transform"
          style={{ transform: `translateY(${-parallaxOffset}px)` }}
        />
        <div className="absolute inset-0 hero-gradient" />
      </section>

      <section className="relative z-10 -mt-16 px-4">
        <div className="mb-6 rounded-xl border border-outline-variant bg-surface p-4 shadow-lg">
          <div className="mb-2 flex items-start justify-between">
            <div>
              <h1 className="text-headline-lg-mobile font-bold text-on-surface">{restaurant.name}</h1>
              <p className="text-body-md text-on-surface-variant">Jamaican • Grill</p>
            </div>
            <div className="rounded-lg bg-primary-container px-3 py-1 text-center">
              <span className="text-label-md font-semibold uppercase tracking-wider text-on-primary-container">
                Restaurant
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 border-y border-outline-variant/50 py-3">
            <button
              type="button"
              onClick={() => onNavigate('restaurant-reviews', { merchantId: restaurant.id })}
              className="flex items-center gap-1 text-left"
            >
              <MaterialIcon name="star" className="text-lg text-primary" filled />
              <span className="text-label-lg font-semibold">{restaurant.rating}</span>
              <span className="text-body-md text-on-surface-variant">({restaurant.ratingCount})</span>
            </button>
            <div className="flex items-center gap-1 border-l border-outline-variant pl-4">
              <MaterialIcon name="schedule" className="text-lg text-on-surface-variant" />
              <span className="text-label-lg font-semibold">20-30 min</span>
            </div>
            <div className="flex items-center gap-1 border-l border-outline-variant pl-4">
              <MaterialIcon name="delivery_dining" className="text-lg text-on-surface-variant" />
              <span className="text-label-lg font-semibold">$2.99</span>
            </div>
          </div>
          <RestaurantMoreInfo restaurant={restaurant} />
        </div>
      </section>

      <div className="sticky top-0 z-30 -mx-4 scroll-mt-16 border-b border-outline-variant/30 bg-background/80 px-4 py-3 backdrop-blur-md">
        <div className="flex w-max gap-2 overflow-x-auto no-scrollbar">
          {restaurant.categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => scrollToCategory(cat.id)}
              className={`whitespace-nowrap rounded-full px-6 py-2 text-label-lg font-semibold transition-colors ${
                activeCategory === cat.id
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <main className="px-4 pb-8 pt-4">
        {restaurant.categories.map((cat) => {
          const items = itemsByCategory[cat.id] ?? [];
          if (items.length === 0) return null;
          return (
            <section
              key={cat.id}
              ref={(el) => { categoryRefs.current[cat.id] = el; }}
              className="mb-8 scroll-mt-28"
              id={`category-${cat.id}`}
            >
              <h2 className="mb-4 flex items-center gap-2 text-headline-md font-bold text-on-surface">
                {cat.emoji && <span className="text-xl">{cat.emoji}</span>}
                {cat.label}
              </h2>
              <div className="flex flex-col gap-4">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="group flex items-center gap-4 rounded-xl border border-outline-variant bg-surface p-4 transition-all active:scale-[0.98]"
                  >
                    <div className="min-w-0 flex-1">
                      <button type="button" onClick={() => openItem(item)} className="text-left">
                        <h3 className="text-headline-md font-bold text-on-surface">{item.name}</h3>
                        <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">{item.description}</p>
                      </button>
                      <div className="mt-4 flex items-center justify-between">
                        <span className="text-headline-md font-bold text-primary">{formatJmd(item.price)}</span>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(item)}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-md transition-transform active:scale-90"
                        >
                          <MaterialIcon name="add" />
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openItem(item)}
                      className="h-28 w-28 shrink-0 overflow-hidden rounded-lg"
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-surface-container-high">
                          <MaterialIcon name="restaurant" className="text-4xl text-outline" />
                        </div>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <ItemDetailSheet
        item={selectedItem}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={handleSheetAdd}
      />

      <NewCartModal
        open={showNewCartModal}
        currentRestaurant={merchantName ?? 'another restaurant'}
        onConfirm={handleConfirmNewCart}
        onCancel={() => {
          setShowNewCartModal(false);
          setPendingAdd(null);
        }}
      />
    </div>
  );
}
