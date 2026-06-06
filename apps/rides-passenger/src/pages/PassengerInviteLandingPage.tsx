import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import { claimPassengerInvite, getPassengerInvitePreview } from '@/services/contactsEdge';
import { persistInviteReturnToken, clearInviteReturnToken, readInviteReturnToken } from '@/lib/delegatedBookingSession';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY } from '@/lib/passengerTheme';

export default function PassengerInviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof getPassengerInvitePreview>>['invite'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    persistInviteReturnToken(token);
    void getPassengerInvitePreview(token)
      .then((r) => setPreview(r.invite))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Invite not found'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const inviteToken = token ?? readInviteReturnToken();
      if (!session?.user || !inviteToken) return;
      setClaiming(true);
      try {
        const res = await claimPassengerInvite(inviteToken);
        clearInviteReturnToken();
        toast.success('You can now track your ride.');
        navigate(`/ride/${res.ride_id}`, { replace: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not claim invite');
      } finally {
        setClaiming(false);
      }
    })();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
        <p style={{ color: ON_SURFACE_VARIANT }}>Loading invite…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 safe-x" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Your Roam ride</h1>
        {preview ? (
          <>
            <p className="text-lg">Hi {preview.guest_name ?? 'there'}, a ride has been booked for you.</p>
            {preview.pickup_address ? (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Pickup: {preview.pickup_address}</p>
            ) : null}
            {preview.dropoff_address ? (
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>Drop-off: {preview.dropoff_address}</p>
            ) : null}
          </>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>This invite is invalid or expired.</p>
        )}
        <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          Sign in or create a Roam account with {preview?.phone_masked ?? 'your phone'} to track the ride and chat with your driver.
        </p>
        <button
          type="button"
          disabled={claiming || !preview}
          onClick={() => navigate(`/login?return=${encodeURIComponent(`/ride/join/${token}`)}`)}
          className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          {claiming ? 'Joining ride…' : 'Continue with Roam'}
        </button>
      </div>
    </div>
  );
}
