/** Status-aware copy and actions for Book for me (requester) trip intents. */

import i18n from '@/i18n';

function t(key: string, opts?: Record<string, unknown>): string {
  return i18n.t(key, { ns: 'booking', ...opts });
}

export const TERMINAL_LINKED_RIDE_STATUSES = new Set(['completed', 'cancelled']);

export type BookForMeIntentPhase = {
  status: string;
  linked_ride_status?: string | null;
};

export function isLiveLinkedRideStatus(status: string | null | undefined): boolean {
  return Boolean(status && !TERMINAL_LINKED_RIDE_STATUSES.has(status));
}

export type BookForMeFooterAction = 'withdraw' | 'dismiss' | 'none';

/** Hub row side control — claimed trips open an actions sheet instead of inline cancel. */
export type BookForMeHubSideAction = 'actions' | 'cancel' | 'dismiss' | 'none';

export function bookForMeHubSideAction(intent: BookForMeIntentPhase): BookForMeHubSideAction {
  if (intent.status === 'claimed') return 'actions';
  if (intent.status === 'published') return 'cancel';
  const footer = bookForMeFooterAction(intent);
  if (footer === 'dismiss') return 'dismiss';
  if (footer === 'withdraw') return 'cancel';
  return 'none';
}

export function bookForMeFooterAction(intent: BookForMeIntentPhase): BookForMeFooterAction {
  if (intent.status === 'published') return 'withdraw';
  if (intent.status === 'claimed') return 'none';
  if (intent.status !== 'booked') return 'none';

  const linked = intent.linked_ride_status ?? null;
  if (linked === 'completed' || linked === 'cancelled') return 'dismiss';
  if (isLiveLinkedRideStatus(linked)) return 'none';
  return 'withdraw';
}

export function bookForMeHeadline(intent: BookForMeIntentPhase): string {
  if (intent.status === 'booked') {
    if (intent.linked_ride_status === 'cancelled') return t('bookForMe.headline.rideEnded');
    if (intent.linked_ride_status === 'completed') return t('bookForMe.headline.tripComplete');
    if (isLiveLinkedRideStatus(intent.linked_ride_status)) return t('bookForMe.headline.tripInProgress');
    return t('bookForMe.headline.findingDriver');
  }
  if (intent.status === 'claimed') return t('bookForMe.headline.payerAgreed');
  return t('bookForMe.headline.waitingForPayer');
}

export function bookForMeDetail(
  intent: BookForMeIntentPhase,
  opts?: { bookCountdown?: string | null },
): string {
  if (intent.status === 'booked') {
    if (intent.linked_ride_status === 'cancelled') {
      return t('bookForMe.detail.rideCancelled');
    }
    if (intent.linked_ride_status === 'completed') {
      return t('bookForMe.detail.tripFinished');
    }
    if (isLiveLinkedRideStatus(intent.linked_ride_status)) {
      return t('bookForMe.detail.rideUnderway');
    }
    return t('bookForMe.detail.bookerPaid');
  }
  if (intent.status === 'claimed') {
    const countdown = opts?.bookCountdown;
    return countdown
      ? t('bookForMe.detail.bookCountdown', { countdown })
      : t('bookForMe.detail.bookNow');
  }
  return '';
}

export function bookForMeFooterLabel(action: BookForMeFooterAction, loading: boolean): string {
  if (loading) return action === 'dismiss' ? t('bookForMe.footer.closing') : t('bookForMe.cancelling');
  if (action === 'dismiss') return t('bookForMe.footer.backToHome');
  if (action === 'withdraw') return t('bookForMe.cancelTrip');
  return '';
}

export function bookForMeHubStatusLabel(
  intent: BookForMeIntentPhase,
  opts?: { bookCountdown?: string | null },
): string {
  if (intent.status === 'booked') {
    if (intent.linked_ride_status === 'cancelled') return 'Ride ended';
    if (intent.linked_ride_status === 'completed') return 'Trip complete';
    if (isLiveLinkedRideStatus(intent.linked_ride_status)) return 'Trip in progress';
    return 'Finding a driver';
  }
  if (intent.status === 'draft') return 'Finish setting up your trip';
  if (intent.status === 'published') return 'Waiting for payer to agree';
  if (intent.status === 'claimed') {
    const countdown = opts?.bookCountdown;
    return countdown ? `Payer agreed — book within ${countdown}` : 'Payer agreed — book your ride';
  }
  return 'Trip request live';
}
