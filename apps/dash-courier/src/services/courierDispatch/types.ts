import type { DeclineReasonId } from '@/lib/declineReasons';
import type { SingleOffer, StackedOffer } from '@/lib/mockOffers';

export type CourierOffer = SingleOffer | StackedOffer;

export type DeliveryPhase =
  | null
  | 'stacked-active'
  | 'pickup-nav'
  | 'at-restaurant'
  | 'en-route'
  | 'at-customer'
  | 'confirm-handoff'
  | 'customer-unavailable'
  | 'complete'
  | 'order-cancelled';

export type OfferPhase = null | 'stacked' | 'single' | 'details';

export type HomeMode = 'offline' | 'going-online' | 'online' | 'on-delivery';

export type DeclineReasonPayload = {
  reasonId?: DeclineReasonId;
  offerId?: string;
};

export type AcceptOfferResult = {
  deliveryPhase: DeliveryPhase;
  acceptedStacked: boolean;
};

export type DispatchState = {
  mode: HomeMode;
  offerPhase: OfferPhase;
  deliveryPhase: DeliveryPhase;
  acceptedStacked: boolean;
};

export type DispatchListener = (state: DispatchState) => void;

export interface CourierDispatchService {
  getState(): DispatchState;
  subscribe(listener: DispatchListener): () => void;
  goOnline(): void;
  goOffline(): void;
  receiveOffer(type: 'stacked' | 'single'): void;
  showOfferDetails(): void;
  dismissOfferDetails(): void;
  acceptOffer(offerId: string): AcceptOfferResult;
  declineOffer(offerId: string, reason?: DeclineReasonPayload): void;
  expireOffer(): void;
  setDeliveryPhase(phase: DeliveryPhase): void;
  setMode(mode: HomeMode): void;
  finishDelivery(): void;
  cancelDelivery(): void;
}
