import type { FareBreakdown, RideRequestRow } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { readTipMinor } from '@/lib/activityTripDetailsUtils';

export type ReceiptFareLines = {
  totalMinor: number;
  tripFareMinor: number;
  subtotalMinor: number;
  bookingFeeMinor: number;
  tipMinor: number;
  currency: string;
  hasBreakdown: boolean;
};

function resolveBreakdown(ride: RideRequestRow): FareBreakdown | null {
  const raw = ride.fare_final_breakdown ?? ride.fare_breakdown;
  return raw && typeof raw === 'object' ? raw : null;
}

export function buildReceiptFareLines(ride: RideRequestRow): ReceiptFareLines {
  const currency = ride.currency ?? 'JMD';
  const breakdown = resolveBreakdown(ride);
  const tipMinor = readTipMinor(ride);
  const totalMinor = Number(ride.fare_final_minor ?? ride.fare_estimate_minor ?? 0);

  if (!breakdown) {
    const bookingFeeMinor = 0;
    const tripFareMinor = Math.max(0, totalMinor - tipMinor);
    return {
      totalMinor: totalMinor + tipMinor,
      tripFareMinor,
      subtotalMinor: tripFareMinor,
      bookingFeeMinor,
      tipMinor,
      currency,
      hasBreakdown: false,
    };
  }

  const bookingFeeMinor = Number(breakdown.booking_fee_minor ?? 0);
  const afterSurge = Number(breakdown.after_surge_minor ?? breakdown.fare_estimate_minor ?? totalMinor);
  const tripFareMinor = Math.max(0, afterSurge - bookingFeeMinor);

  return {
    totalMinor: totalMinor + tipMinor,
    tripFareMinor,
    subtotalMinor: tripFareMinor,
    bookingFeeMinor,
    tipMinor,
    currency,
    hasBreakdown: true,
  };
}

export function formatReceiptAmount(minor: number, currency: string): string {
  return formatMoneyMinor(minor, currency).replace(/^[A-Z]{3}\s+/i, '').trim();
}

export function receiptPassengerLabel(
  ride: RideRequestRow,
  participantRole: 'booker' | 'passenger',
): string {
  const guest = ride.guest_passenger_name?.trim();
  if (guest && participantRole === 'booker') return guest.toUpperCase();
  if (participantRole === 'passenger') return 'your ride';
  return 'your ride';
}

export function receiptPaymentLabel(ride: RideRequestRow): { title: string; subtitle: string } {
  const method = ride.payment_method ?? 'cash';
  const when = ride.completed_at ?? ride.updated_at ?? ride.created_at;
  const subtitle = when
    ? new Date(when).toLocaleString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : '—';

  if (method === 'card') {
    return { title: 'Card payment', subtitle };
  }
  return { title: 'Cash', subtitle };
}
