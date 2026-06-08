import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@roam/auth-client';
import { claimPassengerAuthorization, getPassengerAuthorizationPreview } from '@/services/contactsEdge';
import { ON_SURFACE, ON_SURFACE_VARIANT, PAGE_BG, PRIMARY, PRIMARY_CONTAINER, ON_PRIMARY } from '@/lib/passengerTheme';

export default function PassengerAuthorizePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof getPassengerAuthorizationPreview>
  >['authorization'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) return;
    void getPassengerAuthorizationPreview(token)
      .then((r) => setPreview(r.authorization))
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Authorization not found'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user || !token) return;
      setClaiming(true);
      try {
        await claimPassengerAuthorization(token);
        toast.success('You are linked as the passenger. The booker can continue.');
        navigate('/', { replace: true });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not complete authorization');
      } finally {
        setClaiming(false);
      }
    })();
  }, [token, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ backgroundColor: PAGE_BG }}>
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
        <h1 className="text-2xl font-bold" style={{ color: PRIMARY }}>Ride authorization</h1>
        {preview ? (
          <>
            <p className="text-lg">
              Hi {preview.recipient_name}, someone wants to book a Roam ride for you.
            </p>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Sign in with {preview.phone_masked} to authorize the booking.
            </p>
          </>
        ) : (
          <p style={{ color: ON_SURFACE_VARIANT }}>This link is invalid or expired.</p>
        )}
        <button
          type="button"
          disabled={claiming || !preview}
          onClick={() => navigate(`/login?return=${encodeURIComponent(`/ride/authorize/${token}`)}`)}
          className="h-14 w-full rounded-2xl text-lg font-semibold disabled:opacity-50"
          style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
        >
          {claiming ? 'Authorizing…' : 'Continue with Roam'}
        </button>
      </div>
    </div>
  );
}
