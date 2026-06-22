import { useEffect, useMemo, useState } from 'react';
import { resolveVerticalType } from '@roam/vertical-config';
import RestaurantPage from './RestaurantPage';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { FavoriteButton } from '@/components/ui/FavoriteButton';
import { useCart } from '@/hooks/useCart';
import { formatJmd } from '@/lib/restaurantContent';
import { fetchDiscoverMerchants } from '@/lib/merchantDiscovery';
import { getSavedAddress } from '@/lib/addressStorage';

type Props = {
  merchantId?: string;
  verticalType?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

type GroceryProduct = {
  id: string;
  name: string;
  price: number;
  unit: string;
  image: string;
  category: string;
};

const GROCERY_HERO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC9zpbZpaIuGGcHz0R-UxtaiP-EbPxKOLY-2q_MvLEu5StPRsZGT1bZ6BTDARLUZMRJWy8I7rP-cig0H40VgXCnDYkKQaLgT6dqtoDL0YVOUbV6JdaJlyzR4ucTqCbio0NYwrBe_bN7pRw9tTKWb66OndckPQhYo1p-Dcayexpk_9y2Y4MKMVDBAHIL3FDqbrJHfnJIjfrDlO_WOmeJIUFBId87pqvSkUqgCRqqHRc-OCDadNaVxDa4MRHkbAApzycax7ZYOliTK_M';

const GROCERY_PRODUCTS: GroceryProduct[] = [
  {
    id: 'bananas',
    name: 'Bananas',
    price: 180,
    unit: '/lb',
    category: 'produce',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuD26RkUVX5G_bJlZNga6LzL4mh9hm0vn_dUyzUZNCOoti89HRoQwESLcNggt2PopFoTWPRE4DloAE-xv-eUZN5wv9oa75VobKYbyBwvGEWtUVOXvhdILGS2oQWUOmdhyek1praIm8ExyDQIFlmZ7NEA2HAVsuHNMQCz5H44V8W5j_abb3AynqI_NjL6Gp_uGTfunsdh-N92ugtBL8m0CgZvxtjHJre8y5whA1TA5X3bRuVnn3mtjxx-BvU4j8JfzxOeZk0no2d0L6E',
  },
  {
    id: 'whole-milk',
    name: 'Whole Milk 1L',
    price: 520,
    unit: '',
    category: 'dairy',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDYiqqn23Wnp_T90sjSkkNjRxy1zQNNl1t42KEcwyQuApCIuZyJPC_unWFwg9n_eqd2KjiJuJTEcWKD4UAbwh1Gb4O2KyqsTOa55zZLLkWD4loZcGxPOcx7RxMqX03yHQusE6mQ7qWBHCXn-SawSaoWsAvCvGDgAmlaYINUHD1fBxR2KcMui7dVrEGG0sKptr3jAdfiPCbqGGNvynqtbu3gEqhhwXZEr5zRTFqMB47C_4C8MkAV5tX9zts8l2GM3pELFXXkLgytY2g',
  },
  {
    id: 'sliced-bread',
    name: 'Sliced Bread',
    price: 350,
    unit: '',
    category: 'pantry',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCjyBJR6Kh6bskMShvuljl4-4xSdNA0rHl3V3HANnE__IaYKjwwrqNig6itgiRh_hn9ZA3l63yO11Vq0QDMzNNuJzvk-d51KsUxbxBN5rN8jIMW8I6bU4XIbvF6rp1oOJlrY53rCE3BOQ1Tu0egsMW6QJolYXtpUWW7xMs5jNEAs_mPzXi016x20Q8Eciz_7uIqxHAAladUjax6vy5HGXhZpqvEEATbr0n7LKXnnEoceR1q3Tbnoj5j40mLX2F8crbyLJU8kOfGk1c',
  },
  {
    id: 'fresh-peppers',
    name: 'Fresh Peppers',
    price: 120,
    unit: '/unit',
    category: 'produce',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAO0ggDMh55g3_mPyGcNuzJHwAJnsuQ-uqrGbrhJo3w59_7Jpg-IkZY96AOLRdvWm5JVA8BkqLu-yAIaJeDHB-uTOZh5UQEhbVWm54kvoCvpTCRDUa7y9Vz6npLD3k5rM1QOkKext9gzYpYlj7KCtRtlBG21Dd4s4l7ymzCIZE-NBoB18STLkxh8_unC2n9Mva4Qx7yvz4mYCSvXgIP2UFZxyx4TWMZ4eMy3m-0JmKsdt0ntrL3gAPnYI-fnqyhQbnNX85lzO1ofeM',
  },
];

const CATEGORIES = [
  { id: 'produce', label: 'Produce' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'pantry', label: 'Pantry' },
  { id: 'drinks', label: 'Drinks' },
  { id: 'household', label: 'Household' },
];

function GroceryStoreView({
  merchantId,
  onNavigate,
}: {
  merchantId?: string;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
}) {
  const storeId = merchantId ?? 'fresh-mart';
  const { addItem, updateQuantity, items, itemCount, subtotal, merchantId: cartMerchantId } = useCart();
  const [storeName, setStoreName] = useState('Fresh Mart');
  const [activeCategory, setActiveCategory] = useState('produce');
  const [search, setSearch] = useState('');
  const savedAddress = getSavedAddress();
  const deliveryLabel = savedAddress
    ? `Deliver to · ${savedAddress.line1}`
    : 'Deliver to · Kingston, JM';

  useEffect(() => {
    void fetchDiscoverMerchants('grocery').then((merchants) => {
      const match = merchants.find((m) => m.id === storeId);
      if (match) setStoreName(match.name);
    });
  }, [storeId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GROCERY_PRODUCTS.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (activeCategory === 'produce') return true;
      return p.category === activeCategory;
    });
  }, [activeCategory, search]);

  const getQty = (productId: string) => {
    const match = items.find((i) => i.itemId === productId && i.merchantId === storeId);
    return match?.quantity ?? 0;
  };

  const getCartItemId = (productId: string) =>
    items.find((i) => i.itemId === productId && i.merchantId === storeId)?.id;

  const changeQty = (product: GroceryProduct, delta: number) => {
    const current = getQty(product.id);
    const next = current + delta;
    const cartItemId = getCartItemId(product.id);

    if (next <= 0 && cartItemId) {
      updateQuantity(cartItemId, 0);
      return;
    }

    if (current === 0 && delta > 0) {
      addItem(
        {
          itemId: product.id,
          merchantId: storeId,
          name: product.name,
          price: product.price,
          quantity: 1,
          imageUrl: product.image,
        },
        storeName,
      );
      return;
    }

    if (cartItemId) {
      updateQuantity(cartItemId, next);
    }
  };

  const showCart = itemCount > 0 && cartMerchantId === storeId;

  return (
    <div className="min-h-full bg-background pb-36">
      <header className="sticky top-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant/30 bg-surface px-4 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate('home')}
            className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-surface-container active:scale-95"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <span className="text-label-md text-on-surface-variant">{deliveryLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface-container">
            <MaterialIcon name="share" />
          </button>
          <FavoriteButton merchantId={storeId} merchantName={storeName} />
        </div>
      </header>

      <section className="relative h-56 w-full overflow-hidden">
        <img alt={storeName} src={GROCERY_HERO} className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4 text-white">
          <span className="rounded bg-primary px-2 py-0.5 text-xs font-bold tracking-wide text-on-primary">
            GROCERY
          </span>
          <h1 className="mt-1 text-headline-lg-mobile font-bold">{storeName}</h1>
          <div className="mt-1 flex items-center gap-4 text-label-md">
            <span className="flex items-center gap-1">
              <MaterialIcon name="star" className="text-sm" filled />
              4.6
            </span>
            <span className="flex items-center gap-1">
              <MaterialIcon name="schedule" className="text-sm" />
              35-50 min
            </span>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-6 px-4">
        <div className="flex h-14 items-center rounded-xl border border-outline-variant bg-surface-container-lowest px-4 shadow-lg">
          <MaterialIcon name="search" className="mr-3 text-on-surface-variant" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products..."
            className="w-full border-none bg-transparent text-body-lg focus:ring-0"
          />
          <button type="button" className="ml-2 flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-variant/50">
            <MaterialIcon name="tune" className="text-on-surface-variant" />
          </button>
        </div>
      </section>

      <nav className="mt-6 flex gap-3 overflow-x-auto px-4 no-scrollbar">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setActiveCategory(cat.id)}
            className={`whitespace-nowrap rounded-full px-6 py-2 text-label-lg font-semibold transition-transform active:scale-95 ${
              activeCategory === cat.id
                ? 'bg-primary-container text-on-primary-container'
                : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </nav>

      <section className="mt-6 px-4">
        <h2 className="mb-4 text-headline-md font-bold text-on-surface">Popular Items</h2>
        <div className="grid grid-cols-2 gap-4">
          {(search ? GROCERY_PRODUCTS.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())) : filteredProducts).map(
            (product) => {
              const qty = getQty(product.id);
              return (
                <div
                  key={product.id}
                  className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-white shadow-sm"
                >
                  <div className="relative h-40 bg-gray-100">
                    <img
                      alt={product.name}
                      src={product.image}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="flex flex-grow flex-col p-3">
                    <h3 className="truncate text-label-lg font-semibold text-on-surface">{product.name}</h3>
                    <p className="mt-1 text-body-md text-on-surface-variant">
                      {formatJmd(product.price)}
                      {product.unit}
                    </p>
                    <div className="mt-auto flex items-center justify-between pt-3">
                      <div className="flex items-center rounded-full border border-outline-variant bg-surface-container p-1">
                        <button
                          type="button"
                          disabled={qty === 0}
                          onClick={() => changeQty(product, -1)}
                          className={`flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-lowest transition-all active:scale-90 ${
                            qty === 0 ? 'cursor-not-allowed text-on-surface-variant opacity-50' : 'text-primary'
                          }`}
                        >
                          <MaterialIcon name="remove" className="text-sm font-bold" />
                        </button>
                        <span className="px-3 text-label-lg font-semibold">{qty}</span>
                        <button
                          type="button"
                          onClick={() => changeQty(product, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary transition-all active:scale-90"
                        >
                          <MaterialIcon name="add" className="text-sm font-bold" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            },
          )}
        </div>
      </section>

      {showCart && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-screen-sm">
          <button
            type="button"
            onClick={() => onNavigate('cart')}
            className="flex h-16 w-full items-center justify-between rounded-xl bg-primary-container px-6 shadow-xl transition-all active:scale-95"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-bold text-on-primary">
                {itemCount}
              </div>
              <div className="flex flex-col items-start">
                <span className="text-label-lg font-semibold text-on-primary-container">View Cart</span>
                <span className="text-sm text-on-primary-container/90">{storeName}</span>
              </div>
            </div>
            <span className="text-headline-md font-bold text-on-primary-container">{formatJmd(subtotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function StorePage({ merchantId, verticalType, onNavigate }: Props) {
  const vertical = resolveVerticalType(verticalType);

  useEffect(() => {
    sessionStorage.setItem('roam_cart_vertical', vertical);
  }, [vertical]);

  if (vertical === 'grocery' || vertical === 'convenience' || vertical === 'retail') {
    return <GroceryStoreView merchantId={merchantId} onNavigate={onNavigate} />;
  }

  return <RestaurantPage merchantId={merchantId} onNavigate={onNavigate} />;
}
