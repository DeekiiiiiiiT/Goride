import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import { claimBookingRequest, getBookingRequestPreview } from '@/services/contactsEdge';
import { persistBookingRequestDraft } from '@/lib/delegatedBookingSession';
import type { BookingRequestRow } from '@roam/types/riderContacts';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY } from '@/lib/passengerTheme';

export default function RoamTagClaimPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<BookingRequestRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getBookingRequestPreview(token)
      .then((r) => setPreview(r.booking_request))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Tag not found'))
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
      persistBookingRequestDraft({
        bookingRequestId: booking_request.id,
        token,
        requesterName: preview.requester_name,
        requesterPhone: preview.requester_phone,
        pickup: preview.pickup_lat != null && preview.pickup_lng != null && preview.pickup_address
          ? { lat: preview.pickup_lat, lng: preview.pickup_lng, address: preview.pickup_address }
          : undefined,
        dropoff: preview.dropoff_lat != null && preview.dropoff_lng != null && preview.dropoff_address
          ? { lat: preview.dropoff_lat, lng: preview.dropoff_lng, address: preview.dropoff_address }
          : undefined,
        vehicleOption: preview.vehicle_option ?? undefined,
      });
      toast.success(`Ready to book for ${preview.requester_name}`);
      navigate('/');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not claim tag');
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 safe-x" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Book a ride</h1>
        {preview ? (
          <>
            <p className="text-lg">{preview.requester_name} asked you to book their ride.</p>
            {preview.pickup_address ? <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Pickup: {preview.pickup_address}</p> : null}
            {preview.dropoff_address ? <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Drop-off: {preview.dropoff_address}</p> : null}
            <p className="text-xs tracking-widest" style={{ color: ON_SURFACE_VARIANT }}>CODE {preview.public_code}</p>
          </>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>This Roam Tag is unavailable.</p>
        )}
        <button
          type="button"
          disabled={claiming || !preview}
          onClick={() => void handleClaim()}
          className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          {claiming ? 'Preparing…' : 'Book and pay'}
        </button>
      </div>
    </div>
  );
}
