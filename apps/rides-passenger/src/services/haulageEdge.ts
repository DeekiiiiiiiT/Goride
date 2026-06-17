import { createIdempotencyKey } from '@/lib/idempotencyKey';
import type { HaulageBookingDraft, HaulageConfirmation } from '@/lib/haulage/types';
import { estimateHaulageTotalMinor } from '@/lib/haulage/pricing';

export type HaulageSubmitPayload = HaulageBookingDraft & {
  idempotencyKey: string;
};

/**
 * Stub submit until haulage booking API is available.
 * Replace with edge function call when backend contract is defined.
 */
export async function submitHaulageBooking(
  draft: HaulageBookingDraft,
): Promise<HaulageConfirmation> {
  const idempotencyKey = createIdempotencyKey();
  void idempotencyKey;

  await new Promise((resolve) => setTimeout(resolve, 600));

  if (!draft.pickup || !draft.dropoff || draft.items.length === 0) {
    throw new Error('Incomplete haulage booking');
  }

  const { totalMinor } = estimateHaulageTotalMinor(
    draft.items,
    draft.pickup,
    draft.dropoff,
  );

  const ref = `HLG-${Date.now().toString(36).toUpperCase().slice(-8)}`;

  return {
    bookingRef: ref,
    estimatedTotalMinor: totalMinor,
    currency: 'USD',
    itemCount: draft.items.length,
    pickupAddress: draft.pickup.address,
    dropoffAddress: draft.dropoff.address,
  };
}
