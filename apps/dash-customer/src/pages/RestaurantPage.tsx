import { useMemo, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { ItemDetailSheet } from '@/components/restaurant/ItemDetailSheet';
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

      <section className="relative z-10 -mt-8 px-4">
        <div className="bg-surface-container-lowest rounded-[24px] shadow-[0px_10px_30px_rgba(0,0,0,0.08)] p-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-16 h-16 rounded-xl bg-surface-container flex items-center justify-center overflow-hidden border border-outline-variant shadow-sm">
              <img src={restaurant.logoImage} alt="" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-headline-lg-mobile font-bold text-on-surface">{restaurant.name}</h1>
              <p className="text-body-md text-on-surface-variant mt-1">{restaurant.cuisines}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-6 bg-surface-container rounded-xl p-4">
            <button
              type="button"
              onClick={() => onNavigate('restaurant-reviews', { merchantId: restaurant.id })}
              className="flex flex-col text-left hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-1">
                <MaterialIcon name="star" className="text-[#F59E0B] text-[18px]" filled />
                <span className="text-label-md font-semibold text-on-surface">{restaurant.rating}</span>
              </div>
              <span className="text-body-sm text-on-surface-variant mt-1">
                ({restaurant.ratingCount.toLocaleString()} ratings)
              </span>
            </button>
            <div className="flex flex-col border-l border-outline-variant pl-4">
              <div className="flex items-center gap-1">
                <MaterialIcon name="schedule" className="text-primary text-[18px]" />
                <span className="text-label-md font-semibold text-on-surface">{restaurant.eta}</span>
              </div>
              <span className="text-body-sm text-on-surface-variant mt-1">{restaurant.distance}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 mt-6">
        <div className="bg-secondary-container text-on-secondary-container rounded-xl p-4 flex items-center gap-4 shadow-sm relative overflow-hidden">
          <MaterialIcon name="local_offer" className="text-[24px] relative z-10" />
          <div className="relative z-10">
            <p className="text-label-md font-semibold">{restaurant.promoTitle}</p>
            <p className="text-body-sm opacity-90 mt-1">Use code: {restaurant.promoCode}</p>
          </div>
        </div>
      </section>

      <div className="sticky top-0 z-30 bg-surface/95 backdrop-blur-md shadow-sm mt-6 scroll-mt-16">
        <div className="w-full overflow-x-auto no-scrollbar px-4 py-3 border-b border-surface-variant/50">
          <div className="flex gap-3 w-max">
            {restaurant.categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => scrollToCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-label-md font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-[#F59E0B]/10 text-[#D97706] border border-[#F59E0B]/20'
                    : 'bg-surface-container text-on-surface-variant hover:bg-surface-variant'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="px-4 pt-6 pb-8">
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
              <h2 className="text-headline-sm font-semibold text-on-surface flex items-center gap-2 mb-4">
                {cat.emoji && <span className="text-xl">{cat.emoji}</span>}
                {cat.label}
              </h2>
              <div className="flex flex-col gap-4">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className="bg-surface-container-lowest rounded-xl p-4 flex gap-4 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
                  >
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <button type="button" onClick={() => openItem(item)} className="text-left">
                        <h3 className="text-headline-sm font-semibold text-on-surface">{item.name}</h3>
                        <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-2 mt-1">{item.description}</p>
                        <p className="text-headline-sm font-semibold text-primary">{formatJmd(item.price)}</p>
                      </button>
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(item)}
                          className={`px-4 py-1.5 rounded-lg text-label-md font-semibold active:scale-95 transition-transform inline-flex items-center gap-1 ${
                            index === 0 && item.featured
                              ? 'bg-primary-container text-on-primary'
                              : 'border border-primary-container text-primary-container bg-transparent'
                          }`}
                        >
                          <MaterialIcon name="add" className="text-sm" />
                          Add
                        </button>
                      </div>
                    </div>
                    <button type="button" onClick={() => openItem(item)} className="w-24 h-24 shrink-0 rounded-lg overflow-hidden">
                      <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
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
