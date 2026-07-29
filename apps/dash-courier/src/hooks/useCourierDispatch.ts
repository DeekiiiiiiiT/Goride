import { useCallback, useEffect, useState } from 'react';
import { mockDispatchProvider } from '@/services/courierDispatch/MockDispatchProvider';
import { realDispatchProvider } from '@/services/courierDispatch/RealDispatchProvider';
import type { CourierDispatchService, DispatchState } from '@/services/courierDispatch/types';

/** Soft-launch default is real dispatch. Set VITE_COURIER_USE_MOCK_DISPATCH=true for demos. */
const defaultProvider: CourierDispatchService =
  (import.meta as ImportMeta & { env: Record<string, string> }).env.VITE_COURIER_USE_MOCK_DISPATCH ===
  'true'
    ? mockDispatchProvider
    : realDispatchProvider;

export function useCourierDispatch(provider: CourierDispatchService = defaultProvider) {
  const [state, setState] = useState<DispatchState>(() => provider.getState());

  useEffect(() => provider.subscribe(setState), [provider]);

  const goOnline = useCallback(() => provider.goOnline(), [provider]);
  const goOffline = useCallback(() => provider.goOffline(), [provider]);
  const receiveOffer = useCallback(
    (type: 'stacked' | 'single') => provider.receiveOffer(type),
    [provider],
  );
  const showOfferDetails = useCallback(() => provider.showOfferDetails(), [provider]);
  const dismissOfferDetails = useCallback(() => provider.dismissOfferDetails(), [provider]);
  const acceptOffer = useCallback((id: string) => provider.acceptOffer(id), [provider]);
  const declineOffer = useCallback(
    (id: string, reason?: Parameters<CourierDispatchService['declineOffer']>[1]) =>
      provider.declineOffer(id, reason),
    [provider],
  );
  const expireOffer = useCallback(() => provider.expireOffer(), [provider]);
  const setDeliveryPhase = useCallback(
    (phase: DispatchState['deliveryPhase']) => provider.setDeliveryPhase(phase),
    [provider],
  );
  const setMode = useCallback((mode: DispatchState['mode']) => provider.setMode(mode), [provider]);
  const finishDelivery = useCallback(() => provider.finishDelivery(), [provider]);
  const cancelDelivery = useCallback(() => provider.cancelDelivery(), [provider]);

  return {
    ...state,
    provider,
    goOnline,
    goOffline,
    receiveOffer,
    showOfferDetails,
    dismissOfferDetails,
    acceptOffer,
    declineOffer,
    expireOffer,
    setDeliveryPhase,
    setMode,
    finishDelivery,
    cancelDelivery,
  };
}
