import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Tag } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import { claimBookingRequest, getBookingRequestPreview } from '@/services/contactsEdge';
import { persistBookingRequestDraft } from '@/lib/delegatedBookingSession';
import { persistGuestRecipientDraft } from '@/lib/guestRecipientBooking';
import type { BookingRequestRow } from '@roam/types/riderContacts';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function phoneDigitsFromE164(e164: string): string {
  return e164.replace(/\D/g, '').slice(-10);
}

function bookingRequestPreviewError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('consumed')) {
    return 'This link was already used — someone paid for the trip.';
  }
  if (lower.includes('expired')) {
    return 'This booking link has expired (links are valid for 12 hours).';
  }
  return message;
}

export default function RoamTagClaimPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<BookingRequestRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getBookingRequestPreview(token)
      .then((r) => setPreview(r.booking_request))
      .catch((e) => {
        const message = bookingRequestPreviewError(
          e instanceof Error ? e.message : 'Tag not found',
        );
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleClaim = async () => {
    if (!token || !preview) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate(`/login?return=${encodeURIComponent(`/tag/${token}`)}`);
      return;
    }
    setClaiming(true);
    try {
      const { booking_request } = await claimBookingRequest(token);
      const phoneDigits = phoneDigitsFromE164(booking_request.requester_phone);

      persistBookingRequestDraft({
        bookingRequestId: booking_request.id,
        token,
        requesterName: booking_request.requester_name,
        requesterPhone: booking_request.requester_phone,
        pickup:
          booking_request.pickup_lat != null &&
          booking_request.pickup_lng != null &&
          booking_request.pickup_address
            ? {
                lat: booking_request.pickup_lat,
                lng: booking_request.pickup_lng,
                address: booking_request.pickup_address,
              }
            : undefined,
        dropoff:
          booking_request.dropoff_lat != null &&
          booking_request.dropoff_lng != null &&
          booking_request.dropoff_address
            ? {
                lat: booking_request.dropoff_lat,
                lng: booking_request.dropoff_lng,
                address: booking_request.dropoff_address,
              }
            : undefined,
        vehicleOption: booking_request.vehicle_option ?? undefined,
      });

      persistGuestRecipientDraft({
        fullName: booking_request.requester_name,
        phone: phoneDigits,
        countryCode: '+1',
      });

      toast.success(`Ready to book for ${booking_request.requester_name}`);
      navigate('/');
    } catch (e) {
      toast.error(bookingRequestPreviewError(e instanceof Error ? e.message : 'Could not claim tag'));
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading Roam Tag…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <header className="sticky top-0 z-10 flex h-16 items-center px-4 safe-t" style={{ backgroundColor: PAGE_BG }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 pb-10 safe-x">
        <div
          className="space-y-6 rounded-[28px] p-6 text-center"
          style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
        >
          <div
            className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: 'rgba(0, 74, 198, 0.1)', color: PRIMARY }}
          >
            <Tag className="h-7 w-7" aria-hidden />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
              Roam Tag
            </h1>
            {preview ? (
              <>
                <p className="text-base" style={{ color: ON_SURFACE }}>
                  <span className="font-semibold">{preview.requester_name}</span> asked you to book
                  and pay for their ride.
                </p>
                {preview.pickup_address ? (
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    Pickup: {preview.pickup_address}
                  </p>
                ) : null}
                {preview.dropoff_address ? (
                  <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                    Drop-off: {preview.dropoff_address}
                  </p>
                ) : null}
                <p className="pt-1 text-xs font-bold tracking-[0.25em]" style={{ color: PRIMARY }}>
                  {preview.public_code}
                </p>
              </>
            ) : (
              <p style={{ color: ON_SURFACE_VARIANT }}>
                {loadError ?? 'This Roam Tag is unavailable or has expired.'}
              </p>
            )}
          </div>

          {preview ? (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void handleClaim()}
              className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              {claiming ? 'Preparing…' : `Book for ${preview.requester_name}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="h-14 w-full rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
            >
              Go to home
            </button>
          )}

          {preview ? (
            <p className="text-xs leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
              Ride updates will be sent to the phone number they provided.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
