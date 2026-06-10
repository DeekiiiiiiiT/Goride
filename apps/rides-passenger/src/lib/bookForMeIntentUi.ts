/** Status-aware copy and actions for Book for me (requester) trip intents. */

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
    if (intent.linked_ride_status === 'cancelled') return 'Ride ended';
    if (intent.linked_ride_status === 'completed') return 'Trip complete';
    if (isLiveLinkedRideStatus(intent.linked_ride_status)) return 'Trip in progress';
    return 'Finding a driver';
  }
  if (intent.status === 'claimed') return 'Payer agreed — book your ride';
  return 'Your trip is waiting for a payer';
}

export function bookForMeDetail(
  intent: BookForMeIntentPhase,
  opts?: { bookCountdown?: string | null },
): string {
  if (intent.status === 'booked') {
    if (intent.linked_ride_status === 'cancelled') {
      return 'This ride was cancelled. Tap Back to home when you are ready to book again.';
    }
    if (intent.linked_ride_status === 'completed') {
      return 'Your trip finished successfully. Tap Back to home when you are done.';
    }
    if (isLiveLinkedRideStatus(intent.linked_ride_status)) {
      return 'Your ride is underway. Open the live trip to track your driver.';
    }
    return 'Your booker paid — we are matching a driver. You can cancel below if your plans changed.';
  }
  if (intent.status === 'claimed') {
    const countdown = opts?.bookCountdown;
    return countdown
      ? `You have ${countdown} left to book. Trip details are locked.`
      : 'Book now — trip details are locked.';
  }
  return '';
}

export function bookForMeFooterLabel(action: BookForMeFooterAction, loading: boolean): string {
  if (loading) return action === 'dismiss' ? 'Closing…' : 'Cancelling…';
  if (action === 'dismiss') return 'Back to home';
  if (action === 'withdraw') return 'Cancel trip';
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
