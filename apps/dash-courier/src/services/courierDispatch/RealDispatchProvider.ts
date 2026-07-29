import { assertOnline } from '@/lib/networkGuard';
import {
  acceptCourierOffer,
  acceptDeliveryOrder,
  declineCourierOffer,
  fetchAvailableOrders,
  fetchCourierOffers,
  putCourierAvailability,
  type AvailableOrder,
  type CourierOfferRow,
} from '@/lib/courierApi';
import type {
  AcceptOfferResult,
  CourierDispatchService,
  DeclineReasonPayload,
  DispatchListener,
  DispatchState,
  HomeMode,
} from './types';

const INITIAL_STATE: DispatchState = {
  mode: 'offline',
  offerPhase: null,
  deliveryPhase: null,
  acceptedStacked: false,
};

/**
 * Soft-launch dispatch: availability write + pull available-orders / courier_offers.
 * Mock is only used when VITE_COURIER_USE_MOCK_DISPATCH=true.
 */
export class RealDispatchProvider implements CourierDispatchService {
  private state: DispatchState = { ...INITIAL_STATE };
  private listeners = new Set<DispatchListener>();
  private pollTimer: number | null = null;
  private pendingOffers: CourierOfferRow[] = [];
  private pendingOrders: AvailableOrder[] = [];
  private currentOfferId = '';
  private lastCoords: { lat?: number; lng?: number } = {};
  activeOrderId: string | null = null;

  getState(): DispatchState {
    return { ...this.state };
  }

  subscribe(listener: DispatchListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.getState();
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private setState(patch: Partial<DispatchState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  setLastCoords(lat?: number, lng?: number): void {
    this.lastCoords = { lat, lng };
  }

  getCurrentOfferId(): string {
    return this.currentOfferId;
  }

  getPendingOrder(): AvailableOrder | null {
    return this.pendingOrders[0] || this.pendingOffers[0]?.order || null;
  }

  goOnline(): void {
    assertOnline();
    this.setState({ mode: 'going-online' });
    void this.completeGoOnline();
  }

  private async completeGoOnline(): Promise<void> {
    const ok = await putCourierAvailability({
      isOnline: true,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
    });
    if (!ok) {
      this.setState({ mode: 'offline' });
      return;
    }
    this.setState({ mode: 'online' });
    this.startPolling();
  }

  setMode(mode: HomeMode): void {
    this.setState({ mode });
    if (mode === 'online') this.startPolling();
    if (mode === 'offline') this.stopPolling();
  }

  goOffline(): void {
    this.stopPolling();
    void putCourierAvailability({
      isOnline: false,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
      activeOrderId: null,
    });
    this.setState({
      mode: 'offline',
      offerPhase: null,
      deliveryPhase: null,
      acceptedStacked: false,
    });
    this.pendingOffers = [];
    this.pendingOrders = [];
    this.currentOfferId = '';
    this.activeOrderId = null;
  }

  private startPolling(): void {
    this.stopPolling();
    void this.pollOffers();
    this.pollTimer = window.setInterval(() => {
      void this.pollOffers();
    }, 8000);
  }

  private stopPolling(): void {
    if (this.pollTimer != null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async pollOffers(): Promise<void> {
    if (this.state.mode !== 'online' || this.state.offerPhase !== null) return;

    const offers = await fetchCourierOffers();
    if (offers.length > 0) {
      this.pendingOffers = offers;
      this.pendingOrders = [];
      this.currentOfferId = offers[0].id;
      this.setState({ offerPhase: 'single' });
      return;
    }

    const orders = await fetchAvailableOrders();
    if (orders.length > 0) {
      this.pendingOrders = orders;
      this.pendingOffers = [];
      this.currentOfferId = orders[0].id;
      this.setState({ offerPhase: 'single' });
    }
  }

  receiveOffer(_type: 'stacked' | 'single'): void {
    if (this.state.mode !== 'online' || this.state.offerPhase !== null) return;
    void this.pollOffers();
  }

  showOfferDetails(): void {
    if (this.state.offerPhase === 'single') {
      this.setState({ offerPhase: 'details' });
    }
  }

  dismissOfferDetails(): void {
    if (this.state.offerPhase === 'details') {
      this.setState({ offerPhase: 'single' });
    }
  }

  acceptOffer(offerId: string): AcceptOfferResult {
    assertOnline();
    void this.acceptOfferAsync(offerId);
    this.setState({
      offerPhase: null,
      mode: 'on-delivery',
      deliveryPhase: 'pickup-nav',
      acceptedStacked: false,
    });
    this.stopPolling();
    return { deliveryPhase: 'pickup-nav', acceptedStacked: false };
  }

  private async acceptOfferAsync(offerId: string): Promise<void> {
    const fromOffer = this.pendingOffers.find((o) => o.id === offerId);
    if (fromOffer) {
      const result = await acceptCourierOffer(offerId);
      if (result.ok) {
        this.activeOrderId = result.order.id;
        await putCourierAvailability({
          isOnline: true,
          lat: this.lastCoords.lat,
          lng: this.lastCoords.lng,
          activeOrderId: result.order.id,
        });
      } else {
        this.setState({ mode: 'online', deliveryPhase: null });
        this.startPolling();
      }
      return;
    }

    const orderId = offerId || this.pendingOrders[0]?.id;
    if (!orderId) {
      this.setState({ mode: 'online', deliveryPhase: null });
      this.startPolling();
      return;
    }

    const result = await acceptDeliveryOrder(orderId);
    if (result.ok) {
      this.activeOrderId = result.order.id;
      await putCourierAvailability({
        isOnline: true,
        lat: this.lastCoords.lat,
        lng: this.lastCoords.lng,
        activeOrderId: result.order.id,
      });
    } else {
      this.setState({ mode: 'online', deliveryPhase: null });
      this.startPolling();
    }
  }

  declineOffer(offerId: string, _reason?: DeclineReasonPayload): void {
    const id = offerId || this.currentOfferId;
    if (this.pendingOffers.some((o) => o.id === id)) {
      void declineCourierOffer(id, _reason?.reasonId);
    }
    this.pendingOffers = this.pendingOffers.filter((o) => o.id !== id);
    this.pendingOrders = this.pendingOrders.filter((o) => o.id !== id);
    this.currentOfferId = '';
    this.setState({ offerPhase: null });
  }

  expireOffer(): void {
    this.setState({ offerPhase: null });
    this.currentOfferId = '';
  }

  setDeliveryPhase(phase: DispatchState['deliveryPhase']): void {
    this.setState({ deliveryPhase: phase });
  }

  finishDelivery(): void {
    this.activeOrderId = null;
    void putCourierAvailability({
      isOnline: true,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
      activeOrderId: null,
    });
    this.setState({
      mode: 'online',
      deliveryPhase: null,
      acceptedStacked: false,
    });
    this.startPolling();
  }

  cancelDelivery(): void {
    this.activeOrderId = null;
    void putCourierAvailability({
      isOnline: true,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
      activeOrderId: null,
    });
    this.setState({
      mode: 'online',
      deliveryPhase: null,
      acceptedStacked: false,
    });
    this.startPolling();
  }
}

export const realDispatchProvider = new RealDispatchProvider();
