import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Tag } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import type {
  BookingRequestPreviewRow,
  BookingRequestRequesterPreview,
} from '@roam/types/riderContacts';
import { claimBookingRequest, getBookingRequestPreview } from '@/services/contactsEdge';
import { persistBookingRequestDraft } from '@/lib/delegatedBookingSession';
import { persistGuestRecipientDraft } from '@/lib/guestRecipientBooking';
import { formatRoamTagDisplay } from '@/services/roamTagEdge';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
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

function RequesterAvatar({
  requester,
}: {
  requester: BookingRequestRequesterPreview;
}) {
  const initials = requester.first_name.slice(0, 1).toUpperCase() || '?';
  if (requester.avatar_url) {
    return (
      <img
        src={requester.avatar_url}
        alt=""
        className="h-20 w-20 rounded-full object-cover"
        style={{ boxShadow: '0 0 0 4px rgba(0, 74, 198, 0.12)' }}
      />
    );
  }
  return (
    <div
      className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold"
      style={{ backgroundColor: 'rgba(0, 74, 198, 0.12)', color: PRIMARY }}
    >
      {initials}
    </div>
  );
}

export default function RoamTagClaimPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<BookingRequestPreviewRow | null>(null);
  const [requester, setRequester] = useState<BookingRequestRequesterPreview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getBookingRequestPreview(token)
      .then((r) => {
        setPreview(r.booking_request);
        setRequester(r.requester);
      })
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
    if (!token || !preview || !requester) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigate(`/login?return=${encodeURIComponent(`/tag/${token}`)}`);
      return;
    }
    setClaiming(true);
    try {
      const { booking_request, requester: claimedRequester } = await claimBookingRequest(token);
      const phoneDigits = phoneDigitsFromE164(booking_request.requester_phone);

      persistBookingRequestDraft({
        bookingRequestId: booking_request.id,
        token,
        requesterName: booking_request.requester_name,
        requesterFirstName: claimedRequester.first_name,
        requesterTag: claimedRequester.custom_tag_name,
        requesterAvatarUrl: claimedRequester.avatar_url,
        requesterPhone: booking_request.requester_phone,
        pickup:
          booking_request.pickup_lat != null && booking_request.pickup_lng != null
            ? { lat: booking_request.pickup_lat, lng: booking_request.pickup_lng }
            : undefined,
        dropoff:
          booking_request.dropoff_lat != null && booking_request.dropoff_lng != null
            ? { lat: booking_request.dropoff_lat, lng: booking_request.dropoff_lng }
            : undefined,
        vehicleOption: booking_request.vehicle_option ?? undefined,
      });

      persistGuestRecipientDraft({
        fullName: booking_request.requester_name,
        phone: phoneDigits,
        countryCode: '+1',
      });

      toast.success(`Ready to book for ${claimedRequester.first_name}`);
      navigate('/');
    } catch (e) {
      toast.error(bookingRequestPreviewError(e instanceof Error ? e.message : 'Could not claim tag'));
    } finally {
      setClaiming(false);
    }
  };

  const displayTag = requester?.custom_tag_name
    ? formatRoamTagDisplay(requester.custom_tag_name)
    : null;

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
          {preview && requester ? (
            <>
              <RequesterAvatar requester={requester} />

              <div className="space-y-2">
                <h1 className="text-2xl font-bold" style={{ color: ON_SURFACE }}>
                  {requester.first_name}
                </h1>
                {displayTag ? (
                  <p className="text-lg font-semibold" style={{ color: PRIMARY }}>
                    {displayTag}
                  </p>
                ) : null}
                <p className="text-base leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
                  asked you to book and pay for their Roam ride.
                </p>
              </div>

              {preview.has_trip_route ? (
                <div
                  className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm"
                  style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
                >
                  <Lock className="h-4 w-4 shrink-0" aria-hidden />
                  Their pickup and destination stay private until the driver arrives.
                </div>
              ) : null}

              <button
                type="button"
                disabled={claiming}
                onClick={() => void handleClaim()}
                className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
              >
                {claiming ? 'Preparing…' : `Book for ${requester.first_name}`}
              </button>

              <p className="text-xs leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
                Pay digitally (card or wallet). Cash is not available for Roam Tag trips.
              </p>
            </>
          ) : (
            <>
              <div
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ backgroundColor: 'rgba(0, 74, 198, 0.1)', color: PRIMARY }}
              >
                <Tag className="h-7 w-7" aria-hidden />
              </div>
              <p style={{ color: ON_SURFACE_VARIANT }}>
                {loadError ?? 'This Roam Tag is unavailable or has expired.'}
              </p>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="h-14 w-full rounded-2xl text-lg font-semibold"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                Go to home
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
