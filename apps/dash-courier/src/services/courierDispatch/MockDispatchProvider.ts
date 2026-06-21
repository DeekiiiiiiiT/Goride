import { assertOnline } from '@/lib/networkGuard';
import {
  MOCK_DETAILED_OFFER,
  MOCK_SINGLE_OFFER,
  MOCK_STACKED_OFFER,
} from '@/lib/mockOffers';
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

export class MockDispatchProvider implements CourierDispatchService {
  private state: DispatchState = { ...INITIAL_STATE };

  private listeners = new Set<DispatchListener>();

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

  goOnline(): void {
    assertOnline();
    this.setState({ mode: 'going-online' });
  }

  setMode(mode: HomeMode): void {
    this.setState({ mode });
  }

  goOffline(): void {
    this.setState({
      mode: 'offline',
      offerPhase: null,
      deliveryPhase: null,
      acceptedStacked: false,
    });
  }

  receiveOffer(type: 'stacked' | 'single'): void {
    if (this.state.mode !== 'online' || this.state.offerPhase !== null) return;
    this.setState({ offerPhase: type });
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
    const isStacked =
      offerId === MOCK_STACKED_OFFER.id || this.state.offerPhase === 'stacked';

    if (isStacked) {
      this.setState({
        offerPhase: null,
        mode: 'on-delivery',
        deliveryPhase: 'stacked-active',
        acceptedStacked: true,
      });
      return { deliveryPhase: 'stacked-active', acceptedStacked: true };
    }

    this.setState({
      offerPhase: null,
      mode: 'on-delivery',
      deliveryPhase: 'pickup-nav',
      acceptedStacked: false,
    });
    return { deliveryPhase: 'pickup-nav', acceptedStacked: false };
  }

  declineOffer(_offerId: string, _reason?: DeclineReasonPayload): void {
    this.setState({ offerPhase: null });
  }

  expireOffer(): void {
    this.setState({ offerPhase: null });
  }

  setDeliveryPhase(phase: DispatchState['deliveryPhase']): void {
    this.setState({ deliveryPhase: phase });
  }

  finishDelivery(): void {
    this.setState({
      mode: 'online',
      deliveryPhase: null,
      acceptedStacked: false,
    });
  }

  cancelDelivery(): void {
    this.setState({
      mode: 'online',
      deliveryPhase: null,
      acceptedStacked: false,
    });
  }

  resolveOnline(): void {
    this.setState({ mode: 'online' });
  }

  getCurrentOfferId(): string {
    if (this.state.offerPhase === 'stacked') return MOCK_STACKED_OFFER.id;
    if (this.state.offerPhase === 'details') return MOCK_DETAILED_OFFER.id;
    if (this.state.offerPhase === 'single') return MOCK_SINGLE_OFFER.id;
    return '';
  }
}

export const mockDispatchProvider = new MockDispatchProvider();
