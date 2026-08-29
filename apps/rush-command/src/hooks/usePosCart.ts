import { useCallback, useMemo, useState } from 'react';
import { calculateOrderPricing } from '../lib/order-pricing';
import type { PosCartLine } from '../types/restaurant-mgmt';

function lineKey(menuItemId: string) {
  return `line-${menuItemId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const EMPTY_PRICING = { subtotal: 0, tax: 0, discount: 0, total: 0 };

/** taxRatePercent null = rate unresolved (registered merchants must not price). */
export function usePosCart(
  taxRatePercent: number | null,
  gctRegistered = true,
) {
  const [lines, setLines] = useState<PosCartLine[]>([]);
  const [discount, setDiscount] = useState(0);

  const rateBlocked =
    gctRegistered !== false &&
    (taxRatePercent == null || !Number.isFinite(taxRatePercent));

  const pricing = useMemo(() => {
    if (rateBlocked) {
      // Still show subtotal for UX; tax/total withheld until rate loads
      try {
        const sub = calculateOrderPricing({
          lines,
          taxRatePercent: 0,
          gctRegistered: false,
          discount,
        });
        return { ...sub, tax: 0, total: sub.subtotal - (discount || 0) };
      } catch {
        return EMPTY_PRICING;
      }
    }
    try {
      return calculateOrderPricing({
        lines,
        taxRatePercent: taxRatePercent as number,
        gctRegistered,
        discount,
      });
    } catch {
      return EMPTY_PRICING;
    }
  }, [lines, taxRatePercent, gctRegistered, discount, rateBlocked]);

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
    rateBlocked,
  };
}
