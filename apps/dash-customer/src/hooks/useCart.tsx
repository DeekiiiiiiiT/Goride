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
  addItem: (item: Omit<CartItem, 'id'>, merchantName: string) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(CART_STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setItems(parsed.items || []);
        setMerchantId(parsed.merchantId || null);
        setMerchantName(parsed.merchantName || null);
      } catch (e) {
        console.error('Failed to parse cart from storage', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ items, merchantId, merchantName }));
  }, [items, merchantId, merchantName]);

  const addItem = (item: Omit<CartItem, 'id'>, mName: string) => {
    if (merchantId && merchantId !== item.merchantId) {
      if (!confirm(`You have items from ${merchantName} in your cart. Clear cart and add items from this restaurant?`)) {
        return;
      }
      setItems([{ ...item, id: generateCartItemId() }]);
      setMerchantId(item.merchantId);
      setMerchantName(mName);
      return;
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
        addItem,
        removeItem,
        updateQuantity,
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
