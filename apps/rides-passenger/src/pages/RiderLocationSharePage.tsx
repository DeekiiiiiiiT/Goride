import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { supabase } from '@roam/auth-client';
import {
  declinePickupLocation,
  getPickupLocationRequestPreview,
  sharePickupLocation,
} from '@/services/pickupLocationRequestEdge';
import {
  getCurrentPositionWithAccuracy,
  resolveAddressFromCoordinates,
} from '@/services/locationService';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  ON_PRIMARY,
} from '@/lib/passengerTheme';

type Phase = 'loading' | 'consent' | 'sharing' | 'success' | 'declined' | 'unavailable';

export default function RiderLocationSharePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [bookerName, setBookerName] = useState<string | null>(null);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [sharedAddress, setSharedAddress] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getPickupLocationRequestPreview(token)
      .then((r) => {
        setBookerName(r.preview.booker_name);
        setRiderName(r.preview.rider_name);
        setPhoneMasked(r.preview.phone_masked ?? null);
        if (r.preview.status === 'shared') {
          setPhase('success');
          return;
        }
        if (r.preview.status !== 'pending') {
          setPhase('unavailable');
          return;
        }
        setPhase('consent');
      })
      .catch((e) => {
        setPhase('unavailable');
        toast.error(e instanceof Error ? e.message : 'This link is invalid or expired.');
      });
  }, [token]);

  const handleShare = async () => {
    if (!token) return;
    setPhase('sharing');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate(`/login?return=${encodeURIComponent(`/location-share/${token}`)}`);
        setPhase('consent');
        return;
      }

      const position = await getCurrentPositionWithAccuracy();
      const address = await resolveAddressFromCoordinates(position.lat, position.lng);
      const res = await sharePickupLocation(token, {
        pickup_lat: position.lat,
        pickup_lng: position.lng,
        pickup_address: address,
        accuracy_meters: position.accuracyMeters ?? null,
      });
      setSharedAddress(res.request.pickup_address ?? address);
      setPhase('success');
      toast.success('Location shared');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not share location';
      if (message.includes('phone_mismatch')) {
        toast.error('Sign in with the phone number this request was sent to.');
      } else if (/denied|permission|blocked/i.test(message)) {
        toast.error('Enable location in your device settings, then try again.');
      } else {
        toast.error(message);
      }
      setPhase('consent');
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    setDeclining(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        navigate(`/login?return=${encodeURIComponent(`/location-share/${token}`)}`);
        return;
      }
      await declinePickupLocation(token);
      setPhase('declined');
      toast.message('Location request declined');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not decline request');
    } finally {
      setDeclining(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center gap-2" style={{ backgroundColor: PAGE_BG }}>
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: PRIMARY }} />
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading…</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center px-6 safe-x"
      style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}
    >
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ backgroundColor: 'rgba(0,74,198,0.1)' }}>
          <MapPin className="h-7 w-7" style={{ color: PRIMARY }} aria-hidden />
        </div>

        {phase === 'consent' || phase === 'sharing' ? (
          <>
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Share pickup location</h1>
            <p className="text-lg">
              {bookerName ?? 'Someone'} needs your current location for a Roam pickup
              {riderName ? ` (${riderName})` : ''}.
            </p>
            {phoneMasked ? (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Sign in with {phoneMasked} to share your location.
              </p>
            ) : null}
            <button
              type="button"
              disabled={phase === 'sharing'}
              onClick={() => void handleShare()}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-lg font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              {phase === 'sharing' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Navigation className="h-5 w-5" aria-hidden />
              )}
              {phase === 'sharing' ? 'Sharing…' : 'Share my location'}
            </button>
            <button
              type="button"
              disabled={declining || phase === 'sharing'}
              onClick={() => void handleDecline()}
              className="w-full text-sm font-medium disabled:opacity-50"
              style={{ color: ON_SURFACE_VARIANT }}
            >
              {declining ? 'Declining…' : 'Not now'}
            </button>
          </>
        ) : null}

        {phase === 'success' ? (
          <>
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Location shared</h1>
            <p style={{ color: ON_SURFACE_VARIANT }}>
              {bookerName ?? 'The booker'} can use your pickup location to book the ride.
            </p>
            {sharedAddress ? (
              <p className="text-sm font-medium">{sharedAddress}</p>
            ) : null}
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="h-14 w-full rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Done
            </button>
          </>
        ) : null}

        {phase === 'declined' ? (
          <>
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Request declined</h1>
            <p style={{ color: ON_SURFACE_VARIANT }}>
              You chose not to share your location. The booker can enter the pickup manually.
            </p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="h-14 w-full rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Back to home
            </button>
          </>
        ) : null}

        {phase === 'unavailable' ? (
          <>
            <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Link unavailable</h1>
            <p style={{ color: ON_SURFACE_VARIANT }}>
              This location request has expired or is no longer active.
            </p>
            <button
              type="button"
              onClick={() => navigate('/', { replace: true })}
              className="h-14 w-full rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Back to home
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
