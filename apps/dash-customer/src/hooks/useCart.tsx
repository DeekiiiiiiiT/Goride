import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ModifierSelection {
  name: string;
  priceAdjustment: number;
}

interface ItemOption {
  name: string;
  selections: ModifierSelection[];
}

export interface CartItem {
  id: string;
  itemId: string;
  merchantId: string;
  name: string;
  price: number;
  quantity: number;
  options?: ItemOption[];
  imageUrl?: string;
}

interface CartContextType {
  items: CartItem[];
  merchantId: string | null;
  merchantName: string | null;
  cartHydrated: boolean;
  addItem: (item: Omit<CartItem, 'id'>, merchantName: string, options?: { replace?: boolean }) => 'added' | 'conflict';
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  replaceItem: (cartItemId: string, item: Omit<CartItem, 'id'>) => void;
  getCartItem: (cartItemId: string) => CartItem | undefined;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'roam-dash-cart';

const generateCartItemId = () => Math.random().toString(36).substring(2, 11);

const getOptionsHash = (options?: ItemOption[]) => {
  if (!options || options.length === 0) return '';
  return JSON.stringify(options.map(o => ({
    name: o.name,
    selections: o.selections.map(s => s.name).sort(),
  })));
};

type StoredCart = {
  items: CartItem[];
  merchantId: string | null;
  merchantName: string | null;
};

function readStoredCart(): StoredCart {
  if (typeof window === 'undefined') {
    return { items: [], merchantId: null, merchantName: null };
  }
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (!saved) {
    return { items: [], merchantId: null, merchantName: null };
  }
  try {
    const parsed = JSON.parse(saved) as Partial<StoredCart>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      merchantId: parsed.merchantId ?? null,
      merchantName: parsed.merchantName ?? null,
    };
  } catch (e) {
    console.error('Failed to parse cart from storage', e);
    return { items: [], merchantId: null, merchantName: null };
  }
}

function normalizeMerchantId(id: string): string {
  return id.trim().toLowerCase();
}

function isSameMerchant(cartMerchantId: string, itemMerchantId: string): boolean {
  return normalizeMerchantId(cartMerchantId) === normalizeMerchantId(itemMerchantId);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [storedCart] = useState(readStoredCart);
  const [items, setItems] = useState<CartItem[]>(storedCart.items);
  const [merchantId, setMerchantId] = useState<string | null>(storedCart.merchantId);
  const [merchantName, setMerchantName] = useState<string | null>(storedCart.merchantName);
  const [cartHydrated, setCartHydrated] = useState(false);

  useEffect(() => {
    setCartHydrated(true);
  }, []);

  useEffect(() => {
    if (!cartHydrated) return;
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items, merchantId, merchantName }));
  }, [items, merchantId, merchantName, cartHydrated]);

  const addItem = (item: Omit<CartItem, 'id'>, mName: string, options?: { replace?: boolean }): 'added' | 'conflict' => {
    if (merchantId && !isSameMerchant(merchantId, item.merchantId) && !options?.replace) {
      return 'conflict';
    }

    if (merchantId && !isSameMerchant(merchantId, item.merchantId) && options?.replace) {
      setItems([{ ...item, id: generateCartItemId() }]);
      setMerchantId(item.merchantId);
      setMerchantName(mName);
      return 'added';
    }

    setItems(prev => {
      const newOptionsHash = getOptionsHash(item.options);
      const existing = prev.find(i =>
        i.itemId === item.itemId && getOptionsHash(i.options) === newOptionsHash
      );

      if (existing) {
        return prev.map(i =>
          i.id === existing.id
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, { ...item, id: generateCartItemId() }];
    });
    setMerchantId(item.merchantId);
    setMerchantName(mName);
    return 'added';
  };

  const removeItem = (cartItemId: string) => {
    setItems(prev => {
      const newItems = prev.filter(i => i.id !== cartItemId);
      if (newItems.length === 0) {
        setMerchantId(null);
        setMerchantName(null);
      }
      return newItems;
    });
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(cartItemId);
      return;
    }
    setItems(prev =>
      prev.map(i => (i.id === cartItemId ? { ...i, quantity } : i))
    );
  };

  const getCartItem = (cartItemId: string): CartItem | undefined => {
    return items.find(i => i.id === cartItemId);
  };

  const replaceItem = (cartItemId: string, item: Omit<CartItem, 'id'>) => {
    setItems(prev => {
      const index = prev.findIndex(i => i.id === cartItemId);
      if (index < 0) return prev;
      const next = [...prev];
      next[index] = { ...item, id: cartItemId };
      return next;
    });
    setMerchantId(item.merchantId);
  };

  const clearCart = () => {
    setItems([]);
    setMerchantId(null);
    setMerchantName(null);
  };

  const subtotal = items.reduce((sum, item) => {
    return sum + item.price * item.quantity;
  }, 0);

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        merchantId,
        merchantName,
        cartHydrated,
        addItem,
        removeItem,
        updateQuantity,
        replaceItem,
        getCartItem,
        clearCart,
        subtotal,
        itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
