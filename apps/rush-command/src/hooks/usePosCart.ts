import { useCallback, useMemo, useState } from 'react';
import { calculateOrderPricing } from '../lib/order-pricing';
import type { PosCartLine } from '../types/restaurant-mgmt';

function lineKey(menuItemId: string) {
  return `line-${menuItemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function usePosCart(taxRatePercent = 0) {
  const [lines, setLines] = useState<PosCartLine[]>([]);
  const [discount, setDiscount] = useState(0);

  const pricing = useMemo(
    () => calculateOrderPricing({ lines, taxRatePercent, discount }),
    [lines, taxRatePercent, discount],
  );

  const addItem = useCallback(
    (item: { id: string; name: string; price: number }, quantity = 1) => {
      setLines((current) => {
        const existing = current.find((line) => line.menuItemId === item.id && !line.modifiers?.length);
        if (existing) {
          return current.map((line) =>
            line.id === existing.id ? { ...line, quantity: line.quantity + quantity } : line,
          );
        }
        return [
          ...current,
          {
            id: lineKey(item.id),
            menuItemId: item.id,
            name: item.name,
            unitPrice: item.price,
            quantity,
          },
        ];
      });
    },
    [],
  );

  const updateQuantity = useCallback((lineId: string, quantity: number) => {
    if (quantity <= 0) {
      setLines((current) => current.filter((line) => line.id !== lineId));
      return;
    }
    setLines((current) =>
      current.map((line) => (line.id === lineId ? { ...line, quantity } : line)),
    );
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    setDiscount(0);
  }, []);

  return {
    lines,
    discount,
    setDiscount,
    pricing,
    addItem,
    updateQuantity,
    removeLine,
    clear,
    isEmpty: lines.length === 0,
  };
}
