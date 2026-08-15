import { assertOnline } from '@/lib/networkGuard';
import {
  acceptCourierOffer,
  acceptDeliveryOrder,
  declineCourierOffer,
  fetchAvailableOrders,
  fetchCourierOffers,
  fetchCourierOrderStatus,
  putCourierAvailability,
  subscribeCourierPush,
  type AvailableOrder,
  type CourierOfferRow,
} from '@/lib/courierApi';
import { requestCourierPermission } from '@/lib/courierPermissions';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
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
  private activeOrderPollTimer: number | null = null;
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

  getLastCoords(): { lat?: number; lng?: number } {
    return { ...this.lastCoords };
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

  /** Browser/native: ask for GPS before availability write so the permission prompt actually appears. */
  private async ensureGoOnlineLocation(): Promise<'granted' | 'denied' | 'unavailable'> {
    const perm = await requestCourierPermission('location');
    if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'unavailable';

    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 5000,
          });
        });
        this.setLastCoords(pos.coords.latitude, pos.coords.longitude);
        return 'granted';
      } catch {
        // Permission granted but GPS timed out — still allow online; coords optional on API.
        return 'granted';
      }
    }
    return 'granted';
  }

  private async completeGoOnline(): Promise<void> {
    const loc = await this.ensureGoOnlineLocation();
    if (loc === 'denied') {
      toast.error('Location required', 'Allow location access to go online and get delivery offers.');
      this.setState({ mode: 'offline' });
      return;
    }

    const result = await putCourierAvailability({
      isOnline: true,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
    });
    if (!result.ok) {
      toast.error('Could not go online', result.error || 'Try again in a moment.');
      this.setState({ mode: 'offline' });
      return;
    }
    this.setState({ mode: 'online' });
    this.startPolling();
    void this.ensurePushSubscription();
  }

  /** Best-effort web-push + native FCM/APNs subscribe for background offer alerts. */
  private async ensurePushSubscription(): Promise<void> {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        await this.ensureNativePushSubscription();
        return;
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!vapidKey) return;

      const registration = await navigator.serviceWorker.register('/sw.js').catch(() => null);
      if (!registration) return;

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        }));

      const json = subscription.toJSON();
      if (!json.endpoint) return;
      await subscribeCourierPush(json.endpoint, json.keys as Record<string, string> | undefined);
    } catch {
      // non-fatal — polling still works while foregrounded
    }
  }

  private async ensureNativePushSubscription(): Promise<void> {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { Capacitor } = await import('@capacitor/core');
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    const token = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          void PushNotifications.removeAllListeners();
          reject(new Error('Timed out waiting for push token'));
        }
      }, 20000);

      void PushNotifications.addListener('registration', (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(event.value);
      });
      void PushNotifications.addListener('registrationError', (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error(event.error || 'Push registration failed'));
      });

      void PushNotifications.register().catch((err: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(err instanceof Error ? err : new Error('Push registration failed'));
      });
    });

    const platform = Capacitor.getPlatform() === 'ios' ? 'apns' : 'fcm';
    await subscribeCourierPush(`${platform}:${token}`, undefined, platform);
  }

  setMode(mode: HomeMode): void {
    this.setState({ mode });
    if (mode === 'online') this.startPolling();
    if (mode === 'offline') {
      this.stopPolling();
      this.stopActiveOrderWatch();
    }
  }

  goOffline(): void {
    this.stopPolling();
    this.stopActiveOrderWatch();
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
    void this.startOffersRealtime();
  }

  private stopPolling(): void {
    if (this.pollTimer != null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    void this.stopOffersRealtime();
  }

  private offersChannel: { unsubscribe: () => void } | null = null;

  private async startOffersRealtime(): Promise<void> {
    await this.stopOffersRealtime();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const channel = supabase
        .channel(`courier-offers:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'delivery',
            table: 'courier_offers',
            filter: `courier_user_id=eq.${user.id}`,
          },
          () => {
            void this.pollOffers();
          },
        )
        .subscribe();
      this.offersChannel = { unsubscribe: () => { void supabase.removeChannel(channel); } };
    } catch {
      // polling remains the fallback
    }
  }

  private async stopOffersRealtime(): Promise<void> {
    if (this.offersChannel) {
      this.offersChannel.unsubscribe();
      this.offersChannel = null;
    }
  }

  /** Watch active order so merchant/admin cancel surfaces mid-delivery. */
  private orderChannel: { unsubscribe: () => void } | null = null;

  private startActiveOrderWatch(orderId: string): void {
    this.stopActiveOrderWatch();
    void this.pollActiveOrderStatus(orderId);
    this.activeOrderPollTimer = window.setInterval(() => {
      void this.pollActiveOrderStatus(orderId);
    }, 5000);
    void this.startOrderRealtime(orderId);
  }

  private stopActiveOrderWatch(): void {
    if (this.activeOrderPollTimer != null) {
      window.clearInterval(this.activeOrderPollTimer);
      this.activeOrderPollTimer = null;
    }
    void this.stopOrderRealtime();
  }

  private async startOrderRealtime(orderId: string): Promise<void> {
    await this.stopOrderRealtime();
    try {
      const channel = supabase
        .channel(`courier-order:${orderId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'delivery',
            table: 'orders',
            filter: `id=eq.${orderId}`,
          },
          (payload) => {
            const status = String((payload.new as { status?: string } | null)?.status ?? '');
            if (status === 'cancelled') {
              this.handleRemoteCancel();
            }
          },
        )
        .subscribe();
      this.orderChannel = { unsubscribe: () => { void supabase.removeChannel(channel); } };
    } catch {
      // polling remains the fallback
    }
  }

  private async stopOrderRealtime(): Promise<void> {
    if (this.orderChannel) {
      this.orderChannel.unsubscribe();
      this.orderChannel = null;
    }
  }

  private async pollActiveOrderStatus(orderId: string): Promise<void> {
    if (this.state.mode !== 'on-delivery' || this.activeOrderId !== orderId) return;
    if (this.state.deliveryPhase === 'order-cancelled' || this.state.deliveryPhase === 'complete') {
      return;
    }

    const row = await fetchCourierOrderStatus(orderId);
    if (!row) return;
    if (row.status === 'cancelled') {
      this.handleRemoteCancel();
    }
  }

  private handleRemoteCancel(): void {
    this.stopActiveOrderWatch();
    this.activeOrderId = null;
    void putCourierAvailability({
      isOnline: true,
      lat: this.lastCoords.lat,
      lng: this.lastCoords.lng,
      activeOrderId: null,
    });
    this.setState({
      mode: 'on-delivery',
      deliveryPhase: 'order-cancelled',
      acceptedStacked: false,
    });
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
        this.startActiveOrderWatch(result.order.id);
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
      this.startActiveOrderWatch(result.order.id);
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
    this.stopActiveOrderWatch();
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
    this.stopActiveOrderWatch();
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

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}