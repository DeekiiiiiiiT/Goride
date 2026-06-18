import { API_ENDPOINTS, publicAnonKey } from '@roam/api-client';
import { supabase } from '@roam/auth-client';
import { createIdempotencyKey } from '@/lib/idempotencyKey';
import type {
  HaulageBookResponse,
  HaulageQuoteRequest,
  HaulageQuoteResponse,
} from '@roam/types/haulage';
import type { HaulageBookingDraft, HaulageConfirmation } from '@/lib/haulage/types';

async function haulageHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? publicAnonKey;
  return {
    Authorization: `Bearer ${token}`,
    apikey: publicAnonKey,
    'Content-Type': 'application/json',
  };
}

export async function haulageQuote(
  request: HaulageQuoteRequest,
): Promise<HaulageQuoteResponse> {
  const res = await fetch(`${API_ENDPOINTS.rides}/v1/haulage/quote`, {
    method: 'POST',
    headers: await haulageHeaders(),
    body: JSON.stringify(request),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Quote failed (${res.status})`);
  }
  return body as HaulageQuoteResponse;
}

export type HaulageSubmitInput = HaulageBookingDraft & {
  quoteToken: string;
  paymentMethod?: string | null;
};

export async function submitHaulageBooking(
  draft: HaulageSubmitInput,
): Promise<HaulageConfirmation> {
  if (!draft.pickup || !draft.dropoff || draft.items.length === 0 || !draft.quoteToken) {
    throw new Error('Incomplete haulage booking');
  }

  const idempotencyKey = createIdempotencyKey();
  const res = await fetch(`${API_ENDPOINTS.rides}/v1/haulage/requests`, {
    method: 'POST',
    headers: await haulageHeaders(),
    body: JSON.stringify({
      quote_token: draft.quoteToken,
      idempotency_key: idempotencyKey,
      payment_method: draft.paymentMethod ?? draft.paymentMethodId,
      pickup: draft.pickup,
      dropoff: draft.dropoff,
      items: draft.items.map((item) => ({
        item_id: item.templateId,
        variant_id: item.variantId,
        qty: 1,
      })),
      pickup_window_minutes: 10,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error ?? `Booking failed (${res.status})`);
  }
  const data = body as HaulageBookResponse;
  return {
    bookingRef: data.booking_ref,
    rideRequestId: data.ride_request_id,
    estimatedTotalMinor: data.estimated_total_minor,
    currency: data.currency,
    itemCount: draft.items.length,
    pickupAddress: draft.pickup.address,
    dropoffAddress: draft.dropoff.address,
    bookingKind: data.booking_kind,
    scheduledPickupAt: data.scheduled_pickup_at ?? null,
  };
}
