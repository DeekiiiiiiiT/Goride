import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface CartItem {
  itemId: string;
  merchantId: string;
  name: string;
  price: number;
  quantity: number;
  options?: { name: string; choice: string; price: number }[];
  imageUrl?: string;
}

interface CartContextType {
  items: CartItem[];
  merchantId: string | null;
  merchantName: string | null;
  addItem: (item: CartItem, merchantName: string) => void;
  removeItem: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  subtotal: number;
  itemCount: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

const CART_STORAGE_KEY = 'roam-dash-cart';

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

  const addItem = (item: CartItem, mName: string) => {
    if (merchantId && merchantId !== item.merchantId) {
      if (!confirm(`You have items from ${merchantName} in your cart. Clear cart and add items from this restaurant?`)) {
        return;
      }
      setItems([{ ...item, quantity: 1 }]);
      setMerchantId(item.merchantId);
      setMerchantName(mName);
      return;
    }

    setItems(prev => {
      const existing = prev.find(i => i.itemId === item.itemId);
      if (existing) {
        return prev.map(i =>
          i.itemId === item.itemId
            ? { ...i, quantity: i.quantity + 1 }
            : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
    setMerchantId(item.merchantId);
    setMerchantName(mName);
  };

  const removeItem = (itemId: string) => {
    setItems(prev => {
      const newItems = prev.filter(i => i.itemId !== itemId);
      if (newItems.length === 0) {
        setMerchantId(null);
        setMerchantName(null);
      }
      return newItems;
    });
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemId);
      return;
    }
    setItems(prev =>
      prev.map(i => (i.itemId === itemId ? { ...i, quantity } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
    setMerchantId(null);
    setMerchantName(null);
  };

  const subtotal = items.reduce((sum, item) => {
    const optionsTotal = item.options?.reduce((s, o) => s + o.price, 0) || 0;
    return sum + (item.price + optionsTotal) * item.quantity;
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
