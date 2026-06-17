import { useCallback, useEffect, useState } from 'react';
import { SAVED_PAYMENT_METHODS_CHANGED_EVENT } from '@/lib/savedPaymentMethods';
import {
  getDefaultPaymentMethodId,
  getPaymentMethodById,
  PAYMENT_METHOD_CHANGED_EVENT,
  setDefaultPaymentMethodId,
  type TripPaymentMethodId,
} from '@/lib/tripPaymentMethods';

/** Shared default payment method for home booking + wallet screens. */
export function useDefaultPaymentMethod() {
  const [selectedId, setSelectedId] = useState<TripPaymentMethodId>(getDefaultPaymentMethodId);

  useEffect(() => {
    const sync = () => setSelectedId(getDefaultPaymentMethodId());
    window.addEventListener('storage', sync);
    window.addEventListener(PAYMENT_METHOD_CHANGED_EVENT, sync);
    window.addEventListener(SAVED_PAYMENT_METHODS_CHANGED_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(PAYMENT_METHOD_CHANGED_EVENT, sync);
      window.removeEventListener(SAVED_PAYMENT_METHODS_CHANGED_EVENT, sync);
    };
  }, []);

  const select = useCallback((id: TripPaymentMethodId) => {
    setDefaultPaymentMethodId(id);
    setSelectedId(id);
  }, []);

  return {
    selectedId,
    selectedMethod: getPaymentMethodById(selectedId),
    select,
  };
}
